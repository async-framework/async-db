#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCsvDashboardServer } from './src/start-csv-dashboard-server.mjs';

const cwd = path.dirname(fileURLToPath(import.meta.url));

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  startCsvDashboardServer({
    cwd,
    host: options.host ?? '127.0.0.1',
    port: Number(options.port ?? 7343),
    skipSync: options.skipSync,
  }).then((app) => {
    console.log(`CSV dashboard: ${app.url}/`);
    console.log(`Built-in viewer: ${app.url}/__db`);
    console.log('Press Ctrl+C to stop.');
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

function parseArgs(args) {
  return {
    host: valueAfter(args, '--host'),
    port: valueAfter(args, '--port'),
    skipSync: args.includes('--no-sync'),
  };
}

function valueAfter(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}
