import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [projects, issues, comments, users, labels] = await Promise.all([
  db.collection('projects').all(),
  db.collection('issues').all(),
  db.collection('comments').all(),
  db.collection('users').all(),
  db.collection('labels').all(),
]);

const projectsById = new Map(projects.map((project) => [project.id, project]));
const usersById = new Map(users.map((user) => [user.id, user]));
const labelsById = new Map(labels.map((label) => [label.id, label]));
const commentsByIssueId = groupBy(comments, 'issueId');
const columns = ['todo', 'in_progress', 'done'];
const issueRows = issues.map((issue) => ({
  ...issue,
  project: projectsById.get(issue.projectId),
  assignee: usersById.get(issue.assigneeId),
  labels: (issue.labelIds ?? []).map((id) => labelsById.get(id)).filter(Boolean),
  comments: commentsByIssueId.get(issue.id) ?? [],
}));

console.log(renderPage(issueRows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Issue Tracker Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Issue Tracker Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Issues join projects, assignees, labels, and comments without adding an app framework.</p>
    </header>
    <section class="grid gap-4 lg:grid-cols-3">
      ${columns.map((status) => renderColumn(status, rows.filter((issue) => issue.status === status))).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderColumn(status, rows) {
  return `<section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold uppercase tracking-normal text-slate-600">${escapeHtml(labelForStatus(status))}</h2>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">${rows.length}</span>
        </div>
        <div class="space-y-3">${rows.map(renderIssueCard).join('\n          ') || '<p class="text-sm text-slate-500">No issues.</p>'}</div>
      </section>`;
}

function renderIssueCard(issue) {
  return `<article data-issue="${escapeHtml(issue.id)}" class="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-start justify-between gap-3">
              <h3 class="text-sm font-semibold text-slate-950">${escapeHtml(issue.title)}</h3>
              <span class="${priorityClass(issue.priority)}">${escapeHtml(issue.priority)}</span>
            </div>
            <p class="mt-2 text-xs text-slate-500">${escapeHtml(issue.project?.key ?? issue.projectId)} · ${escapeHtml(issue.assignee?.name ?? 'unassigned')} · ${issue.comments.length} comments</p>
            <div class="mt-3 flex flex-wrap gap-1.5">${issue.labels.map(renderLabel).join('')}</div>
          </article>`;
}

function renderLabel(label) {
  return `<span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">${escapeHtml(label.name)}</span>`;
}

function priorityClass(priority) {
  const classes = {
    high: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
    medium: 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700',
    low: 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600',
  };
  return classes[priority] ?? classes.low;
}

function labelForStatus(status) {
  return {
    todo: 'To do',
    in_progress: 'In progress',
    done: 'Done',
  }[status] ?? status;
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
