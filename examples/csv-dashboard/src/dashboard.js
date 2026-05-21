const MAX_CATEGORY_VALUES = 6;
const MAX_TABLE_ROWS = 25;
const MAX_TABLE_COLUMNS = 12;

export function inferDashboardInsights(rows = []) {
  const safeRows = Array.isArray(rows) ? rows.filter(isObjectRecord) : [];
  const fieldNames = fieldNamesForRows(safeRows);
  const columns = [];
  const numericSummaries = [];
  const booleanSummaries = [];
  const categorySummaries = [];
  const mixedFields = [];
  const emptyFields = [];

  for (const name of fieldNames) {
    const rawValues = safeRows.map((row) => row[name]);
    const presentValues = rawValues.filter((value) => !isMissing(value));
    const emptyCount = rawValues.length - presentValues.length;
    const typeProfile = profileValues(presentValues);
    const column = {
      name,
      type: typeProfile.kind,
      presentCount: presentValues.length,
      emptyCount,
      uniqueCount: new Set(presentValues.map(normalizeValueLabel)).size,
    };
    columns.push(column);

    if (presentValues.length === 0) {
      emptyFields.push(column);
      continue;
    }

    if (typeProfile.kind === 'number') {
      numericSummaries.push(numericSummary(name, typeProfile.numbers));
      continue;
    }

    if (typeProfile.kind === 'boolean') {
      booleanSummaries.push(booleanSummary(name, typeProfile.booleans));
      continue;
    }

    if (typeProfile.kind === 'mixed') {
      mixedFields.push(column);
      continue;
    }

    const category = categorySummary(name, presentValues, safeRows.length);
    if (category.values.length > 0) {
      categorySummaries.push(category);
    }
  }

  return {
    rowCount: safeRows.length,
    columnCount: fieldNames.length,
    columns,
    numericSummaries,
    booleanSummaries,
    categorySummaries,
    mixedFields,
    emptyFields,
  };
}

export function renderEmptyState() {
  return `<div class="empty-state" data-dashboard-empty>
    <div>
      <h2>No CSV models yet</h2>
      <p>Drop a CSV file in the sidebar. The model list is rebuilt from the live viewer manifest after import.</p>
    </div>
  </div>`;
}

export function renderResourceSidebar(manifest = {}, selectedName = '') {
  const resources = collectionEntries(manifest);
  if (resources.length === 0) {
    return '<p class="status-line" data-sidebar-empty>No imported CSV models yet.</p>';
  }

  return resources.map(([name, resource]) => {
    const fields = Object.keys(resource.fields ?? {}).length;
    const selected = name === selectedName;
    return `<button
      class="resource-button"
      type="button"
      data-dashboard-resource="${escapeHtml(name)}"
      data-dashboard-model="${escapeHtml(name)}"
      aria-current="${selected ? 'true' : 'false'}"
    >
      <strong>${escapeHtml(labelFromName(name))}</strong>
      <span>${escapeHtml(fields)} inferred fields</span>
    </button>`;
  }).join('');
}

export function renderSummaryMetrics(insights) {
  return `<section class="metric-grid" aria-label="CSV summary">
    ${renderMetric('Rows', insights.rowCount)}
    ${renderMetric('Columns', insights.columnCount)}
    ${renderMetric('Numeric', insights.numericSummaries.length)}
    ${renderMetric('Categories', insights.categorySummaries.length)}
  </section>`;
}

export function renderFieldDetails(insights) {
  if (insights.columns.length === 0) {
    return '';
  }

  return `<section class="field-grid" aria-label="Field details">
    ${insights.columns.map((column) => `<article class="card" data-field-card="${escapeHtml(column.name)}">
      <h3>${escapeHtml(labelFromName(column.name))}</h3>
      <p>${escapeHtml(column.type)} field, ${escapeHtml(column.presentCount)} filled, ${escapeHtml(column.emptyCount)} empty, ${escapeHtml(column.uniqueCount)} unique</p>
    </article>`).join('')}
  </section>`;
}

export function renderChartCards(insights) {
  const cards = [
    ...insights.numericSummaries.map(renderNumericCard),
    ...insights.booleanSummaries.map(renderBooleanCard),
    ...insights.categorySummaries.map(renderCategoryCard),
  ];

  if (cards.length === 0) {
    return `<section class="card" data-chart-empty>
      <h3>No chartable fields yet</h3>
      <p>This CSV does not have enough numeric, boolean, or categorical values for automatic charts.</p>
    </section>`;
  }

  return `<section class="chart-grid" aria-label="Generated charts">
    ${cards.join('')}
  </section>`;
}

