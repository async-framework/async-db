import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import test from 'node:test';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  parseSchemaUiFormBody,
  renderHomePage,
  renderRecordDetailPage,
  saveSchemaUiRecord,
} from '../../examples/recursive-schema-ui/src/cms-ssr.mjs';
import { launchExampleHttpStack } from '../../scripts/example-launcher.js';
import { findExamples, renderExamplesIndex } from '../../scripts/serve-examples.js';
import { loadConfig, openDb, syncDb } from '../../src/index.js';

const execFileAsync = promisify(execFile);
const mainOrderedExamples = [
  'basic',
  'data-first',
  'schema-first',
  'csv',
  'csv-dashboard',
  'docs',
  'derived-sources',
  'relations',
  'rest-client',
  'schema-manifest',
  'schema-ui',
  'recursive-schema-ui',
  'admin-panel',
  'blog',
  'cms',
  'cms-with-page-builder',
  'forums',
  'issue-tracker',
  'approval-workflow',
  'catalog',
  'ecommerce',
  'diagnostics',
  'advanced',
  'hono-auth',
];
const permissionExamples = [
  'permission-rbac',
  'permission-abac',
  'permission-rebac',
  'permission-acl',
  'permission-pbac',
];
const agenticExamples = [
  'agent-task-board',
  'agent-memory-workspace',
  'agent-tool-registry',
  'agent-evaluation-lab',
];
const loginExamples = [
  'login-password',
  'login-magic-link',
  'login-oauth',
  'login-organization',
  'login-api-keys',
];

