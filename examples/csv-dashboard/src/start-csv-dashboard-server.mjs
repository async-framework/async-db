import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../../src/index.js';
import { serializeError } from '../../../src/errors.js';
import { sendJson, sendText } from '../../../src/rest/handler.js';
import {
  createDbRequestHandler,
  createViewerEventHub,
  watchSourceDir,
} from '../../../src/server.js';
import { renderCsvDashboardHtml } from './dashboard-html.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runtime CSV dashboard demo: custom dashboard routes composed ahead of
 * the stock db REST / viewer stack.
 *
 * @param {{ cwd: string; host?: string; port: number; skipSync?: boolean }} options
 */
export async function startCsvDashboardServer(options) {
  const {
    cwd,
    host = '127.0.0.1',
    port,
    skipSync = false,
  } = options;

  const db = await openDb({
    cwd,
    allowSourceErrors: true,
    syncOnOpen: !skipSync,
  });

  if (skipSync) {
    await db.runtime.hydrate();
  }

  const events = createViewerEventHub();
  const dbHandler = createDbRequestHandler(db, { events, rootRoutes: true });

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'GET' && dashboardPath(request.url) === '/') {
        sendText(response, 200, renderCsvDashboardHtml(), 'text/html; charset=utf-8');
        return;
      }

      if (request.method === 'GET' && dashboardPath(request.url) === '/dashboard.js') {
        const script = await readFile(path.join(here, 'dashboard.js'), 'utf8');
        sendText(response, 200, script, 'text/javascript; charset=utf-8');
        return;
      }

      await dbHandler(request, response);
    } catch (error) {
      sendJson(response, error.status ?? 500, serializeError(error, 'SERVER_ERROR'));
    }
  });

  let watcher;
  server.once('close', () => {
    watcher?.close();
    events.close();
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

function dashboardPath(rawUrl) {
  return new URL(rawUrl ?? '/', 'http://db.local').pathname;
}
