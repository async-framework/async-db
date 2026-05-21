import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, serviceAccounts, apiKeys, keyScopes, keyAuditEvents] = await Promise.all([
  db.collection('users').all(),
  db.collection('serviceAccounts').all(),
  db.collection('apiKeys').all(),
  db.collection('keyScopes').all(),
  db.collection('keyAuditEvents').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const serviceAccountsById = new Map(serviceAccounts.map((account) => [account.id, account]));
const scopesByKeyId = groupBy(keyScopes, 'apiKeyId');
const eventsByKeyId = groupBy(keyAuditEvents, 'apiKeyId');
const rows = apiKeys.map((apiKey) => {
  const serviceAccount = serviceAccountsById.get(apiKey.serviceAccountId);
  return {
    ...apiKey,
    serviceAccount,
    owner: usersById.get(serviceAccount?.ownerUserId),
    scopes: scopesByKeyId.get(apiKey.id) ?? [],
    events: eventsByKeyId.get(apiKey.id) ?? [],
  };
});

console.log(renderPage(rows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Key Login Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">API Key Login Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Machine login joins service accounts, key fingerprints, scopes, owners, and audit events without storing raw keys.</p>
    </header>
    <section class="grid gap-4 md:grid-cols-2">
      ${rows.map(renderKey).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderKey(apiKey) {
  return `<article data-api-key="${escapeHtml(apiKey.id)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">${escapeHtml(apiKey.label)}</h2>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml(apiKey.serviceAccount?.name ?? apiKey.serviceAccountId)} · ${escapeHtml(apiKey.owner?.email)}</p>
          </div>
          <span class="${statusClass(apiKey.status)}">${escapeHtml(labelFor(apiKey.status))}</span>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          ${renderFact('Prefix', apiKey.keyPrefix)}
          ${renderFact('Scopes', apiKey.scopes.length)}
          ${renderFact('Audit events', apiKey.events.length)}
        </div>
        <p class="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">${escapeHtml(apiKey.fingerprint)}</p>
      </article>`;
}

function renderFact(label, value) {
  return `<div class="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
            <p class="text-xs font-medium uppercase tracking-normal text-slate-500">${escapeHtml(label)}</p>
            <p class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(labelFor(value))}</p>
          </div>`;
}

function statusClass(status) {
  const classes = {
    active: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    rotation_due: 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
    revoked: 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700',
  };
  return classes[status] ?? classes.active;
}

function labelFor(value) {
  return String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record[key]) ?? [];
    group.push(record);
    groups.set(record[key], group);
  }
  return groups;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
