import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, roles, documents] = await Promise.all([
  db.collection('users').all(),
  db.collection('roles').all(),
  db.collection('documents').all(),
]);

const rolesById = new Map(roles.map((role) => [role.id, role]));
const usersById = new Map(users.map((user) => [user.id, user]));
const documentsById = new Map(documents.map((document) => [document.id, document]));

function permissionsFor(user) {
  return new Set(user.roleIds.flatMap((roleId) => rolesById.get(roleId)?.permissions ?? []));
}

function can(user, action) {
  return permissionsFor(user).has(`documents:${action}`);
}

const decisions = [
  {
    label: 'Admin can delete site settings',
    user: usersById.get('user_admin'),
    action: 'delete',
    document: documentsById.get('doc_site_settings'),
  },
  {
    label: 'Viewer cannot edit release notes',
    user: usersById.get('user_viewer'),
    action: 'edit',
    document: documentsById.get('doc_release_notes'),
  },
];

console.log(renderPage(decisions.map((decision) => ({
  ...decision,
  allowed: can(decision.user, decision.action),
}))));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RBAC Permission Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-4xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">RBAC Permission Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Users get permissions from roles. The app checks the role permission keys before rendering an action.</p>
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
