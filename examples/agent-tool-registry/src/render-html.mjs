import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [agents, tools, toolScopes, toolRequests, toolCalls, riskPolicies, auditEvents] = await Promise.all([
  db.collection('agents').all(),
  db.collection('tools').all(),
  db.collection('toolScopes').all(),
  db.collection('toolRequests').all(),
  db.collection('toolCalls').all(),
  db.collection('riskPolicies').all(),
  db.collection('auditEvents').all(),
]);

const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
const scopesByAgentId = groupBy(toolScopes, 'agentId');
const callsByRequestId = groupBy(toolCalls, 'toolRequestId');

const requestRows = toolRequests.map((request) => ({
  ...request,
  agent: agentsById.get(request.agentId),
  tool: toolsById.get(request.toolId),
  calls: callsByRequestId.get(request.id) ?? [],
}));

console.log(renderPage(requestRows));

function renderPage(requests) {
  const pending = requests.filter((request) => request.status === 'pending').length;
  const highRisk = tools.filter((tool) => tool.riskLevel === 'high').length;
  const approvalsRequired = riskPolicies.filter((policy) => policy.approvalRequired).length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Tool Registry Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Agent Tool Registry Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-600">Tool governance records connect agents, scopes, risk policies, approval requests, calls, and audit events.</p>
    </header>
    <section class="mb-5 grid gap-3 md:grid-cols-3">
      ${renderStat('Pending requests', pending)}
      ${renderStat('High-risk tools', highRisk)}
      ${renderStat('Approval policies', approvalsRequired)}
    </section>
    <section class="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
      <div class="space-y-4">
        ${requests.map(renderRequest).join('\n        ')}
      </div>
      <aside class="space-y-4">
        ${renderAgentScopes()}
        ${renderAuditEvents()}
      </aside>
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

function renderRequest(request) {
  return `<article data-tool-request="${escapeHtml(request.id)}" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-normal text-slate-500">${escapeHtml(request.agent?.name ?? request.agentId)}</p>
              <h2 class="mt-2 text-lg font-semibold">${escapeHtml(request.tool?.name ?? request.toolId)}</h2>
              <p class="mt-2 text-sm text-slate-600">${escapeHtml(request.justification)}</p>
            </div>
            <span class="${statusClass(request.status)}">${escapeHtml(labelFor(request.status))}</span>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            ${renderSmall('Risk', request.riskLevel)}
            ${renderSmall('Requested by', request.requestedBy)}
            ${renderSmall('Calls', request.calls.length)}
          </div>
        </article>`;
}

function renderAgentScopes() {
  return `<section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 class="text-sm font-semibold text-slate-900">Agent scopes</h2>
          <div class="mt-3 space-y-3">
            ${agents.map((agent) => {
              const scopes = scopesByAgentId.get(agent.id) ?? [];
              return `<div class="rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
                <p class="text-sm font-medium text-slate-900">${escapeHtml(agent.name)}</p>
                <p class="mt-1 text-xs text-slate-500">${scopes.map((scope) => `${toolsById.get(scope.toolId)?.name ?? scope.toolId}: ${scope.accessLevel}`).join(', ')}</p>
              </div>`;
            }).join('\n            ')}
          </div>
        </section>`;
}

function renderAuditEvents() {
  return `<section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 class="text-sm font-semibold text-slate-900">Audit events</h2>
          <div class="mt-3 space-y-2">
            ${auditEvents.map((event) => `<div class="rounded-md border border-slate-200 p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium text-slate-900">${escapeHtml(labelFor(event.eventType))}</span>
                <span class="${severityClass(event.severity)}">${escapeHtml(labelFor(event.severity))}</span>
              </div>
              <p class="mt-1 text-xs text-slate-500">${escapeHtml(event.summary)}</p>
            </div>`).join('\n            ')}
          </div>
        </section>`;
}

function renderSmall(label, value) {
  return `<div class="rounded-md bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
            <p class="text-xs font-medium uppercase tracking-normal text-slate-500">${escapeHtml(label)}</p>
            <p class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(labelFor(value))}</p>
          </div>`;
}

function statusClass(status) {
  const classes = {
    pending: 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700',
    approved: 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700',
    denied: 'rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700',
  };
  return classes[status] ?? classes.pending;
}

function severityClass(severity) {
  const classes = {
    info: 'rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700',
    warn: 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700',
    high: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
  };
  return classes[severity] ?? classes.info;
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
