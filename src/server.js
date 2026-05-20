import http from 'node:http';
import { watch } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { openDb } from './db.js';
import { serializeError } from './errors.js';
import { loadForkDb } from './features/config/forks.js';
import { defaultHttpFeatureRegistry } from './features/http/registry.js';
import { executeGraphql } from './graphql/index.js';
import { runMockBehavior } from './mock.js';
import { handleRestRequest, readJsonBody, sendJson } from './rest/handler.js';
import { operationRequest } from './shared/operations.js';
import { dbError } from './errors.js';
import { syncDb } from './sync.js';
import { createRequestTrace, tracePhase, tracePhaseSync } from './tracing.js';

export async function startDbServer(options = {}) {
  const db = await openDb({
    ...options,
    allowSourceErrors: true,
  });
  const host = options.host ?? db.config.server?.host ?? '127.0.0.1';
  const port = Number(options.port ?? db.config.server?.port ?? 7331);
  const events = createViewerEventHub();
  const requestHandler = createDbRequestHandler(db, {
    events,
    rootRoutes: true,
  });
  let watcher;
  const server = http.createServer((request, response) => {
    requestHandler(request, response).catch((error) => {
      sendJson(response, error.status ?? 500, serializeError(error, 'SERVER_ERROR'));
    });
  });
  server.once('close', () => {
    watcher?.close();
    events.close();
    void db.close?.();
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
    watcher = await watchSourceDir(db, events);
  } catch (error) {
    events.close();
    try {
      server.close();
    } catch {
      // The server may not have reached the listening state.
    }
    throw error;
  }

  const address = server.address();
  const boundPort = address && typeof address === 'object' ? address.port : port;

  return {
    server,
    db,
    url: `http://${host}:${boundPort}`,
  };
}

export function createDbRequestHandler(db, options = {}) {
  const events = options.events ?? createViewerEventHub();
  const routes = resolveRequestRoutes(db.config, options);

  return async function dbRequestHandler(request, response, next) {
    const trace = createRequestTrace(db, request, { trace: options.trace });
    let handled = false;
    try {
      handled = await handleRequest(db, request, response, events, routes, trace);
      if (!handled && typeof next === 'function') {
        next();
      }
      return handled;
    } catch (error) {
      trace?.setError(error);
      throw error;
    } finally {
      trace?.finish(db, response);
    }
  };
}

async function handleRequest(db, request, response, events, routes, trace = null) {
  const url = new URL(request.url, 'http://db.local');
  const forkName = tracePhaseSync(trace, 'route-match', () => forkNameForRequest(url, routes), {
    family: 'fork',
  });
  if (forkName) {
    trace?.markHandled(response);
    trace?.setRoute({ route: 'fork', fork: forkName });
    try {
      const forkDb = await tracePhase(trace, 'fork-load', () => loadForkDb(db, forkName, openDb), {
        fork: forkName,
      });
      const forkRoutes = resolveRequestRoutes(forkDb.config, {
        ...routes,
        apiBase: forkApiBase(routes, forkName),
        rootRoutes: false,
        restBasePath: `${forkApiBase(routes, forkName)}/rest`,
        graphqlPath: `${forkApiBase(routes, forkName)}/graphql`,
        manifestPath: `${forkApiBase(routes, forkName)}/manifest`,
        manifestJsonPath: `${forkApiBase(routes, forkName)}/manifest.json`,
        manifestHtmlPath: `${forkApiBase(routes, forkName)}/manifest.html`,
        manifestMarkdownPath: `${forkApiBase(routes, forkName)}/manifest.md`,
      });
      return tracePhase(trace, 'fork-dispatch', () => handleRequest(forkDb, request, response, events, forkRoutes, trace), {
        fork: forkName,
      });
    } catch (error) {
      trace?.setError(error);
      sendJson(response, error.status ?? 500, serializeError(error, 'SERVER_ERROR'));
      return true;
    }
  }

  if (request.method === 'GET' && url.pathname === routes.eventsPath) {
    trace?.markHandled(response);
    trace?.setRoute({ route: 'events', operation: 'subscribe' });
    events.subscribe(request, response, db);
    return true;
  }

  const operationHash = tracePhaseSync(trace, 'route-match', () => operationHashForRequest(url, routes), {
    family: 'operation',
  });
  if (operationHash) {
    trace?.markHandled(response);
    trace?.setRoute({ route: 'operation', operation: 'execute', id: operationHash });
    await handleRegisteredOperationRequest(db, request, response, operationHash, routes, trace);
    return true;
  }

  const exposureViolation = tracePhaseSync(trace, 'route-exposure', () => routeExposureViolation(db.config, url, routes));
  if (exposureViolation) {
    trace?.markHandled(response);
    trace?.setRoute({ route: exposureViolation.kind, operation: 'exposure-check' });
    sendRouteExposureViolation(response, exposureViolation, routes);
    return true;
  }

  const httpFeatures = defaultHttpFeatureRegistry();
  const featureContext = { db, request, response, url, routes };
  if (httpFeatures.matches(featureContext, { phase: 'preMock' })) {
    trace?.markHandled(response);
    trace?.setRoute(featureTraceRoute(url, routes));
    await tracePhase(trace, 'registered-http-feature', () => httpFeatures.handle(featureContext, { phase: 'preMock' }), {
      phase: 'preMock',
    });
    return true;
  }

  const restUrl = tracePhaseSync(trace, 'route-match', () => restUrlForRequest(url, routes), {
    family: 'rest',
  });
  const handlesRegisteredFeature = httpFeatures.matches({ db, request, response, url, routes }, { phase: 'postMock' });
  if (!restUrl && !handlesRegisteredFeature) {
    return false;
  }

  if (restUrl && !handlesRegisteredFeature && db.config.rest?.enabled === false) {
    trace?.markHandled(response);
    await handleRestRequest(db, request, response, restUrl, { ...routes, trace });
    return true;
  }

  const mockResult = await tracePhase(trace, 'mock', () => runMockBehavior(db.config, url));
  if (mockResult) {
    trace?.markHandled(response);
    trace?.setRoute({ route: restUrl ? 'rest' : 'mock', operation: 'mock', shortCircuit: true });
    sendJson(response, mockResult.status, mockResult.body);
    return true;
  }

  if (handlesRegisteredFeature) {
    trace?.markHandled(response);
    trace?.setRoute(featureTraceRoute(url, routes));
    await tracePhase(trace, 'registered-http-feature', () => httpFeatures.handle(featureContext, { phase: 'postMock' }), {
      phase: 'postMock',
    });
    return true;
  }

  trace?.markHandled(response);
  await tracePhase(trace, 'rest-handler', () => handleRestRequest(db, request, response, restUrl, { ...routes, trace }));
  return true;
}

async function handleRegisteredOperationRequest(db, request, response, hash, routes, trace = null) {
  if (db.config.operations?.enabled !== true) {
    sendJson(response, 404, {
      error: {
        code: 'OPERATIONS_DISABLED',
        message: 'Registered operations are not enabled.',
        hint: 'Set operations.enabled to true and provide operations.registry or operations.outFile.',
      },
    });
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, {
      error: {
        code: 'OPERATION_METHOD_NOT_ALLOWED',
        message: 'Registered operations must be executed with POST.',
        hint: `Use POST ${joinPaths(routes.apiBase || '', `/operations/${encodeURIComponent(hash)}`)} with a JSON variables body.`,
        details: {
          method: request.method,
          hash,
        },
      },
    });
    return;
  }

  const body = await tracePhase(trace, 'registered-operation-body', () => readJsonBody(request, {
    maxBytes: Number(db.config.server?.maxBodyBytes ?? 1048576),
  }));
  const operation = await tracePhase(trace, 'registered-operation-lookup', () => operationForRef(db.config, hash), {
    hash,
  });
  if (!operation) {
    throw dbError(
      'OPERATION_NOT_FOUND',
      `Unknown registered operation "${decodeURIComponent(hash)}".`,
      {
        status: 404,
        hint: 'Register the operation name or hash in operations.registry, or generate an operations manifest.',
        details: { ref: decodeURIComponent(hash) },
      },
    );
  }

  const operationResult = tracePhaseSync(trace, 'registered-operation-execution', () => operationRequest(operation, body?.variables ?? {}), {
    hash,
  });
  if (operationResult.kind === 'graphql') {
    if (db.config.graphql?.enabled === false) {
      sendJson(response, 404, {
        error: {
          code: 'GRAPHQL_DISABLED',
          message: 'GraphQL endpoint is disabled.',
          hint: 'Set graphql.enabled to true in db.config.mjs to enable registered GraphQL operations.',
          details: {
            graphqlEnabled: false,
            hash,
          },
        },
      });
      return;
    }

    const result = await tracePhase(trace, 'graphql-handler', () => executeGraphql(db, {
      query: operationResult.query,
      variables: operationResult.variables,
      operationName: operationResult.operationName,
    }), {
      hash,
    });
    sendJson(response, 200, result);
    return;
  }

  const restRequest = operationResult;
  const restUrl = new URL(restRequest.path, 'http://db.local');
  await tracePhase(trace, 'rest-handler', () => handleRestRequest(db, internalRestRequest(restRequest), response, restUrl, { ...routes, trace }));
}

