/**
 * Examples launcher hook, mounted by `scripts/serve-examples.js` when present.
 * Keeps dashboard UI routes local while db owns REST, `/__db`, and import.
 */
import { startCsvDashboardServer } from './src/start-csv-dashboard-server.mjs';

/** @param {{ cwd: string; host: string; port: number; repoRoot: string }} context */
export async function startExampleServer(context) {
  const { cwd, host, port } = context;

  const app = await startCsvDashboardServer({
    cwd,
    host,
    port,
    skipSync: false,
  });

  return {
    ...app,
    viewerUrl: `${app.url}/__db`,
    demoUrl: `${app.url}/`,
  };
}
