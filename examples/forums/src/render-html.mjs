import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [categories, topics, posts, users] = await Promise.all([
  db.collection('categories').all(),
  db.collection('topics').all(),
  db.collection('posts').all(),
  db.collection('users').all(),
]);

const categoriesById = new Map(categories.map((category) => [category.id, category]));
const usersById = new Map(users.map((user) => [user.id, user]));
const postsByTopicId = groupBy(posts, 'topicId');
const topicRows = topics
  .map((topic) => ({
    ...topic,
    category: categoriesById.get(topic.categoryId),
    author: usersById.get(topic.authorId),
    replies: postsByTopicId.get(topic.id) ?? [],
  }))
  .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.lastPostAt.localeCompare(left.lastPostAt));

console.log(renderPage(topicRows));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forums Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Forums Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Topics join categories and authors, while replies stay as their own records.</p>
    </header>
    <section class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-100 text-left text-xs font-semibold uppercase tracking-normal text-slate-600">
          <tr><th class="px-4 py-3">Topic</th><th class="px-4 py-3">Category</th><th class="px-4 py-3">Author</th><th class="px-4 py-3">Replies</th><th class="px-4 py-3">Updated</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${rows.map(renderTopicRow).join('\n          ')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function renderTopicRow(topic) {
  return `<tr data-topic="${escapeHtml(topic.id)}">
            <td class="px-4 py-3">
              <div class="font-semibold text-slate-950">${topic.pinned ? 'Pinned: ' : ''}${escapeHtml(topic.title)}</div>
              <div class="mt-1 text-xs text-slate-500">${escapeHtml(topic.status)}</div>
            </td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(topic.category?.title ?? topic.categoryId)}</td>
            <td class="px-4 py-3 text-slate-700">${escapeHtml(topic.author?.displayName ?? topic.authorId)}</td>
            <td class="px-4 py-3 font-medium text-slate-900">${topic.replies.length}</td>
            <td class="px-4 py-3 text-slate-600">${formatDate(topic.lastPostAt)}</td>
          </tr>`;
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

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
