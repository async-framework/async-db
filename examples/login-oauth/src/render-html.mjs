import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, externalAccounts, sessions] = await Promise.all([
  db.collection('users').all(),
  db.collection('externalAccounts').all(),
  db.collection('sessions').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const sessionsByAccountId = groupBy(sessions, 'externalAccountId');
const rows = externalAccounts.map((account) => ({
  ...account,
  user: usersById.get(account.userId),
  sessions: sessionsByAccountId.get(account.id) ?? [],
}));

console.log(renderPage(rows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OAuth Login Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-50 text-zinc-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">OAuth Login Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-zinc-600">Local users join to provider account links and sessions while provider tokens stay out of fixtures.</p>
    </header>
    <section class="grid gap-4 md:grid-cols-2">
      ${rows.map(renderAccount).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderAccount(account) {
  return `<article data-external-account="${escapeHtml(account.id)}" class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">${escapeHtml(account.user?.name ?? account.userId)}</h2>
            <p class="mt-1 text-sm text-zinc-600">${escapeHtml(account.user?.email)}</p>
          </div>
          <span class="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">${escapeHtml(labelFor(account.provider))}</span>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          ${renderFact('Subject', account.providerSubject)}
          ${renderFact('Verified', account.emailVerified ? 'yes' : 'no')}
          ${renderFact('Sessions', account.sessions.length)}
        </div>
        <div class="mt-4 flex flex-wrap gap-1.5">${account.scopes.map(renderScope).join('')}</div>
      </article>`;
}

function renderFact(label, value) {
  return `<div class="rounded-md bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200">
            <p class="text-xs font-medium uppercase tracking-normal text-zinc-500">${escapeHtml(label)}</p>
            <p class="mt-1 text-sm font-semibold text-zinc-900">${escapeHtml(labelFor(value))}</p>
          </div>`;
}

function renderScope(scope) {
  return `<span class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">${escapeHtml(scope)}</span>`;
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