test('examples launcher can discover repo examples and render an index page', async () => {
  const examples = await findExamples(path.resolve('examples'));
  const names = examples.map((example) => example.name);

  assert.deepEqual(names, [
    'admin-panel',
    'advanced',
    'agent-evaluation-lab',
    'agent-memory-workspace',
    'agent-task-board',
    'agent-tool-registry',
    'approval-workflow',
    'basic',
    'blog',
    'catalog',
    'cms',
    'cms-with-page-builder',
    'csv',
    'csv-dashboard',
    'data-first',
    'derived-sources',
    'diagnostics',
    'docs',
    'ecommerce',
    'forums',
    'hono-auth',
    'issue-tracker',
    'login-api-keys',
    'login-magic-link',
    'login-oauth',
    'login-organization',
    'login-password',
    'permission-abac',
    'permission-acl',
    'permission-pbac',
    'permission-rbac',
    'permission-rebac',
    'recursive-schema-ui',
    'relations',
    'rest-client',
    'schema-first',
    'schema-manifest',
    'schema-ui',
  ]);
  assert.equal(examples.find((example) => example.name === 'relations').title, 'Relations');
  assert.deepEqual(examples.find((example) => example.name === 'rest-client').tags, ['client', 'rest', 'batching']);

  const html = renderExamplesIndex(examples.map((example, index) => ({
    ...example,
    port: 7330 + index,
    url: `http://127.0.0.1:${7330 + index}`,
    viewerUrl: `http://127.0.0.1:${7330 + index}/__db`,
    demoUrl: undefined,
    demoLinks: [],
    starterKind: 'db',
  })));

  assert.match(html, /db examples/);
  assert.match(html, /serve-example\.mjs/);
  assert.match(html, /Open viewer/);
  assert.match(html, /Admin Panel/);
  assert.match(html, /advanced/);
  assert.match(html, /Agent Evaluation Lab/);
  assert.match(html, /Agent Memory Workspace/);
  assert.match(html, /Agent Task Board/);
  assert.match(html, /Agent Tool Registry/);
  assert.match(html, /Approval Workflow/);
  assert.match(html, /Blog/);
  assert.match(html, /Catalog/);
  assert.match(html, /CMS/);
  assert.match(html, /CMS With Page Builder/);
  assert.match(html, /csv/);
  assert.match(html, /CSV Dashboard/);
  assert.match(html, /Derived Sources/);
  assert.match(html, /diagnostics/);
  assert.match(html, /Docs/);
  assert.match(html, /Ecommerce/);
  assert.match(html, /Forums/);
  assert.match(html, /Hono Auth/);
  assert.match(html, /Issue Tracker/);
  assert.match(html, /API Key Login/);
  assert.match(html, /Magic Link Login/);
  assert.match(html, /OAuth Login/);
  assert.match(html, /Organization Login/);
  assert.match(html, /Password Login/);
  assert.match(html, /Permission ABAC/);
  assert.match(html, /Permission ACL/);
  assert.match(html, /Permission PBAC/);
  assert.match(html, /Permission RBAC/);
  assert.match(html, /Permission ReBAC/);
  assert.match(html, /REST Client/);
  assert.match(html, /client/);
  assert.match(html, /relations/);
  assert.match(html, /Recursive Schema UI/);
  assert.match(html, /schema-first/);
  assert.match(html, /Schema Manifest/);
  assert.match(html, /Schema UI/);

  const rootReadme = await readFile(path.resolve('README.md'), 'utf8');
  const examplesReadme = await readFile(path.resolve('examples/README.md'), 'utf8');
  assertExampleOrder(sectionAfter(rootReadme, '## Which Example Should I Start With?'), (example) => `examples/${example}`);
  assertExampleOrder(sectionAfter(examplesReadme, '| Order | Example | Learn this next |'), (example) => `](./${example})`);
  assertExampleOrder(sectionAfter(rootReadme, '### Agentic Examples'), (example) => `examples/${example}`, agenticExamples);
  assertExampleOrder(sectionAfter(examplesReadme, '## Agentic Examples'), (example) => `](./${example})`, agenticExamples);
  assertExampleOrder(sectionAfter(rootReadme, '### Permission Examples'), (example) => `examples/${example}`, permissionExamples);
  assertExampleOrder(sectionAfter(examplesReadme, '## Permission Examples'), (example) => `](./${example})`, permissionExamples);
  assertExampleOrder(sectionAfter(rootReadme, '### Login Examples'), (example) => `examples/${example}`, loginExamples);
  assertExampleOrder(sectionAfter(examplesReadme, '## Login Examples'), (example) => `](./${example})`, loginExamples);
  assert.match(rootReadme, /mixed source layout/);
  assert.match(examplesReadme, /folder-backed resources/);
  assert.doesNotMatch(examplesReadme, /Data model note only/);
  assert.doesNotMatch(examplesReadme, /Delegated vs\. application permissions/);
  assert.match(examplesReadme, /## Login Examples/);
  assert.match(examplesReadme, /Password login/);
  assert.match(examplesReadme, /fingerprints/);
  for (const example of examples) {
    const readme = await readFile(path.resolve('examples', example.name, 'README.md'), 'utf8');
    const mermaidBlocks = readme.match(/```mermaid\n([\s\S]*?)\n```/g) ?? [];
    const diagramHeading = example.name === 'csv-dashboard' ? /^## Runtime Flow Diagram$/m : /^## Data Model Diagram$/m;

    assert.match(readme, /^## Why This Shape\?/m, `${example.name} explains its data model shape`);
    assert.match(readme, diagramHeading, `${example.name} has a diagram section`);
    assert.ok(mermaidBlocks.length > 0, `${example.name} has a Mermaid diagram`);
    assert.match(
      mermaidBlocks[0].replace(/^```mermaid\n/, '').trimStart(),
      /^(erDiagram|flowchart)\b/,
      `${example.name} Mermaid diagram starts with a supported diagram type`,
    );
    assert.match(
      readme,
      /relation|expand|plain ids|nested|no cross-resource relations|no schema-declared relations/i,
      `${example.name} explains relations, expansion, nesting, or relation absence`,
    );
  }

  const blogReadme = await readFile(path.resolve('examples/blog/README.md'), 'utf8');
  assert.match(blogReadme, /folder-backed/);
  assert.match(blogReadme, /authorId/);
  assert.match(blogReadme, /tagIds/);
  assert.match(blogReadme, /relatedPostIds/);
  assert.match(blogReadme, /expand=author/);
  const ecommerceReadme = await readFile(path.resolve('examples/ecommerce/README.md'), 'utf8');
  assert.match(ecommerceReadme, /## Why This Shape\?/);
  assert.match(ecommerceReadme, /Product vs\. variant/);
  assert.match(ecommerceReadme, /Cart vs\. order/);

  const schemaUiHook = await readFile(path.resolve('examples/schema-ui/serve-example.mjs'), 'utf8');
  assert.match(schemaUiHook, /startExampleServer/);
  const recursiveSchemaUiHook = await readFile(path.resolve('examples/recursive-schema-ui/serve-example.mjs'), 'utf8');
  assert.match(recursiveSchemaUiHook, /startExampleServer/);
  const csvDashboardHook = await readFile(path.resolve('examples/csv-dashboard/serve-example.mjs'), 'utf8');
  assert.match(csvDashboardHook, /startExampleServer/);
});

test('example launcher resolves schema-ui serve-example hook', async () => {
  const cwd = path.resolve('examples/schema-ui');
  const launched = await launchExampleHttpStack({
    cwd,
    host: '127.0.0.1',
    port: 0,
    repoRoot: path.resolve('.'),
  });

  assert.equal(launched.starterKind, 'custom');
  assert.ok(launched.demoUrl);
  assert.match(launched.demoUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/u);

  const address = launched.server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const templates = await fetch(`http://127.0.0.1:${port}/templates`);
  assert.equal(templates.status, 200);

  const viewer = await fetch(`http://127.0.0.1:${port}/__db`);
  assert.ok(viewer.ok);

  await new Promise((resolve, reject) => {
    launched.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
});

test('example launcher resolves csv-dashboard serve-example hook', async () => {
  const cwd = path.resolve('examples/csv-dashboard');
  const launched = await launchExampleHttpStack({
    cwd,
    host: '127.0.0.1',
    port: 0,
    repoRoot: path.resolve('.'),
  });

  assert.equal(launched.starterKind, 'custom');
  assert.ok(launched.demoUrl);
  assert.match(launched.demoUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/u);

  const address = launched.server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;

  const dashboard = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /data-csv-dashboard/);

  const script = await fetch(`http://127.0.0.1:${port}/dashboard.js`);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /inferDashboardInsights/);

  const manifest = await fetch(`http://127.0.0.1:${port}/__db/manifest.json`);
  assert.equal(manifest.status, 200);
  assert.deepEqual((await manifest.json()).collections, {});

  await new Promise((resolve, reject) => {
    launched.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
});

test('new onboarding examples sync expected resources', async () => {
  const expected = {
    'admin-panel': ['featureFlags', 'settings'],
    'agent-evaluation-lab': ['evalRuns', 'evalSuites', 'models', 'prompts', 'regressions', 'scores', 'testCases'],
    'agent-memory-workspace': ['chunks', 'citations', 'claims', 'conflicts', 'memories', 'memorySpaces', 'refreshJobs', 'sources'],
    'agent-task-board': ['agents', 'approvals', 'artifacts', 'runSteps', 'runs', 'tasks', 'tools'],
    'agent-tool-registry': ['agents', 'auditEvents', 'riskPolicies', 'toolCalls', 'toolRequests', 'toolScopes', 'tools'],
    'approval-workflow': ['actions', 'approvalRules', 'changeRequests', 'invitations', 'members', 'reviews', 'teams'],
    blog: ['authors', 'posts', 'tags'],
    catalog: ['categories', 'inventory', 'products'],
    cms: ['media', 'menus', 'pages'],
    'cms-with-page-builder': ['blockLibrary', 'media', 'menus', 'pageTemplates', 'pages'],
    'csv-dashboard': [],
    'derived-sources': ['blogArchiveMonths', 'blogTags', 'dataSources', 'docNavigation', 'docSearch', 'projects', 'users'],
    docs: ['docs'],
    ecommerce: ['carts', 'customers', 'discounts', 'inventory', 'orders', 'payments', 'productVariants', 'products', 'shipments'],
    forums: ['categories', 'posts', 'topics', 'users'],
    'hono-auth': ['pages', 'users'],
    'issue-tracker': ['comments', 'issues', 'labels', 'projects', 'users'],
    'login-api-keys': ['apiKeys', 'keyAuditEvents', 'keyScopes', 'serviceAccounts', 'users'],
    'login-magic-link': ['loginRequests', 'sessions', 'users'],
    'login-oauth': ['externalAccounts', 'sessions', 'users'],
    'login-organization': ['invitations', 'memberships', 'organizations', 'sessions', 'users'],
    'login-password': ['credentials', 'passwordResetRequests', 'sessions', 'users'],
    'permission-abac': ['accessContexts', 'files', 'users'],
    'permission-acl': ['documents', 'users'],
    'permission-pbac': ['policies', 'resources', 'users'],
    'permission-rbac': ['documents', 'roles', 'users'],
    'permission-rebac': ['documents', 'relationships', 'users'],
    'rest-client': ['settings', 'users'],
    relations: ['posts', 'users'],
    'recursive-schema-ui': ['pages', 'users'],
    'schema-manifest': ['projects', 'users'],
    'schema-ui': ['pages', 'users'],
  };

  for (const [name, resources] of Object.entries(expected)) {
    const cwd = await copyExampleProject(name);
    const result = await syncDb(await loadConfig({ cwd }));

    assert.deepEqual(Object.keys(result.schema.resources), resources, `${name} resources`);
  }

  const docsCwd = await copyExampleProject('docs');
  await syncDb(await loadConfig({ cwd: docsCwd }));
  const docsDb = await openDb({ cwd: docsCwd, syncOnOpen: false });
  await docsDb.runtime.hydrate();
  const docs = await docsDb.collection('docs').all();
  assert.deepEqual(docs.map((doc) => doc.sourcePath), [
    'docs/index.md',
    'docs/guides/getting-started.md',
    'docs/reference/custom-readers.md',
  ]);
  assert.equal(docs.find((doc) => doc.id === 'getting-started')?.routePath, '/guides/getting-started');

  const blogCwd = await copyExampleProject('blog');
  await syncDb(await loadConfig({ cwd: blogCwd }));
  const blogDb = await openDb({ cwd: blogCwd, syncOnOpen: false });
  await blogDb.runtime.hydrate();
  const posts = await blogDb.collection('posts').all();
  assert.deepEqual(posts.map((post) => post.sourcePath), [
    'posts/2026/05/01/local-fixtures-first.md',
    'posts/2026/05/15/release-notes-as-data.md',
  ]);
  assert.deepEqual(posts.map((post) => post.datePath), ['2026-05-01', '2026-05-15']);

  const ecommerceCwd = await copyExampleProject('ecommerce');
  await syncDb(await loadConfig({ cwd: ecommerceCwd }));
  const ecommerceDb = await openDb({ cwd: ecommerceCwd, syncOnOpen: false });
  await ecommerceDb.runtime.hydrate();
  const order = await ecommerceDb.collection('orders').get('ord_1001');
  assert.equal(order.orderNumber, '1001');
  assert.equal(order.items.length, 2);
  const { stdout: ecommerceHtml } = await execFileAsync(process.execPath, ['src/render-summary.mjs'], { cwd: ecommerceCwd });
  assert.match(ecommerceHtml, /cdn\.tailwindcss\.com/);
  assert.match(ecommerceHtml, /<h1[^>]*>Ecommerce Example<\/h1>/);
  assert.match(ecommerceHtml, /data-order="ord_1001" data-status="paid"/);

  for (const { name, title, marker, extraMarkers } of [
    { name: 'agent-evaluation-lab', title: 'Agent Evaluation Lab Example', marker: /data-eval-run="run_support_triage_v2"/ },
    { name: 'agent-memory-workspace', title: 'Agent Memory Workspace Example', marker: /data-memory="mem_support_hours"/ },
    { name: 'agent-task-board', title: 'Agent Task Board Example', marker: /data-agent-run="run_customer_import"/ },
    { name: 'agent-tool-registry', title: 'Agent Tool Registry Example', marker: /data-tool-request="req_prod_database_export"/ },
    { name: 'approval-workflow', title: 'Approval Workflow Example', marker: /data-change-request="cr_launch_policy"/ },
    { name: 'catalog', title: 'Catalog Example', marker: /data-product="prod_fixture_kit"/ },
    {
      name: 'cms',
      title: 'CMS Example',
      marker: /data-page="page_home" data-publish-state="published"/,
      extraMarkers: [/data-page="page_docs" data-publish-state="unpublished"/],
    },
    {
      name: 'cms-with-page-builder',
      title: 'CMS With Page Builder Example',
      marker: /data-page-builder-page="page_home" data-publish-state="published"/,
      extraMarkers: [/data-page-builder-page="page_product" data-publish-state="unpublished"/],
    },
    { name: 'forums', title: 'Forums Example', marker: /data-topic="topic_welcome"/ },
    { name: 'issue-tracker', title: 'Issue Tracker Example', marker: /data-issue="issue_1"/ },
    { name: 'login-api-keys', title: 'API Key Login Example', marker: /data-api-key="key_billing_sync"/ },
    { name: 'login-magic-link', title: 'Magic Link Login Example', marker: /data-login-request="login_req_maya"/ },
    { name: 'login-oauth', title: 'OAuth Login Example', marker: /data-external-account="acct_iris_google"/ },
    { name: 'login-organization', title: 'Organization Login Example', marker: /data-membership="mbr_nina_acme"/ },
    { name: 'login-password', title: 'Password Login Example', marker: /data-login-user="user_ada"/ },
  ]) {
    const cwd = await copyExampleProject(name);
    await syncDb(await loadConfig({ cwd }));
    const { stdout: demoHtml } = await execFileAsync(process.execPath, ['src/render-html.mjs'], { cwd });

    assert.match(demoHtml, /cdn\.tailwindcss\.com/);
    assert.match(demoHtml, new RegExp(`<h1[^>]*>${title}<\\/h1>`));
    assert.match(demoHtml, marker);
    for (const extraMarker of extraMarkers ?? []) {
      assert.match(demoHtml, extraMarker);
    }
  }

  const adminPanelCwd = await copyExampleProject('admin-panel');
  await syncDb(await loadConfig({ cwd: adminPanelCwd }));
  const { stdout: adminPanelStdout } = await execFileAsync(process.execPath, ['src/admin-crud.mjs'], { cwd: adminPanelCwd });
  const adminPanelResult = JSON.parse(adminPanelStdout);
  assert.equal(adminPanelResult.created, 'preview_search');
  assert.deepEqual(adminPanelResult.patched, {
    enabled: true,
    rolloutPercent: 25,
  });
  assert.deepEqual(adminPanelResult.setting, {
    id: 'setting_theme',
    value: 'dark',
  });
  assert.equal(adminPanelResult.deleted, true);
  assert.deepEqual(adminPanelResult.remainingFlags, ['quick_filters']);

  for (const name of [
    'permission-abac',
    'permission-acl',
    'permission-pbac',
    'permission-rbac',
    'permission-rebac',
  ]) {
    const cwd = await copyExampleProject(name);
    await syncDb(await loadConfig({ cwd }));
    const { stdout: permissionHtml } = await execFileAsync(process.execPath, ['src/render-html.mjs'], { cwd });

    assert.match(permissionHtml, /cdn\.tailwindcss\.com/);
    assert.match(permissionHtml, new RegExp(`<h1[^>]*>${examplesTitle(name)}<\\/h1>`));
    assert.match(permissionHtml, /data-result="allow"/);
    assert.match(permissionHtml, /data-result="deny"/);
  }

  const manifestCwd = await copyExampleProject('schema-manifest');
  await syncDb(await loadConfig({ cwd: manifestCwd }));
  const manifest = JSON.parse(await readFile(path.join(manifestCwd, 'src/generated/db.schema.json'), 'utf8'));
  assert.equal(manifest.collections.projects.fields.status.schemaUi.component, 'segmented-control');
  assert.equal(manifest.collections.users.fields.bio.schemaUi.component, 'markdown');
  assert.equal('ui' in manifest.collections.projects.fields.status, false);

  const schemaUiCwd = await copyExampleProject('schema-ui');
  await syncDb(await loadConfig({ cwd: schemaUiCwd }));
  const schemaUiManifest = JSON.parse(await readFile(path.join(schemaUiCwd, 'src/generated/db.schema.json'), 'utf8'));
  assert.equal(schemaUiManifest.collections.pages.schemaUi.title, 'Pages');
  assert.equal(schemaUiManifest.collections.pages.fields.status.schemaUi.component, 'segmented-control');
  assert.equal(schemaUiManifest.collections.pages.fields.bodyMarkdown.schemaUi.component, 'markdown');
  assert.equal('ui' in schemaUiManifest.collections.pages.fields.status, false);
  assert.equal('blocks' in schemaUiManifest.collections.pages.fields, false);

  const { stdout } = await execFileAsync(process.execPath, ['src/render-admin.mjs'], { cwd: schemaUiCwd });
  assert.match(stdout, /<h1>Schema UI Example<\/h1>/);
  assert.match(stdout, /data-mode="view" data-component="markdown" data-field="bodyMarkdown"/);
  assert.match(stdout, /data-mode="editor" data-component="relationSelect" data-field="authorId"/);
  assert.doesNotMatch(stdout, /object-array/);

  const recursiveSchemaUiCwd = await copyExampleProject('recursive-schema-ui');
  await syncDb(await loadConfig({ cwd: recursiveSchemaUiCwd }));
  const recursiveManifest = JSON.parse(await readFile(path.join(recursiveSchemaUiCwd, 'src/generated/db.schema.json'), 'utf8'));
  assert.equal(recursiveManifest.collections.pages.schemaUi.title, 'Pages');
  assert.equal(recursiveManifest.collections.users.schemaUi.hidden, true);
  assert.equal(recursiveManifest.collections.pages.fields.status.schemaUi.component, 'segmented-control');
  assert.equal(recursiveManifest.collections.pages.fields.bodyMarkdown.schemaUi.component, 'markdown');
  assert.equal('ui' in recursiveManifest.collections.pages.fields.status, false);
  assert.equal(recursiveManifest.collections.pages.fields.blocks.type, 'array');

  const { stdout: recursiveStdout } = await execFileAsync(process.execPath, ['src/render-admin.mjs'], { cwd: recursiveSchemaUiCwd });
  assert.match(recursiveStdout, /<h1>Recursive Schema UI Example<\/h1>/);
  assert.match(recursiveStdout, /data-mode="view" data-component="markdown" data-pointer="\/bodyMarkdown"/);
  assert.match(recursiveStdout, /data-mode="editor" data-component="relationSelect" data-pointer="\/authorId"/);
  assert.match(recursiveStdout, /data-mode="editor" data-component="object-array" data-pointer="\/blocks"/);

  const recursiveDb = await openDb({ cwd: recursiveSchemaUiCwd, syncOnOpen: false });
  await recursiveDb.runtime.hydrate();
  const recursivePages = await recursiveDb.collection('pages').all();
  const recursiveUsers = await recursiveDb.collection('users').all();
  const homePage = recursivePages.find((row) => row.id === 'page_home');
  assert.ok(homePage);
  const homeHtml = renderHomePage(recursiveManifest, {
    pages: recursivePages,
    users: recursiveUsers,
  });
  assert.match(homeHtml, /\/cms\/pages/);
  assert.doesNotMatch(homeHtml, /\/cms\/users/);
  const ssrHtml = renderRecordDetailPage(recursiveManifest, 'pages', homePage, {
    pages: recursivePages,
    users: recursiveUsers,
  });
  assert.match(ssrHtml, /Ada Lovelace/);
  assert.match(ssrHtml, /# Welcome/);
  assert.match(ssrHtml, /name="\/blocks\/0\/title"/);
  assert.match(ssrHtml, /name="\/blocks\/0\/settings\/color"/);

  const patch = parseSchemaUiFormBody(new URLSearchParams([
    ['/title', 'Updated home'],
    ['/blocks/0/title', 'Updated hero'],
    ['/blocks/0/settings/color', 'blue'],
  ]), recursiveManifest.collections.pages, homePage);
  assert.equal(patch.title, 'Updated home');
  assert.equal(patch.blocks[0].title, 'Updated hero');
  assert.equal(patch.blocks[0].settings.color, 'blue');
  assert.equal(patch.blocks[0].kind, homePage.blocks[0].kind);

  await saveSchemaUiRecord(recursiveDb, recursiveManifest, 'pages', 'page_home', new URLSearchParams([
    ['/title', 'Saved home'],
    ['/blocks/0/title', 'Saved hero'],
    ['/blocks/0/settings/color', 'green'],
  ]));
  const saved = await recursiveDb.collection('pages').get('page_home');
  assert.equal(saved.title, 'Saved home');
  assert.equal(saved.blocks[0].title, 'Saved hero');
  assert.equal(saved.blocks[0].settings.color, 'green');
  assert.deepEqual(recursiveDb.resourceNames(), ['pages', 'users']);
});

test('hono auth example shows lifecycle hook integration code', async () => {
  const source = await readFile(path.resolve('examples/hono-auth/src/app.mjs'), 'utf8');

  assert.match(source, /registerDbRoutes/);
  assert.match(source, /lifecycleHooks/);
  assert.match(source, /beforeRequest/);
  assert.match(source, /beforeWrite/);
  assert.match(source, /Bearer admin-token/);
  assert.match(source, /Bearer user-token/);
});

async function copyExampleProject(name) {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'db-example-test-'));
  const cwd = path.join(tempRoot, name);
  await cp(path.resolve('examples', name), cwd, {
    recursive: true,
    filter(source) {
      return !source.split(path.sep).includes('.db');
    },
  });
  await mkdir(path.join(cwd, 'node_modules/@async'), { recursive: true });
  await symlink(path.resolve('.'), path.join(cwd, 'node_modules/@async/db'), 'dir');
  return cwd;
}

function assertExampleOrder(markdown, linkTokenFor, orderedExamples = mainOrderedExamples) {
  let lastIndex = -1;

  for (const example of orderedExamples) {
    const foundIndex = markdown.indexOf(linkTokenFor(example));

    assert.notEqual(foundIndex, -1, `${example} missing from example order`);
    assert.ok(foundIndex > lastIndex, `${example} appears out of order`);
    lastIndex = foundIndex;
  }
}

function sectionAfter(markdown, heading) {
  const index = markdown.indexOf(heading);

  assert.notEqual(index, -1, `${heading} missing`);
  return markdown.slice(index);
}

function examplesTitle(name) {
  return {
    'permission-acl': 'ACL Permission Example',
    'permission-abac': 'ABAC Permission Example',
    'permission-pbac': 'PBAC Permission Example',
    'permission-rbac': 'RBAC Permission Example',
    'permission-rebac': 'ReBAC Permission Example',
  }[name];
}