async function operationForRef(config, hash) {
  const registry = await operationRegistry(config);
  const decoded = decodeURIComponent(hash);
  return registry[hash]
    ?? registry[decoded]
    ?? Object.values(registry).find((operation) => operation?.name === decoded);
}

async function operationRegistry(config) {
  if (config.operations?.registry && Object.keys(config.operations.registry).length > 0) {
    return config.operations.registry;
  }

  if (!config.operations?.outFile) {
    return {};
  }

  try {
    const manifest = JSON.parse(await readFile(config.operations.outFile, 'utf8'));
    return manifest.operations ?? {};
  } catch {
    return {};
  }
}

function internalRestRequest(restRequest) {
  return {
    method: restRequest.method,
    headers: {
      'content-type': 'application/json',
    },
    async *[Symbol.asyncIterator]() {
      if (restRequest.body !== undefined) {
        yield Buffer.from(JSON.stringify(restRequest.body));
      }
    },
  };
}

export async function reloadDb(db) {
  const project = await syncDb(db.config, { allowErrors: true });
  db.resources = new Map(project.resources.map((resource) => [resource.name, resource]));
  db.diagnostics = project.diagnostics;
  db.schemaVersion = Date.now();
  return project;
}

export async function watchSourceDir(db, events, options = {}) {
  await mkdir(db.config.sourceDir, { recursive: true });

  let timer;
  let enabled = true;
  const watchImpl = options.watch ?? watch;
  const warn = options.warn ?? ((message) => console.warn(message));
  let watcher;

  try {
    watcher = watchImpl(db.config.sourceDir, { recursive: true }, (_event, filename) => {
      if (!enabled || shouldIgnoreSourceEvent(db, filename)) {
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const project = await reloadDb(db);
          events.publish({
            type: project.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'synced-with-errors' : 'synced',
            version: db.schemaVersion,
            diagnostics: project.diagnostics,
          });
        } catch (error) {
          const diagnostic = {
            code: 'SERVER_SOURCE_RELOAD_FAILED',
            severity: 'error',
            message: error.message,
            hint: 'Fix the source file and db will try to reload it on the next change.',
          };
          db.diagnostics = [diagnostic];
          db.schemaVersion = Date.now();
          events.publish({
            type: 'sync-error',
            version: db.schemaVersion,
            diagnostics: db.diagnostics,
          });
        }
      }, 75);
    });
  } catch (error) {
    enabled = false;
    reportWatchUnavailable(db, events, error, warn);
    return {
      enabled,
      close() {
        clearTimeout(timer);
      },
    };
  }

  watcher.on?.('error', (error) => {
    if (!enabled) {
      return;
    }

    enabled = false;
    clearTimeout(timer);
    try {
      watcher.close();
    } catch {
      // The watcher may already be closed by the runtime.
    }
    reportWatchUnavailable(db, events, error, warn);
  });

  return {
    get enabled() {
      return enabled;
    },
    close() {
      enabled = false;
      clearTimeout(timer);
      try {
        watcher.close();
      } catch {
        // The watcher may already be closed after an error event.
      }
    },
  };
}

