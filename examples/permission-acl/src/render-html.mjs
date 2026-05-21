import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, documents] = await Promise.all([
  db.collection('users').all(),
  db.collection('documents').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const documentsById = new Map(documents.map((document) => [document.id, document]));
const accessRank = new Map([
  ['read', 1],
  ['write', 2],
  ['owner', 3],
]);

function can(user, action, document) {
  const requiredRank = action === 'read' ? 1 : 2;
  const grant = document.acl.find((entry) => entry.userId === user.id);

  return (accessRank.get(grant?.access) ?? 0) >= requiredRank;
}

const decisions = [
  {
    label: 'Owner can write the budget worksheet',
    user: usersById.get('user_finance_owner'),
    action: 'write',
    document: documentsById.get('doc_budget'),
  },
  {
    label: 'Reader cannot write the budget worksheet',
    user: usersById.get('user_finance_reader'),
    action: 'write',
    document: documentsById.get('doc_budget'),
  },
];

console.log(renderPage(decisions.map((decision) => ({
  ...decision,
  allowed: can(decision.user, decision.action, decision.document),
}))));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ACL Permission Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-4xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">ACL Permission Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Each document carries its own access list. The app checks the current user's entry before rendering an action.</p>
    </header>
    <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-100 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
          <tr><th class="px-4 py-3">Decision</th><th class="px-4 py-3">User</th><th class="px-4 py-3">Document</th><th class="px-4 py-3">Result</th></tr>
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

  return `<tr data-result="${result}">
            <td class="px-4 py-3 font-medium text-slate-950">${escapeHtml(row.label)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.user.name)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.document.title)}</td>
            <td class="px-4 py-3"><strong class="${resultClass}">${label}</strong></td>
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
