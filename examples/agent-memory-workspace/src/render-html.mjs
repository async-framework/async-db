import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [memorySpaces, sources, chunks, memories, claims, citations, conflicts, refreshJobs] = await Promise.all([
  db.collection('memorySpaces').all(),
  db.collection('sources').all(),
  db.collection('chunks').all(),
  db.collection('memories').all(),
  db.collection('claims').all(),
  db.collection('citations').all(),
  db.collection('conflicts').all(),
  db.collection('refreshJobs').all(),
]);

const spacesById = new Map(memorySpaces.map((space) => [space.id, space]));
const sourcesById = new Map(sources.map((source) => [source.id, source]));
const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
const claimsByMemoryId = groupBy(claims, 'memoryId');
const citationsByMemoryId = groupBy(citations, 'memoryId');
const conflictsByMemoryId = groupBy(conflicts, 'memoryId');

const rows = memories.map((memory) => ({
  ...memory,
  memorySpace: spacesById.get(memory.memorySpaceId),
  claims: claimsByMemoryId.get(memory.id) ?? [],
  citations: (citationsByMemoryId.get(memory.id) ?? []).map((citation) => ({
    ...citation,
    source: sourcesById.get(citation.sourceId),
    chunk: chunksById.get(citation.chunkId),
  })),
  conflicts: conflictsByMemoryId.get(memory.id) ?? [],
}));

console.log(renderPage(rows));

function renderPage(memories) {
  const openConflicts = conflicts.filter((conflict) => conflict.status === 'open').length;
  const queuedRefreshes = refreshJobs.filter((job) => job.status === 'queued').length;
  const sourceCount = sources.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Memory Workspace Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-stone-50 text-stone-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Agent Memory Workspace Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-stone-600">Durable memories stay connected to sources, chunks, claims, citations, conflicts, and refresh jobs.</p>
    </header>
    <section class="mb-5 grid gap-3 md:grid-cols-3">
      ${renderStat('Sources', sourceCount)}
      ${renderStat('Open conflicts', openConflicts)}
      ${renderStat('Queued refreshes', queuedRefreshes)}
    </section>
    <section class="grid gap-4 lg:grid-cols-2">
      ${memories.map(renderMemory).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderStat(label, value) {
  return `<div class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase tracking-normal text-stone-500">${escapeHtml(label)}</p>
        <p class="mt-2 text-2xl font-semibold text-stone-950">${escapeHtml(value)}</p>
      </div>`;
}

function renderMemory(memory) {
  return `<article data-memory="${escapeHtml(memory.id)}" class="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-normal text-stone-500">${escapeHtml(memory.memorySpace?.name ?? memory.memorySpaceId)}</p>
            <h2 class="mt-2 text-lg font-semibold">${escapeHtml(memory.title)}</h2>
            <p class="mt-2 text-sm text-stone-600">${escapeHtml(memory.summary)}</p>
          </div>
          <span class="${freshnessClass(memory.freshness)}">${escapeHtml(labelFor(memory.freshness))}</span>
        </div>
        <div class="mt-4 grid gap-3 md:grid-cols-3">
          ${renderSmall('Confidence', memory.confidence)}
          ${renderSmall('Claims', memory.claims.length)}
          ${renderSmall('Citations', memory.citations.length)}
        </div>
        <section class="mt-4">
          <h3 class="text-sm font-semibold text-stone-900">Evidence</h3>
          <div class="mt-2 space-y-2">
            ${memory.citations.map(renderCitation).join('\n            ')}
          </div>
        </section>
        <section class="mt-4">
          <h3 class="text-sm font-semibold text-stone-900">Conflicts</h3>
          <div class="mt-2 space-y-2">${memory.conflicts.map(renderConflict).join('') || '<p class="text-sm text-stone-500">No open conflict records.</p>'}</div>
        </section>
      </article>`;
}

function renderSmall(label, value) {
  return `<div class="rounded-md bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200">
            <p class="text-xs font-medium uppercase tracking-normal text-stone-500">${escapeHtml(label)}</p>
            <p class="mt-1 text-sm font-semibold text-stone-900">${escapeHtml(labelFor(value))}</p>
          </div>`;
}

function renderCitation(citation) {
  return `<div class="rounded-md border border-stone-200 bg-stone-50 p-3">
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm font-medium text-stone-900">${escapeHtml(citation.source?.title ?? citation.sourceId)}</span>
                <span class="${citationClass(citation.relevance)}">${escapeHtml(labelFor(citation.relevance))}</span>
              </div>
              <p class="mt-1 text-xs text-stone-500">${escapeHtml(citation.chunk?.heading ?? citation.chunkId)} - ${escapeHtml(citation.quote)}</p>
            </div>`;
}

function renderConflict(conflict) {
  return `<p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">${escapeHtml(conflict.summary)}</p>`;
}

function freshnessClass(freshness) {
  const classes = {
    fresh: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    stale: 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700',
    review_needed: 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
  };
  return classes[freshness] ?? classes.fresh;
}

function citationClass(relevance) {
  return relevance === 'conflicting'
    ? 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700'
    : 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700';
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