function reportWatchUnavailable(db, events, error, warn) {
  const diagnostic = {
    code: 'SERVER_WATCH_UNAVAILABLE',
    severity: 'warn',
    message: `File watching is disabled: ${error.message}`,
    hint: 'async-db serve is still running, but fixture changes will require restarting the server.',
    details: {
      code: error.code,
    },
  };

  db.diagnostics = [...(db.diagnostics ?? []), diagnostic];
  db.schemaVersion = Date.now();
  events.publish({
    type: 'watch-disabled',
    version: db.schemaVersion,
    diagnostics: db.diagnostics,
  });
  warn(`async-db serve: file watching disabled (${error.message}). Restart the server to pick up fixture changes.`);
}

function shouldIgnoreSourceEvent(db, filename) {
  if (!filename) {
    return false;
  }

  const relativePath = path.normalize(String(filename));
  if (relativePath.split(path.sep).some((part) => part.startsWith('.'))) {
    return true;
  }

  const absolutePath = path.join(db.config.sourceDir, relativePath);
  const relativeStatePath = path.relative(db.config.stateDir, absolutePath);
  return relativeStatePath === '' || (!relativeStatePath.startsWith('..') && !path.isAbsolute(relativeStatePath));
}

export function createViewerEventHub() {
  const clients = new Set();

  return {
    subscribe(request, response, db) {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });
      response.write(': connected\n\n');
      writeViewerEvent(response, {
        type: 'connected',
        version: db.schemaVersion,
        diagnostics: db.diagnostics ?? [],
      });
      clients.add(response);
      request.on('close', () => {
        clients.delete(response);
      });
    },
    publish(payload) {
      for (const response of clients) {
        writeViewerEvent(response, payload);
      }
    },
    close() {
      for (const response of clients) {
        response.end();
      }
      clients.clear();
    },
  };
}

