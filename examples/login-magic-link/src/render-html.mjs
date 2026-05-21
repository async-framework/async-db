import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, loginRequests, sessions] = await Promise.all([
  db.collection('users').all(),
  db.collection('loginRequests').all(),
  db.collection('sessions').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const sessionsByRequestId = groupBy(sessions, 'loginRequestId');
const rows = loginRequests.map((request) => ({
  ...request,
  user: usersById.get(request.userId),
  sessions: sessionsByRequestId.get(request.id) ?? [],
}));

console.log(renderPage(rows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Magic Link Login Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-sky-50 text-slate-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Magic Link Login Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Passwordless requests track delivery, expiry, acceptance, and resulting sessions without storing usable links or codes.</p>
    </header>
    <section class="grid gap-4 md:grid-cols-2">
      ${rows.map(renderRequest).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderRequest(request) {
  return `<article data-login-request="${escapeHtml(request.id)}" class="rounded-lg border border-sky-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">${escapeHtml(request.user?.name ?? request.userId)}</h2>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml(request.user?.email)}</p>
          </div>
          <span class="${statusClass(request.status)}">${escapeHtml(labelFor(request.status))}</span>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          ${renderFact('Channel', request.channel)}
          ${renderFact('Sessions', request.sessions.length)}
          ${renderFact('Expires', shortDate(request.expiresAt))}
        </div>
        <p class="mt-4 rounded-md bg-sky-50 p-3 text-xs text-sky-700 ring-1 ring-inset ring-sky-100">${escapeHtml(request.codeFingerprint)}</p>
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
    pending: 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
    accepted: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    expired: 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600',
  };
  return classes[status] ?? classes.pending;
}

function shortDate(value) {
  return String(value ?? '').slice(0, 16).replace('T', ' ');
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
