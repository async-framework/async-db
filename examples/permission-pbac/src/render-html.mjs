import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, resources, policies] = await Promise.all([
  db.collection('users').all(),
  db.collection('resources').all(),
  db.collection('policies').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
const orderedPolicies = [...policies].sort((left, right) => left.priority - right.priority);

function can(user, action, resource) {
  let allowed = false;

  for (const policy of orderedPolicies) {
    if (!matchesPolicy(policy, user, action, resource)) {
      continue;
    }

    if (policy.effect === 'deny') {
      return false;
    }

    allowed = true;
  }

  return allowed;
}

function matchesPolicy(policy, user, action, resource) {
  return policy.role === user.role
    && policy.action === action
    && policy.resourceKind === resource.kind
    && (!policy.condition?.field || resource[policy.condition.field] === policy.condition.equals);
}

const decisions = [
  {
    label: 'Editor can publish a draft article',
    user: usersById.get('user_editor'),
    action: 'publish',
    resource: resourcesById.get('res_launch_post'),
  },
  {
    label: 'Viewer cannot publish a draft article',
    user: usersById.get('user_viewer'),
    action: 'publish',
    resource: resourcesById.get('res_launch_post'),
  },
];

console.log(renderPage(decisions.map((decision) => ({
  ...decision,
  allowed: can(decision.user, decision.action, decision.resource),
}))));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PBAC Permission Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-4xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">PBAC Permission Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">The app evaluates centralized policy records before rendering an action.</p>
    </header>
    <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-100 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
          <tr><th class="px-4 py-3">Decision</th><th class="px-4 py-3">User role</th><th class="px-4 py-3">Resource</th><th class="px-4 py-3">Result</th></tr>
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
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.user.role)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(row.resource.title)}</td>
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