function writeViewerEvent(response, payload) {
  response.write(`event: db\ndata: ${JSON.stringify(payload)}\n\n`);
}

function resolveRequestRoutes(config, options) {
  const apiBase = normalizeBasePath(options.apiBase ?? config.server?.apiBase ?? '/__db');
  const restBasePath = options.restBasePath === undefined
    ? `${apiBase}/rest`
    : normalizeOptionalBasePath(options.restBasePath);
  const dataPath = options.dataPath === undefined
    ? normalizeOptionalBasePath(config.server?.dataPath ?? '/db')
    : normalizeOptionalBasePath(options.dataPath);
  const graphqlPath = normalizeBasePath(options.graphqlPath ?? config.graphql?.path ?? '/graphql');

  return {
    apiBase,
    rootRoutes: options.rootRoutes !== false,
    restBasePath,
    dataPath,
    graphqlPath,
    viewerPath: apiBase,
    manifestPath: `${apiBase}/manifest`,
    manifestJsonPath: `${apiBase}/manifest.json`,
    manifestHtmlPath: `${apiBase}/manifest.html`,
    manifestMarkdownPath: `${apiBase}/manifest.md`,
    schemaPath: `${apiBase}/schema`,
    batchPath: `${apiBase}/batch`,
    importPath: `${apiBase}/import`,
    eventsPath: `${apiBase}/events`,
    logPath: `${apiBase}/log`,
  };
}

function forkNameForRequest(url, routes) {
  const prefix = `${routes.apiBase || ''}/forks/` || '/forks/';
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }

  const [rawName] = url.pathname.slice(prefix.length).split('/');
  return rawName ? decodeURIComponent(rawName) : null;
}

function forkApiBase(routes, forkName) {
  return joinPaths(routes.apiBase || '', `/forks/${encodeURIComponent(forkName)}`);
}

function operationHashForRequest(url, routes) {
  const prefix = `${joinPaths(routes.apiBase || '', '/operations')}/`;
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }

  const [hash] = url.pathname.slice(prefix.length).split('/');
  return hash ? decodeURIComponent(hash) : null;
}

function routeExposureViolation(config, url, routes) {
  const kind = routeExposureKind(url, routes);
  if (!kind) {
    return null;
  }

  const exposure = config.server?.expose?.[kind] ?? 'open';
  if (routeExposureAllows(exposure)) {
    return null;
  }

  return {
    kind,
    exposure,
    path: url.pathname,
  };
}

function routeExposureKind(url, routes) {
  if (url.pathname === routes.graphqlPath) {
    return 'graphql';
  }

  if (url.pathname === routes.schemaPath) {
    return 'schema';
  }

  if (isManifestRoutePath(url.pathname, routes)) {
    return 'manifest';
  }

  if ([routes.viewerPath, routes.eventsPath, routes.logPath, routes.importPath].includes(url.pathname)) {
    return 'viewer';
  }

  if (isRestExposurePath(url, routes)) {
    return 'rest';
  }

  return null;
}

function isRestExposurePath(url, routes) {
  if (url.pathname === routes.batchPath) {
    return true;
  }

  if (routes.restBasePath && pathStartsWith(url.pathname, routes.restBasePath)) {
    return true;
  }

  if (routes.dataPath && pathStartsWith(url.pathname, routes.dataPath)) {
    return true;
  }

  return routes.rootRoutes === true;
}

function routeExposureAllows(exposure) {
  if (exposure === undefined || exposure === null || exposure === 'open') {
    return true;
  }

  if (exposure === 'dev') {
    return process.env.NODE_ENV !== 'production';
  }

  return false;
}

