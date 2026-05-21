import {
  renderCollectionListPage,
  renderHomePage,
  renderRecordDetailPage,
  saveSchemaUiRecord,
} from './cms-ssr.mjs';
import { readManifest, renderSchemaUiHtml } from './render-admin.mjs';

/**
 * Handles Schema UI SSR routes (`/`, `/templates`, `/cms/...`).
 * Returns true when the response was fully handled (including SSR 404s).
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {{ cwd: string; db: object; manifestUrl: URL }} context
 */
export async function handleSchemaUiSsrRequest(request, response, context) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return false;
  }

  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/', `http://${host}`);
  const route = parsePath(url.pathname);

  if (!route) {
    return false;
  }

  try {
    const { db, manifestUrl } = context;
    const manifest = await readManifest(manifestUrl);

    if (route.type === 'templates') {
      const html = renderSchemaUiHtml(manifest);
      sendHtml(response, html);
      return true;
    }

    if (request.method === 'POST' && route.type === 'detail') {
      const body = await readFormBody(request);
      const saved = await saveSchemaUiRecord(db, manifest, route.collection, route.id, body);
      if (!saved) {
        response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><meta charset="utf-8"><title>404</title><p>Record not found</p>');
        return true;
      }

      response.writeHead(303, {
        location: `/cms/${encodeURIComponent(route.collection)}/${encodeURIComponent(route.id)}`,
        'cache-control': 'no-store',
      });
      response.end();
      return true;
    }

    if (request.method !== 'GET') {
      return false;
    }

    const recordsByCollection = await loadRecordsByCollection(db, manifest);

    if (route.type === 'home') {
      sendHtml(response, renderHomePage(manifest, recordsByCollection));
      return true;
    }

    if (route.type === 'list') {
      const html = renderCollectionListPage(manifest, route.collection, recordsByCollection[route.collection] ?? []);
      if (!html) {
        response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><meta charset="utf-8"><title>404</title><p>Unknown collection</p>');
        return true;
      }
      sendHtml(response, html);
      return true;
    }

    const record = await db.collection(route.collection).get(route.id);
    const html = renderRecordDetailPage(manifest, route.collection, record, recordsByCollection);
    if (!html) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><meta charset="utf-8"><title>404</title><p>Record not found</p>');
      return true;
    }

    sendHtml(response, html);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(message);
    return true;
  }
}

async function readFormBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function parsePath(pathname) {
  const normalized = pathname === '' ? '/' : pathname;
  if (normalized === '/' || normalized === '/index.html') {
    return { type: 'home' };
  }

  if (normalized === '/templates') {
    return { type: 'templates' };
  }

  const segments = normalized.replace(/^\/+|\/+$/gu, '').split('/').filter(Boolean);
  if (segments[0] === 'cms' && segments.length === 2) {
    return { type: 'list', collection: segments[1] };
  }

  if (segments[0] === 'cms' && segments.length === 3) {
    return { type: 'detail', collection: segments[1], id: decodeURIComponent(segments[2]) };
  }

  return null;
}

async function loadRecordsByCollection(db, manifest) {
  /** @type {Record<string, unknown[]>} */
  const out = {};

  for (const name of Object.keys(manifest.collections ?? {})) {
    const meta = manifest.collections[name];
    if (meta?.kind !== 'collection') {
      continue;
    }

    out[name] = await db.collection(name).all();
  }

  return out;
}
