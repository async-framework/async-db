import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [users, organizations, memberships, invitations, sessions] = await Promise.all([
  db.collection('users').all(),
  db.collection('organizations').all(),
  db.collection('memberships').all(),
  db.collection('invitations').all(),
  db.collection('sessions').all(),
]);

const usersById = new Map(users.map((user) => [user.id, user]));
const organizationsById = new Map(organizations.map((organization) => [organization.id, organization]));
const invitationsByOrganizationId = groupBy(invitations, 'organizationId');
const sessionsByOrganizationId = groupBy(sessions, 'organizationId');
const rows = memberships.map((membership) => ({
  ...membership,
  user: usersById.get(membership.userId),
  organization: organizationsById.get(membership.organizationId),
  invitations: invitationsByOrganizationId.get(membership.organizationId) ?? [],
  sessions: sessionsByOrganizationId.get(membership.organizationId) ?? [],
}));

console.log(renderPage(rows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Organization Login Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-50 text-stone-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Organization Login Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-stone-600">Workspace login joins users, organizations, memberships, invitations, and org-scoped sessions.</p>
    </header>
    <section class="grid gap-4 md:grid-cols-2">
      ${rows.map(renderMembership).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderMembership(membership) {
  const pendingInvites = membership.invitations.filter((invitation) => invitation.status === 'pending').length;
  const activeSessions = membership.sessions.filter((session) => session.status === 'active').length;

  return `<article data-membership="${escapeHtml(membership.id)}" class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">${escapeHtml(membership.organization?.name ?? membership.organizationId)}</h2>
            <p class="mt-1 text-sm text-stone-600">${escapeHtml(membership.user?.name ?? membership.userId)} · ${escapeHtml(membership.user?.email)}</p>
          </div>
          <span class="${statusClass(membership.status)}">${escapeHtml(labelFor(membership.status))}</span>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          ${renderFact('Role', membership.role)}
          ${renderFact('Sessions', activeSessions)}
          ${renderFact('Pending invites', pendingInvites)}
        </div>
      </article>`;
}

function renderFact(label, value) {
  return `<div class="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200">
            <p class="text-xs font-medium uppercase tracking-normal text-stone-500">${escapeHtml(label)}</p>
            <p class="mt-1 text-sm font-semibold text-stone-900">${escapeHtml(labelFor(value))}</p>
          </div>`;
}

function statusClass(status) {
  const classes = {
    active: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    pending: 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
    removed: 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700',
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