function sendRouteExposureViolation(response, violation, routes) {
  const label = routeExposureLabel(violation.kind);

  if (violation.kind === 'rest' && violation.exposure === 'registered-only') {
    sendJson(response, 403, {
      error: {
        code: 'REST_REGISTERED_ONLY',
        message: 'Raw REST routes are configured for registered operations only.',
        hint: `Use POST ${joinPaths(routes.apiBase || '', '/operations/{hash}')} with a registered operation hash.`,
        details: {
          path: violation.path,
          exposure: violation.exposure,
          route: violation.kind,
        },
      },
    });
    return;
  }

  if (violation.exposure === 'registered-only') {
    sendJson(response, 403, {
      error: {
        code: `${label.code}_REGISTERED_ONLY`,
        message: `${label.display} routes are configured for registered operations only.`,
        hint: `Set server.expose.${violation.kind} to "open" or "dev" when this route should be reachable.`,
        details: {
          path: violation.path,
          exposure: violation.exposure,
          route: violation.kind,
        },
      },
    });
    return;
  }

  if (violation.exposure === 'dev') {
    sendJson(response, 404, {
      error: {
        code: `${label.code}_DEV_ONLY`,
        message: `${label.display} routes are only exposed outside NODE_ENV=production.`,
        hint: `Set server.expose.${violation.kind} to "open" when this route should be reachable in production.`,
        details: {
          path: violation.path,
          exposure: violation.exposure,
          route: violation.kind,
        },
      },
    });
    return;
  }

  sendJson(response, 404, {
    error: {
      code: `${label.code}_DISABLED`,
      message: `${label.display} routes are disabled by server exposure policy.`,
      hint: `Set server.expose.${violation.kind} to "open" or "dev" when this route should be reachable.`,
      details: {
        path: violation.path,
        exposure: violation.exposure,
        route: violation.kind,
      },
    },
  });
}

function routeExposureLabel(kind) {
  const labels = {
    graphql: {
      code: 'GRAPHQL',
      display: 'GraphQL',
    },
    manifest: {
      code: 'MANIFEST',
      display: 'Manifest',
    },
    rest: {
      code: 'REST',
      display: 'REST',
    },
    schema: {
      code: 'SCHEMA',
      display: 'Schema',
    },
    viewer: {
      code: 'VIEWER',
      display: 'Viewer',
    },
  };
  return labels[kind] ?? {
    code: 'ROUTE',
    display: 'Route',
  };
}

function featureTraceRoute(url, routes) {
  if (url.pathname === routes.logPath) {
    return { route: 'runtime-log', operation: 'subscribe' };
  }
  if (url.pathname === routes.graphqlPath) {
    return { route: 'graphql', operation: 'execute' };
  }
  return { route: 'http-feature' };
}

function restUrlForRequest(url, routes) {
  if (routes.restBasePath && pathStartsWith(url.pathname, routes.restBasePath)) {
    return stripPathBase(url, routes.restBasePath);
  }

  if ([routes.viewerPath, routes.schemaPath, routes.batchPath, routes.importPath].includes(url.pathname) || isManifestRoutePath(url.pathname, routes)) {
    return url;
  }

  if (routes.dataPath && pathStartsWith(url.pathname, routes.dataPath)) {
    return stripPathBase(url, routes.dataPath);
  }

  if (routes.rootRoutes) {
    return url;
  }

  return null;
}

function isManifestRoutePath(pathname, routes) {
  if ([routes.manifestPath, routes.manifestJsonPath, routes.manifestHtmlPath, routes.manifestMarkdownPath].includes(pathname)) {
    return true;
  }

  if (!pathname.startsWith(`${routes.manifestPath}.`)) {
    return false;
  }

  const extension = pathname.slice(routes.manifestPath.length + 1);
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(extension);
}

function joinPaths(basePath, routePath) {
  const base = `/${String(basePath ?? '').replace(/^\/+/, '').replace(/\/+$/, '')}`;
  const route = `/${String(routePath ?? '').replace(/^\/+/, '')}`;
  if (base === '/') {
    return route;
  }
  return `${base}${route === '/' ? '' : route}`;
}

function stripPathBase(url, basePath) {
  const next = new URL(url.href);
  const stripped = next.pathname.slice(basePath.length);
  next.pathname = stripped.startsWith('/') ? stripped : `/${stripped}`;
  if (next.pathname === '/') {
    return next;
  }
  return next;
}

function normalizeOptionalBasePath(value) {
  return value === false || value === null
    ? null
    : normalizeBasePath(value);
}

function pathStartsWith(pathname, basePath) {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function normalizeBasePath(value) {
  const pathValue = `/${String(value ?? '').replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return pathValue === '/' ? '' : pathValue;
}
