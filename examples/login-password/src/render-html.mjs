import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, credentials, sessions, passwordResetRequests] = await Promise.all([
  db.collection('users').all(),
  db.collection('credentials').all(),
  db.collection('sessions').all(),
  db.collection('passwordResetRequests').all(),
]);

const credentialsByUserId = new Map(credentials.map((credential) => [credential.userId, credential]));
const sessionsByUserId = groupBy(sessions, 'userId');
const resetsByUserId = groupBy(passwordResetRequests, 'userId');

const rows = users.map((user) => ({
  ...user,
  credential: credentialsByUserId.get(user.id),
  sessions: sessionsByUserId.get(user.id) ?? [],
  resets: resetsByUserId.get(user.id) ?? [],
}));

console.log(renderPage(rows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Password Login Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Password Login Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Users join credentials, sessions, and reset requests while fixtures store fingerprints instead of secrets.</p>
    </header>
    <section class="grid gap-4 md:grid-cols-2">
      ${rows.map(renderUser).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderUser(user) {
  const activeSessions = user.sessions.filter((session) => session.status === 'active').length;
  const pendingResets = user.resets.filter((reset) => reset.status === 'pending').length;

  return `<article data-login-user="${escapeHtml(user.id)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">${escapeHtml(user.name)}</h2>
            <p class="mt-1 text-sm text-slate-600">${escapeHtml(user.email)}</p>
          </div>
          <span class="${statusClass(user.status)}">${escapeHtml(labelFor(user.status))}</span>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          ${renderFact('Credential', user.credential?.status)}
          ${renderFact('Sessions', activeSessions)}
          ${renderFact('Reset requests', pendingResets)}
        </div>
        <p class="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">${escapeHtml(user.credential?.hashAlgorithm)} · ${escapeHtml(user.credential?.hashFingerprint)}</p>
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
    locked: 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
    disabled: 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700',
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
