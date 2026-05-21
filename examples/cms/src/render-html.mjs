import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [pages, media, menus] = await Promise.all([
  db.collection('pages').all(),
  db.collection('media').all(),
  db.collection('menus').all(),
]);

const mediaById = new Map(media.map((asset) => [asset.id, asset]));
const headerMenu = menus.find((menu) => menu.location === 'header');
const publishCounts = countPublishStates(pages);

console.log(renderPage(pages));

function renderPage(rows) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CMS Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-5xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">CMS Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Pages keep SEO, menu links, content blocks, and published/unpublished state as fixture-backed records.</p>
      <div class="mt-4 flex flex-wrap gap-2 text-sm">
        <span class="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">${publishCounts.published} published</span>
        <span class="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">${publishCounts.unpublished} unpublished</span>
      </div>
      ${renderMenu(headerMenu)}
    </header>
    <section class="grid gap-4 lg:grid-cols-2">
      ${rows.map(renderPageCard).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderMenu(menu) {
  if (!menu) {
    return '';
  }

  return `<nav class="mt-4 flex flex-wrap gap-2" aria-label="${escapeHtml(menu.label)}">
        ${menu.items.map((item) => `<span class="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700">${escapeHtml(item.label)}</span>`).join('\n        ')}
      </nav>`;
}

function renderPageCard(page) {
  return `<article data-page="${escapeHtml(page.id)}" data-publish-state="${escapeHtml(page.status)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-slate-950">${escapeHtml(page.title)}</h2>
            <p class="mt-1 text-sm text-slate-600">/${escapeHtml(page.slug)} · ${escapeHtml(page.template)}</p>
          </div>
          <span class="${statusClass(page.status)}">${escapeHtml(page.status)}</span>
        </div>
        <p class="mt-4 text-sm text-slate-600">${escapeHtml(page.seo?.description ?? '')}</p>
        <div class="mt-4 space-y-2">
          ${(page.blocks ?? []).map(renderBlock).join('\n          ')}
        </div>
      </article>`;
}

function renderBlock(block) {
  const asset = block.mediaId ? mediaById.get(block.mediaId) : null;
  const detail = asset
    ? `${asset.kind}: ${asset.alt}`
    : block.bodyMarkdown ?? 'No body text';

  return `<div class="rounded-md bg-slate-50 p-3">
            <div class="flex items-center justify-between gap-3">
              <strong class="text-sm text-slate-900">${escapeHtml(block.title ?? block.kind)}</strong>
              <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">${escapeHtml(block.kind)}</span>
            </div>
            <p class="mt-2 text-sm text-slate-600">${escapeHtml(detail)}</p>
          </div>`;
}

function statusClass(status) {
  const classes = {
    published: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    unpublished: 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600',
  };
  return classes[status] ?? classes.unpublished;
}

function countPublishStates(rows) {
  return rows.reduce((counts, page) => {
    if (page.status === 'published') {
      counts.published += 1;
    } else {
      counts.unpublished += 1;
    }

    return counts;
  }, {
    published: 0,
    unpublished: 0,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