export function renderTablePreview(rows = []) {
  const safeRows = Array.isArray(rows) ? rows.filter(isObjectRecord) : [];
  const columns = fieldNamesForRows(safeRows).slice(0, MAX_TABLE_COLUMNS);
  const previewRows = safeRows.slice(0, MAX_TABLE_ROWS);

  if (safeRows.length === 0 || columns.length === 0) {
    return `<section class="card" data-table-preview>
      <h3>Table preview</h3>
      <p>No rows are available for this resource.</p>
    </section>`;
  }

  return `<section class="card table-card" data-table-preview>
    <div class="table-header">
      <h3>Table preview</h3>
      <p>Showing ${escapeHtml(previewRows.length)} of ${escapeHtml(safeRows.length)} rows and ${escapeHtml(columns.length)} columns.</p>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(labelFromName(column))}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${previewRows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatCell(row[column]))}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

export function renderResourceDashboard(resourceName, rows) {
  const insights = inferDashboardInsights(rows);
  return `<div data-selected-model="${escapeHtml(resourceName)}">
    ${renderTablePreview(rows)}
    ${renderSummaryMetrics(insights)}
    ${renderFieldDetails(insights)}
    ${renderChartCards(insights)}
  </div>`;
}

function renderMetric(label, value) {
  return `<article class="card" data-metric-card="${escapeHtml(label.toLowerCase())}">
    <div class="metric-label">${escapeHtml(label)}</div>
    <div class="metric-value">${escapeHtml(value)}</div>
  </article>`;
}

function renderNumericCard(summary) {
  return `<article class="card" data-chart-card="numeric-${escapeHtml(summary.name)}">
    <h3>${escapeHtml(labelFromName(summary.name))}</h3>
    <p>Average ${escapeHtml(summary.average)} across ${escapeHtml(summary.count)} values. Range ${escapeHtml(summary.min)} to ${escapeHtml(summary.max)}.</p>
    <div class="bar-list">
      ${renderBar('Total', summary.total, summary.total)}
      ${renderBar('Average', summary.average, summary.max)}
      ${renderBar('Max', summary.max, summary.max)}
    </div>
  </article>`;
}

function renderBooleanCard(summary) {
  return `<article class="card" data-chart-card="boolean-${escapeHtml(summary.name)}">
    <h3>${escapeHtml(labelFromName(summary.name))}</h3>
    <p>${escapeHtml(summary.truePercent)}% true and ${escapeHtml(summary.falsePercent)}% false.</p>
    <div class="bar-list">
      ${renderBar('True', summary.trueCount, summary.trueCount + summary.falseCount)}
      ${renderBar('False', summary.falseCount, summary.trueCount + summary.falseCount)}
    </div>
  </article>`;
}

function renderCategoryCard(summary) {
  const max = Math.max(...summary.values.map((value) => value.count), 1);
  return `<article class="card" data-chart-card="category-${escapeHtml(summary.name)}">
    <h3>${escapeHtml(labelFromName(summary.name))}</h3>
    <p>Top ${escapeHtml(summary.values.length)} values by frequency.</p>
    <div class="bar-list">
      ${summary.values.map((value) => renderBar(value.label, value.count, max)).join('')}
    </div>
  </article>`;
}

function renderBar(label, value, max) {
  const percent = max > 0 ? Math.max(3, Math.min(100, Math.round((Number(value) / Number(max)) * 100))) : 0;
  return `<div class="bar-row">
    <span>${escapeHtml(label)}</span>
    <span class="bar-track"><span class="bar-fill" style="width: ${percent}%"></span></span>
    <strong>${escapeHtml(value)}</strong>
  </div>`;
}

function fieldNamesForRows(rows) {
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        names.push(key);
      }
    }
  }
  return names;
}

function profileValues(values) {
  const numbers = [];
  const booleans = [];
  const kinds = new Set();

  for (const value of values) {
    const numeric = numericValue(value);
    const boolean = booleanValue(value);

    if (numeric !== null) {
      numbers.push(numeric);
      kinds.add('number');
      continue;
    }

    if (boolean !== null) {
      booleans.push(boolean);
      kinds.add('boolean');
      continue;
    }

    kinds.add(typeof value);
  }

  if (values.length > 0 && numbers.length === values.length) {
    return { kind: 'number', numbers };
  }

  if (values.length > 0 && booleans.length === values.length) {
    return { kind: 'boolean', booleans };
  }

  if (kinds.size > 1) {
    return { kind: 'mixed' };
  }

  return { kind: values.length === 0 ? 'empty' : 'category' };
}

function numericSummary(name, numbers) {
  const total = round(numbers.reduce((sum, value) => sum + value, 0));
  const min = round(Math.min(...numbers));
  const max = round(Math.max(...numbers));
  return {
    name,
    count: numbers.length,
    min,
    max,
    average: round(total / numbers.length),
    total,
  };
}

function booleanSummary(name, booleans) {
  const trueCount = booleans.filter(Boolean).length;
  const falseCount = booleans.length - trueCount;
  return {
    name,
    trueCount,
    falseCount,
    truePercent: Math.round((trueCount / booleans.length) * 100),
    falsePercent: Math.round((falseCount / booleans.length) * 100),
  };
}

function categorySummary(name, values, rowCount) {
  const counts = new Map();
  for (const value of values) {
    const label = normalizeValueLabel(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return {
    name,
    values: [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, MAX_CATEGORY_VALUES)
      .map(([label, count]) => ({
        label,
        count,
        percent: rowCount > 0 ? Math.round((count / rowCount) * 100) : 0,
      })),
  };
}

function collectionEntries(manifest) {
  return Object.entries(manifest.collections ?? {})
    .filter(([, resource]) => resource?.kind === 'collection')
    .sort(([left], [right]) => left.localeCompare(right));
}

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMissing(value) {
  return value === null || value === undefined || value === '';
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  if (!/^-?\d+(?:\.\d+)?$/u.test(value.trim())) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return null;
}

function normalizeValueLabel(value) {
  if (isMissing(value)) {
    return '(empty)';
  }
  return String(value);
}

function formatCell(value) {
  if (isMissing(value)) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function labelFromName(name) {
  return String(name ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

if (typeof window !== 'undefined') {
  initCsvDashboard().catch((error) => {
    const content = document.querySelector('[data-dashboard-content]');
    if (content) {
      content.innerHTML = `<section class="card"><h3>Dashboard failed to load</h3><p>${escapeHtml(error.message)}</p></section>`;
    }
  });
}

async function initCsvDashboard() {
  const app = document.querySelector('[data-csv-dashboard]');
  if (!app) {
    return;
  }

  const state = {
    manifest: null,
    selectedResource: '',
  };
  const paths = {
    manifest: app.dataset.manifestPath ?? '/__db/manifest.json',
    import: app.dataset.importPath ?? '/__db/import',
    events: app.dataset.eventsPath ?? '/__db/events',
  };
  const els = {
    dropzone: app.querySelector('[data-upload-dropzone]'),
    fileButton: app.querySelector('[data-file-button]'),
    fileInput: app.querySelector('[data-file-input]'),
    importStatus: app.querySelector('[data-import-status]'),
    sidebar: app.querySelector('[data-sidebar-resources]'),
    content: app.querySelector('[data-dashboard-content]'),
    title: app.querySelector('[data-dashboard-title]'),
    subtitle: app.querySelector('[data-dashboard-subtitle]'),
  };

  wireImportControls(els, paths, (resourceName) => refreshDashboard(resourceName));
  wireEvents(paths, () => refreshDashboard(state.selectedResource));
  await refreshDashboard('');

  async function refreshDashboard(preferredResource) {
    state.manifest = await fetchJson(paths.manifest);
    const resources = collectionEntries(state.manifest);
    const names = resources.map(([name]) => name);
    state.selectedResource = names.includes(preferredResource)
      ? preferredResource
      : names.includes(state.selectedResource)
        ? state.selectedResource
        : names[0] ?? '';

    els.sidebar.innerHTML = renderResourceSidebar(state.manifest, state.selectedResource);
    for (const button of els.sidebar.querySelectorAll('[data-dashboard-model]')) {
      button.addEventListener('click', () => {
        refreshDashboard(button.dataset.dashboardModel).catch(showError);
      });
    }

    if (!state.selectedResource) {
      els.title.textContent = 'Runtime data dashboard';
      els.subtitle.textContent = 'Resources appear here after CSV import.';
      els.content.innerHTML = renderEmptyState();
      return;
    }

    const resource = state.manifest.collections?.[state.selectedResource];
    const rows = await fetchJson(resource?.api?.list ?? state.manifest.api?.resources?.[state.selectedResource]?.list);
    els.title.textContent = labelFromName(state.selectedResource);
    els.subtitle.textContent = 'Showing JSON runtime rows mirrored from the CSV source.';
    els.content.innerHTML = renderResourceDashboard(state.selectedResource, Array.isArray(rows) ? rows : []);
  }

  function showError(error) {
    els.content.innerHTML = `<section class="card"><h3>Dashboard request failed</h3><p>${escapeHtml(error.message)}</p></section>`;
  }
}

function wireImportControls(els, paths, onImported) {
  els.fileButton.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => importCsvFile(els.fileInput.files[0], paths, els, onImported));

  for (const eventName of ['dragenter', 'dragover']) {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.dataset.active = 'true';
    });
  }

  for (const eventName of ['dragleave', 'drop']) {
    els.dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropzone.dataset.active = 'false';
    });
  }

  els.dropzone.addEventListener('drop', (event) => {
    importCsvFile(event.dataTransfer?.files?.[0], paths, els, onImported).catch(() => {});
  });
}

async function importCsvFile(file, paths, els, onImported) {
  if (!file) {
    return;
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    setStatus(els, 'Choose a .csv file.');
    return;
  }

  setStatus(els, `Importing ${file.name}...`);
  const response = await fetch(paths.import, {
    method: 'POST',
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'x-db-file-name': file.name,
    },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || 'CSV import failed.');
  }

  setStatus(els, `Imported ${result.dataPath}.`);
  els.fileInput.value = '';
  await onImported(result.resource);
}

function wireEvents(paths, onChange) {
  if (!window.EventSource) {
    return;
  }

  const events = new EventSource(paths.events);
  events.addEventListener('db', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'connected') {
      return;
    }
    onChange().catch(() => {});
  });
}

function setStatus(els, message) {
  els.importStatus.textContent = message;
}

async function fetchJson(path) {
  if (!path) {
    throw new Error('Missing dashboard API path.');
  }
  const response = await fetch(path, {
    headers: {
      accept: 'application/json',
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message || `Request failed: ${response.status}`);
  }
  return body;
}
