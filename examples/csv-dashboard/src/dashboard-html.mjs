export function renderCsvDashboardHtml(options = {}) {
  const manifestPath = options.manifestPath ?? '/__db/manifest.json';
  const importPath = options.importPath ?? '/__db/import';
  const eventsPath = options.eventsPath ?? '/__db/events';
  const scriptPath = options.scriptPath ?? '/dashboard.js';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CSV Dashboard Example</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --panel-soft: #f9fafb;
      --text: #111827;
      --muted: #5b6472;
      --border: #d8dee8;
      --border-strong: #b9c2cf;
      --accent: #0f766e;
      --accent-soft: #dff5f0;
      --accent-strong: #0b5f59;
      --amber: #b45309;
      --rose: #be123c;
      --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }

    button,
    input {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .app-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr);
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 20px;
      border-right: 1px solid var(--border);
      background: #eef2f6;
      padding: 24px;
    }

    .brand h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.15;
      letter-spacing: 0;
    }

    .brand p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .dropzone {
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
      box-shadow: var(--shadow);
    }

    .dropzone[data-active="true"] {
      border-color: var(--accent);
      background: var(--accent-soft);
    }

    .dropzone strong {
      display: block;
      font-size: 14px;
    }

    .dropzone p,
    .status-line {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .file-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      margin-top: 12px;
      border: 0;
      border-radius: 6px;
      background: var(--accent);
      color: #ffffff;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 700;
    }

    .file-button:hover {
      background: var(--accent-strong);
    }

    .resource-list {
      display: grid;
      gap: 8px;
    }

    .resource-list h2 {
      margin: 0 0 4px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .resource-button {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.72);
      padding: 10px 12px;
      text-align: left;
      color: var(--text);
    }

    .resource-button:hover,
    .resource-button[aria-current="true"] {
      border-color: var(--accent);
      background: #ffffff;
    }

    .resource-button strong {
      display: block;
      font-size: 14px;
    }

    .resource-button span {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 12px;
    }

    .main {
      min-width: 0;
      padding: 28px;
    }

    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
    }

    .topbar h2 {
      margin: 0;
      font-size: 26px;
      letter-spacing: 0;
    }

    .topbar p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .viewer-link {
      color: var(--accent);
      font-size: 14px;
      font-weight: 700;
      text-decoration: none;
    }

    .viewer-link:hover {
      text-decoration: underline;
    }

    .metric-grid,
    .chart-grid,
    .field-grid {
      display: grid;
      gap: 12px;
    }

    .metric-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin: 16px 0;
    }

    .chart-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 16px 0;
    }

    .field-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 16px 0;
    }

    .card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--panel);
      padding: 16px;
      box-shadow: var(--shadow);
    }

    .card h3 {
      margin: 0;
      font-size: 15px;
      line-height: 1.3;
    }

    .card p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .metric-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .metric-value {
      margin-top: 8px;
      font-size: 28px;
      line-height: 1;
      font-weight: 800;
    }

    .bar-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .bar-row {
      display: grid;
      grid-template-columns: minmax(70px, 0.8fr) minmax(0, 1fr) 48px;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: var(--muted);
    }

    .bar-track {
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #e5e7eb;
    }

    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
    }

    .table-card {
      overflow: hidden;
      padding: 0;
    }

    .table-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      min-width: 640px;
      border-collapse: collapse;
      font-size: 13px;
    }

    th,
    td {
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: var(--panel-soft);
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }

    td {
      color: var(--text);
    }

    .empty-state {
      display: grid;
      min-height: 520px;
      place-items: center;
      border: 1px dashed var(--border-strong);
      border-radius: 8px;
      background: var(--panel);
      text-align: center;
      padding: 32px;
    }

    .empty-state h2 {
      margin: 0;
      font-size: 24px;
    }

    .empty-state p {
      max-width: 520px;
      margin: 10px auto 0;
      color: var(--muted);
    }

    .hidden {
      display: none;
    }

    @media (max-width: 900px) {
      .app-shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }

      .metric-grid,
      .chart-grid,
      .field-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div
    id="csv-dashboard-app"
    class="app-shell"
    data-csv-dashboard
    data-manifest-path="${escapeHtml(manifestPath)}"
    data-import-path="${escapeHtml(importPath)}"
    data-events-path="${escapeHtml(eventsPath)}"
  >
    <aside class="sidebar">
      <div class="brand">
        <h1>CSV Dashboard</h1>
        <p>Drop a CSV file and inspect the generated runtime model.</p>
      </div>

      <section class="dropzone" data-upload-dropzone>
        <strong>Import CSV</strong>
        <p>Files are copied into this example's empty <code>db/</code> folder.</p>
        <button class="file-button" type="button" data-file-button>Choose CSV</button>
        <input class="hidden" type="file" accept=".csv,text/csv" data-file-input>
        <div class="status-line" data-import-status>Waiting for a CSV file.</div>
      </section>

      <nav class="resource-list" aria-label="CSV models">
        <h2>Models</h2>
        <div data-sidebar-resources></div>
      </nav>
    </aside>

    <main class="main">
      <div class="topbar">
        <div>
          <h2 data-dashboard-title>Runtime data dashboard</h2>
          <p data-dashboard-subtitle>Resources appear here after CSV import.</p>
        </div>
        <a class="viewer-link" href="/__db">Built-in viewer</a>
      </div>
      <section data-dashboard-content>
        <div class="empty-state" data-dashboard-empty>
          <div>
            <h2>No CSV models yet</h2>
            <p>Drop a CSV file in the sidebar. The import endpoint writes it to <code>db/</code>, syncs the runtime mirror, and the live manifest registers it as a model.</p>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script type="module" src="${escapeHtml(scriptPath)}"></script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
