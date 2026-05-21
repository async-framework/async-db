import assert from 'node:assert/strict';
import { access, cp, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  inferDashboardInsights,
  renderChartCards,
  renderEmptyState,
  renderResourceDashboard,
  renderResourceSidebar,
  renderTablePreview,
} from '../../examples/csv-dashboard/src/dashboard.js';
import { renderCsvDashboardHtml } from '../../examples/csv-dashboard/src/dashboard-html.mjs';
import { parseCsvRecords } from '../../src/csv.js';
import { loadConfig, syncDb } from '../../src/index.js';
import { makeProject } from '../helpers.js';

const sampleCsvDir = path.resolve('examples/csv-dashboard/mock-csv');

test('csv dashboard inference summarizes numeric, categorical, boolean, mixed, and empty fields', () => {
  const rows = [
    { region: 'West', plan: 'Team', active: true, seats: 12, score: 98, mixed: 'A' },
    { region: 'West', plan: 'Enterprise', active: false, seats: 40, score: 91, mixed: 10 },
    { region: 'East', plan: 'Team', active: true, seats: 18, score: 95, mixed: null },
    { region: '', plan: 'Starter', active: true, seats: '', score: 84, mixed: 'B' },
  ];

  const insights = inferDashboardInsights(rows);

  assert.equal(insights.rowCount, 4);
  assert.equal(insights.columnCount, 6);
  assert.equal(insights.emptyFields.length, 0);
  assert.deepEqual(insights.numericSummaries.map((summary) => summary.name), ['seats', 'score']);
  assert.deepEqual(insights.numericSummaries.find((summary) => summary.name === 'seats'), {
    name: 'seats',
    count: 3,
    min: 12,
    max: 40,
    average: 23.33,
    total: 70,
  });
  assert.deepEqual(insights.booleanSummaries, [
    {
      name: 'active',
      trueCount: 3,
      falseCount: 1,
      truePercent: 75,
      falsePercent: 25,
    },
  ]);
  assert.equal(insights.categorySummaries.find((summary) => summary.name === 'region').values[0].label, 'West');
  assert.equal(insights.categorySummaries.find((summary) => summary.name === 'plan').values.length, 3);
  assert.equal(insights.mixedFields[0].name, 'mixed');

  const empty = inferDashboardInsights([]);
  assert.equal(empty.rowCount, 0);
  assert.equal(empty.columnCount, 0);
  assert.deepEqual(empty.numericSummaries, []);
});

test('csv dashboard renderers expose empty, sidebar, chart, and table markers', () => {
  const manifest = {
    collections: {
      customers: {
        kind: 'collection',
        fields: {
          name: { type: 'string' },
          plan: { type: 'string' },
          active: { type: 'boolean' },
          seats: { type: 'number' },
        },
        api: {
          list: '/__db/rest/customers',
        },
      },
    },
  };
  const rows = [
    { name: 'Ada', plan: 'Team', active: true, seats: 12 },
    { name: 'Grace', plan: 'Enterprise', active: false, seats: 40 },
  ];
  const insights = inferDashboardInsights(rows);

  assert.match(renderEmptyState(), /data-dashboard-empty/);
  assert.match(renderResourceSidebar(manifest, 'customers'), /data-dashboard-resource="customers"/);
  assert.match(renderResourceSidebar(manifest, 'customers'), /data-dashboard-model="customers"/);
  assert.match(renderChartCards(insights), /data-chart-card="numeric-seats"/);
  assert.match(renderChartCards(insights), /data-chart-card="boolean-active"/);
  assert.match(renderChartCards(insights), /data-chart-card="category-plan"/);
  assert.match(renderTablePreview(rows), /data-table-preview/);
  const modelDashboard = renderResourceDashboard('customers', rows);
  assert.match(modelDashboard, /data-selected-model="customers"/);
  assert.ok(modelDashboard.indexOf('data-table-preview') < modelDashboard.indexOf('data-metric-card="rows"'));

  const html = renderCsvDashboardHtml();
  assert.match(html, /data-csv-dashboard/);
  assert.match(html, /data-upload-dropzone/);
  assert.match(html, /\/__db\/manifest\.json/);
  assert.match(html, /\/__db\/import/);
});

test('csv dashboard ships ten valid mock CSV files for drag and drop', async () => {
  const files = (await readdir(sampleCsvDir)).filter((file) => file.endsWith('.csv')).sort();

  assert.deepEqual(files, [
    'app-events.csv',
    'content-calendar.csv',
    'customers.csv',
    'device-fleet.csv',
    'marketing-campaigns.csv',
    'orders.csv',
    'product-inventory.csv',
    'revenue-by-region.csv',
    'support-tickets.csv',
    'team-capacity.csv',
  ]);

  for (const file of files) {
    const records = parseCsvRecords(await readFile(path.join(sampleCsvDir, file), 'utf8'), file);
    assert.ok(records.length >= 4, `${file} has enough rows for charts`);
    assert.ok(Object.keys(records[0]).length >= 4, `${file} has enough columns for details`);
  }
});

test('csv dashboard reader mirrors csv models into json runtime state without sidecars', async () => {
  const cwd = await makeProject();
  await cp(path.resolve('examples/csv-dashboard/db.config.mjs'), path.join(cwd, 'db.config.mjs'));
  await cp(path.resolve('examples/csv-dashboard/src'), path.join(cwd, 'src'), { recursive: true });
  await cp(path.join(sampleCsvDir, 'customers.csv'), path.join(cwd, 'db/customers.csv'));

  const config = await loadConfig({ cwd });
  assert.equal(config.sources.readers[0].name, 'csv-dashboard-csv');

  const result = await syncDb(config);
  assert.deepEqual(Object.keys(result.schema.resources), ['customers']);
  assert.equal(result.schema.resources.customers.kind, 'collection');
  assert.equal(result.schema.resources.customers.fields.monthlySpend.type, 'number');
  assert.equal(result.schema.resources.customers.fields.active.type, 'boolean');

  const records = JSON.parse(await readFile(path.join(cwd, '.db/state/customers.json'), 'utf8'));
  assert.deepEqual(records[0], {
    customerId: 'c_100',
    name: 'Ada Lovelace',
    segment: 'Startup',
    region: 'West',
    plan: 'team',
    monthlySpend: 240,
    healthScore: 94,
    active: true,
  });

  const metadata = JSON.parse(await readFile(path.join(cwd, '.db/state/.sources.json'), 'utf8'));
  assert.equal(metadata.resources.customers.path, 'db/customers.csv');
  assert.equal(metadata.resources.customers.format, 'csv');
  await assert.rejects(() => access(path.join(cwd, 'db/customers.json')), { code: 'ENOENT' });
});
