import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [evalSuites, testCases, models, prompts, evalRuns, scores, regressions] = await Promise.all([
  db.collection('evalSuites').all(),
  db.collection('testCases').all(),
  db.collection('models').all(),
  db.collection('prompts').all(),
  db.collection('evalRuns').all(),
  db.collection('scores').all(),
  db.collection('regressions').all(),
]);

const suitesById = new Map(evalSuites.map((suite) => [suite.id, suite]));
const modelsById = new Map(models.map((model) => [model.id, model]));
const promptsById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
const casesById = new Map(testCases.map((testCase) => [testCase.id, testCase]));
const scoresByRunId = groupBy(scores, 'evalRunId');
const regressionsByRunId = groupBy(regressions, 'evalRunId');

const rows = evalRuns.map((run) => ({
  ...run,
  evalSuite: suitesById.get(run.evalSuiteId),
  model: modelsById.get(run.modelId),
  prompt: promptsById.get(run.promptId),
  scores: (scoresByRunId.get(run.id) ?? []).map((score) => ({ ...score, testCase: casesById.get(score.testCaseId) })),
  regressions: (regressionsByRunId.get(run.id) ?? []).map((regression) => ({ ...regression, testCase: casesById.get(regression.testCaseId) })),
}));

console.log(renderPage(rows));

function renderPage(runs) {
  const latest = runs.at(-1);
  const openRegressions = regressions.filter((regression) => regression.status === 'open').length;
  const passingScores = scores.filter((score) => score.passed).length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Evaluation Lab Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-50 text-zinc-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Agent Evaluation Lab Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-zinc-600">Evaluation records compare prompt and model pairs against fixture test cases, scores, and regressions.</p>
    </header>
    <section class="mb-5 grid gap-3 md:grid-cols-3">
      ${renderStat('Eval runs', runs.length)}
      ${renderStat('Passing scores', `${passingScores}/${scores.length}`)}
      ${renderStat('Open regressions', openRegressions)}
    </section>
    <section class="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
      <div class="space-y-4">
        ${runs.map(renderRun).join('\n        ')}
      </div>
      <aside class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 class="text-sm font-semibold text-zinc-900">Latest run</h2>
        ${latest ? renderLatest(latest) : '<p class="mt-2 text-sm text-zinc-500">No runs.</p>'}
      </aside>
    </section>
  </main>
</body>
</html>`;
}

function renderStat(label, value) {
  return `<div class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase tracking-normal text-zinc-500">${escapeHtml(label)}</p>
        <p class="mt-2 text-2xl font-semibold text-zinc-950">${escapeHtml(value)}</p>
      </div>`;
}

function renderRun(run) {
  const passed = run.scores.filter((score) => score.passed).length;
  const passRate = Math.round((passed / Math.max(run.scores.length, 1)) * 100);

  return `<article data-eval-run="${escapeHtml(run.id)}" class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-normal text-zinc-500">${escapeHtml(run.evalSuite?.name ?? run.evalSuiteId)}</p>
              <h2 class="mt-2 text-lg font-semibold">${escapeHtml(run.model?.name ?? run.modelId)} with ${escapeHtml(run.prompt?.version ?? run.promptId)}</h2>
              <p class="mt-2 text-sm text-zinc-600">${escapeHtml(run.summary)}</p>
            </div>
            <span class="${statusClass(run.status)}">${escapeHtml(labelFor(run.status))}</span>
          </div>
          <div class="mt-4">
            <div class="mb-2 flex justify-between text-xs font-medium text-zinc-500">
              <span>${passed}/${run.scores.length} scores passed</span>
              <span>${passRate}%</span>
            </div>
            <div class="h-2 rounded-full bg-zinc-100"><div class="h-2 rounded-full bg-emerald-500" style="width: ${passRate}%"></div></div>
          </div>
          <div class="mt-4 grid gap-2 sm:grid-cols-2">
            ${run.scores.map(renderScore).join('\n            ')}
          </div>
        </article>`;
}

function renderScore(score) {
  return `<div class="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-zinc-900">${escapeHtml(score.testCase?.name ?? score.testCaseId)}</span>
                <span class="${score.passed ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700' : 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700'}">${score.passed ? 'Pass' : 'Fail'}</span>
              </div>
              <p class="mt-1 text-xs text-zinc-500">${escapeHtml(labelFor(score.metric))}: ${escapeHtml(score.value)} - ${escapeHtml(score.notes)}</p>
            </div>`;
}

function renderLatest(run) {
  return `<div class="mt-3 space-y-3">
          ${renderSmall('Model', run.model?.name ?? run.modelId)}
          ${renderSmall('Prompt', `${run.prompt?.name ?? run.promptId} ${run.prompt?.version ?? ''}`)}
          ${renderSmall('Regressions', run.regressions.length)}
          <div class="rounded-md border border-zinc-200 p-3">
            <h3 class="text-sm font-semibold text-zinc-900">Regression notes</h3>
            <div class="mt-2 space-y-2">${run.regressions.map((regression) => `<p class="text-sm text-zinc-600">${escapeHtml(regression.testCase?.name ?? regression.testCaseId)} - ${escapeHtml(regression.summary)}</p>`).join('') || '<p class="text-sm text-zinc-500">No regressions.</p>'}</div>
          </div>
        </div>`;
}

function renderSmall(label, value) {
  return `<div class="rounded-md bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200">
            <p class="text-xs font-medium uppercase tracking-normal text-zinc-500">${escapeHtml(label)}</p>
            <p class="mt-1 text-sm font-semibold text-zinc-900">${escapeHtml(value)}</p>
          </div>`;
}

function statusClass(status) {
  const classes = {
    queued: 'rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600',
    running: 'rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700',
    completed: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    failed: 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700',
  };
  return classes[status] ?? classes.queued;
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
