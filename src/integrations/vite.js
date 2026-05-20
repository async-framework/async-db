import { openDb } from '../db.js';
import { serializeError } from '../errors.js';
import { createDbRequestHandler, createViewerEventHub, watchSourceDir } from '../server.js';
import { sendJson } from '../rest/handler.js';

const DEFAULT_VIRTUAL_CLIENT_MODULE = 'virtual:db/client';
const DEFAULT_CLIENT_IMPORT = '@async/db/client';

export function dbPlugin(options = {}) {
  const routes = resolveViteRoutes(options);
  const virtualModuleId = options.clientVirtualModule === false
    ? null
    : options.clientVirtualModule ?? DEFAULT_VIRTUAL_CLIENT_MODULE;
  const resolvedVirtualModuleId = virtualModuleId ? `\0${virtualModuleId}` : null;

  return {
    name: 'db:vite',
    apply: 'serve',

    async configureServer(server) {
      const db = await openDb({
        ...dbOptions(options),
        allowSourceErrors: true,
      });
      const events = createViewerEventHub();
      const watcher = await watchSourceDir(db, events, {
        warn(message) {
          server.config?.logger?.warn?.(message);
        },
      });
      const handler = createDbRequestHandler(db, {
        ...routes,
        events,
        trace: options.trace,
      });

      server.middlewares.use((request, response, next) => {
        return handler(request, response, next).catch((error) => {
          sendJson(response, error.status ?? 500, serializeError(error, 'SERVER_ERROR'));
        });
      });

      server.httpServer?.once?.('close', () => {
        watcher.close();
        events.close();
      });
    },

    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : null;
    },

    load(id) {
      if (id !== resolvedVirtualModuleId) {
        return null;
      }

      return renderVirtualClient(routes, options.clientImport ?? DEFAULT_CLIENT_IMPORT, options.clientCache);
    },
  };
}

function resolveViteRoutes(options) {
  const apiBase = normalizeBasePath(options.apiBase ?? options.server?.apiBase ?? '/__db');
  return {
    apiBase,
    dataPath: options.dataPath ?? options.server?.dataPath,
    rootRoutes: options.rootRoutes === true,
    restBasePath: normalizeBasePath(options.restBasePath ?? `${apiBase}/rest`),
    graphqlPath: normalizeBasePath(options.graphqlPath ?? `${apiBase}/graphql`),
  };
}

function renderVirtualClient(routes, clientImport, clientCache) {
  const forkBasePath = `${routes.apiBase || ''}/forks`;
  const cacheOption = serializeVirtualClientCache(clientCache);
  const defaultCacheLine = cacheOption ? `  cache: ${cacheOption},\n` : '';
  const forkCacheLine = cacheOption ? `    cache: ${cacheOption},\n` : '';
  return `import { createDbClient } from ${JSON.stringify(clientImport)};

export const client = createDbClient({
  manifestPath: ${JSON.stringify(`${routes.apiBase}/manifest.json`)},
  restBasePath: ${JSON.stringify(routes.restBasePath)},
  restBatchPath: ${JSON.stringify(`${routes.apiBase}/batch`)},
  graphqlPath: ${JSON.stringify(routes.graphqlPath)},
${defaultCacheLine}
});

export function fork(name) {
  const forkName = String(name ?? '');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(forkName)) {
    throw new Error(\`Invalid db fork name "\${forkName}". Use letters, numbers, underscores, or hyphens.\`);
  }

  const forkBase = \`${forkBasePath}/\${encodeURIComponent(forkName)}\`;
  return createDbClient({
    manifestPath: \`\${forkBase}/manifest.json\`,
    restBasePath: \`\${forkBase}/rest\`,
    restBatchPath: \`\${forkBase}/batch\`,
    graphqlPath: \`\${forkBase}/graphql\`,
${forkCacheLine}
  });
}

export const createForkClient = fork;
client.fork = fork;

export default client;
`;
}

function dbOptions(options) {
  const {
    apiBase,
    dataPath,
    rootRoutes,
    restBasePath,
    graphqlPath,
    trace,
    clientVirtualModule,
    clientImport,
    clientCache,
    ...db
  } = options;
  return db;
}

function serializeVirtualClientCache(value) {
  if (value === undefined || value === false) {
    return null;
  }
  if (value === true) {
    return 'true';
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const cache = {};
  if (value.enabled !== undefined) {
    cache.enabled = Boolean(value.enabled);
  }
  for (const key of ['readPolicy', 'writePolicy']) {
    if (typeof value[key] === 'string') {
      cache[key] = value[key];
    }
  }
  if (typeof value.eventPolicy === 'string' || value.eventPolicy === false) {
    cache.eventPolicy = value.eventPolicy;
  }
  return JSON.stringify(cache);
}

function normalizeBasePath(value) {
  const path = `/${String(value ?? '').replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return path === '/' ? '' : path;
}
