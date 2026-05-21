import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, files, contexts] = await Promise.all([
  db.collection('users').all(),
  db.collection('files').all(),
  db.collection('accessContexts').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const filesById = new Map(files.map((file) => [file.id, file]));
const contextsById = new Map(contexts.map((context) => [context.id, context]));
const clearanceRank = new Map([
  ['internal', 1],
  ['confidential', 2],
]);

function canRead(user, file, context) {
  return user.employmentStatus === 'active'
    && user.department === file.department
    && (clearanceRank.get(user.clearance) ?? 0) >= (clearanceRank.get(file.sensitivity) ?? 0)
    && (!file.requiresBusinessHours || context.businessHours)
    && context.network === 'office';
}

const decisions = [
  {
    label: 'Finance manager can read the budget during business hours',
    user: usersById.get('user_finance_manager'),
    file: filesById.get('file_budget'),
    context: contextsById.get('ctx_business_office'),
  },
  {
    label: 'Engineer cannot read the finance budget',
    user: usersById.get('user_engineer'),
    file: filesById.get('file_budget'),
    context: contextsById.get('ctx_business_office'),
  },
];

console.log(renderPage(decisions.map((decision) => ({
  ...decision,
  allowed: canRead(decision.user, decision.file, decision.context),
}))));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ABAC Permission Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-4xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">ABAC Permission Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">The app checks attributes on the user, file, and current environment before rendering access.</p>
    </header>
    <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-100 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
          <tr><th class="px-4 py-3">Decision</th><th class="px-4 py-3">Attributes</th><th class="px-4 py-3">Result</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map(renderRow).join('\n          ')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function renderRow(row) {
  const result = row.allowed ? 'allow' : 'deny';
  const label = row.allowed ? 'Allowed' : 'Denied';
  const resultClass = row.allowed ? 'text-emerald-700' : 'text-rose-700';
  const attributes = `${row.user.department} user, ${row.file.department} file, ${row.context.label}`;

  return `<tr data-result="${result}">
            <td class="px-4 py-3 align-top font-medium text-slate-950">${escapeHtml(row.label)}</td>
            <td class="px-4 py-3 align-top text-slate-700">${escapeHtml(attributes)}</td>
            <td class="px-4 py-3 align-top"><strong class="${resultClass}">${label}</strong></td>
          </tr>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
