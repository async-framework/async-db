import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [agents, tasks, runs, runSteps, tools, artifacts, approvals] = await Promise.all([
  db.collection('agents').all(),
  db.collection('tasks').all(),
  db.collection('runs').all(),
  db.collection('runSteps').all(),
  db.collection('tools').all(),
  db.collection('artifacts').all(),
  db.collection('approvals').all(),
]);

const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
const tasksById = new Map(tasks.map((task) => [task.id, task]));
const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
const stepsByRunId = groupBy(runSteps, 'runId');
const artifactsByRunId = groupBy(artifacts, 'runId');
const approvalsByRunId = groupBy(approvals, 'runId');

const rows = runs.map((run) => ({
  ...run,
  agent: agentsById.get(run.agentId),
  task: tasksById.get(run.taskId),
  steps: (stepsByRunId.get(run.id) ?? [])
    .toSorted((left, right) => Number(left.stepNumber ?? 0) - Number(right.stepNumber ?? 0))
    .map((step) => ({ ...step, tool: toolsById.get(step.toolId) })),
  artifacts: artifactsByRunId.get(run.id) ?? [],
  approvals: approvalsByRunId.get(run.id) ?? [],
}));

console.log(renderPage(rows));

function renderPage(runs) {
  const waiting = runs.filter((run) => run.status === 'waiting_for_approval').length;
  const running = runs.filter((run) => run.status === 'running').length;
  const artifactCount = runs.reduce((total, run) => total + run.artifacts.length, 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Task Board Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Agent Task Board Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Tasks join to agents, runs, ordered steps, tool references, artifacts, and approval gates.</p>
    </header>
    <section class="mb-5 grid gap-3 md:grid-cols-3">
      ${renderStat('Running', running)}
      ${renderStat('Waiting approval', waiting)}
      ${renderStat('Artifacts', artifactCount)}
    </section>
    <section class="grid gap-4 lg:grid-cols-2">
      ${runs.map(renderRun).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderStat(label, value) {
  return `<div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase tracking-normal text-slate-500">${escapeHtml(label)}</p>
        <p class="mt-2 text-2xl font-semibold text-slate-950">${escapeHtml(value)}</p>
      </div>`;
}

function renderRun(run) {
  const completedSteps = run.steps.filter((step) => step.status === 'completed').length;
  const progress = Math.round((completedSteps / Math.max(run.steps.length, 1)) * 100);

  return `<article data-agent-run="${escapeHtml(run.id)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-normal text-slate-500">${escapeHtml(run.agent?.name ?? run.agentId)}</span>
              <span class="${statusClass(run.status)}">${escapeHtml(labelFor(run.status))}</span>
            </div>
            <h2 class="mt-2 text-lg font-semibold">${escapeHtml(run.task?.title ?? run.taskId)}</h2>
            <p class="mt-2 text-sm text-slate-600">${escapeHtml(run.summary)}</p>
          </div>
          <span class="${priorityClass(run.task?.priority)}">${escapeHtml(run.task?.priority ?? 'medium')}</span>
        </div>
        <div class="mt-4">
          <div class="mb-2 flex justify-between text-xs font-medium text-slate-500">
            <span>${completedSteps}/${run.steps.length} steps complete</span>
            <span>${progress}%</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-sky-500" style="width: ${progress}%"></div></div>
        </div>
        <ol class="mt-4 space-y-2">
          ${run.steps.map(renderStep).join('\n          ')}
        </ol>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          ${renderList('Artifacts', run.artifacts, renderArtifact)}
          ${renderList('Approvals', run.approvals, renderApproval)}
        </div>
      </article>`;
}

function renderStep(step) {
  return `<li class="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-slate-900">${escapeHtml(step.stepNumber)}. ${escapeHtml(step.label)}</span>
              <span class="${statusClass(step.status)}">${escapeHtml(labelFor(step.status))}</span>
            </div>
            <p class="mt-1 text-xs text-slate-500">${escapeHtml(step.tool?.name ?? 'No tool')} - ${escapeHtml(step.outputSummary)}</p>
          </li>`;
}

function renderList(title, items, renderItem) {
  return `<section class="rounded-md border border-slate-200 p-3">
            <h3 class="text-sm font-semibold text-slate-900">${escapeHtml(title)}</h3>
            <div class="mt-2 space-y-2">${items.map(renderItem).join('') || '<p class="text-sm text-slate-500">None.</p>'}</div>
          </section>`;
}

function renderArtifact(artifact) {
  return `<p class="text-sm text-slate-600"><span class="font-medium text-slate-900">${escapeHtml(artifact.title)}</span> - ${escapeHtml(labelFor(artifact.status))}</p>`;
}

function renderApproval(approval) {
  return `<p class="text-sm text-slate-600"><span class="font-medium text-slate-900">${escapeHtml(approval.reviewer)}</span> - ${escapeHtml(labelFor(approval.status))}</p>`;
}

function statusClass(status) {
  const classes = {
    queued: 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600',
    pending: 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700',
    running: 'rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700',
    completed: 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700',
    blocked: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
    waiting_for_approval: 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700',
    succeeded: 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700',
    failed: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
  };
  return classes[status] ?? classes.queued;
}

function priorityClass(priority) {
  const classes = {
    high: 'rounded-md bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700',
    medium: 'rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700',
    low: 'rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600',
  };
  return classes[priority] ?? classes.medium;
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
