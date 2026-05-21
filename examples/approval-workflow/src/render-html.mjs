import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '@async/db';

const cwd = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = await openDb({ cwd });

const [changeRequests, approvalRules, invitations, reviews, actions, members, teams] = await Promise.all([
  db.collection('changeRequests').all(),
  db.collection('approvalRules').all(),
  db.collection('invitations').all(),
  db.collection('reviews').all(),
  db.collection('actions').all(),
  db.collection('members').all(),
  db.collection('teams').all(),
]);

const membersById = new Map(members.map((member) => [member.id, member]));
const teamsById = new Map(teams.map((team) => [team.id, team]));
const rulesByRequestId = groupBy(approvalRules, 'changeRequestId');
const invitationsByRequestId = groupBy(invitations, 'changeRequestId');
const reviewsByRequestId = groupBy(reviews, 'changeRequestId');
const actionByRequestId = new Map(actions.map((action) => [action.changeRequestId, action]));

const rows = changeRequests.map((request) => decorateRequest(request));

console.log(renderPage(rows));

function decorateRequest(request) {
  const requestReviews = reviewsByRequestId.get(request.id) ?? [];
  const requestRules = (rulesByRequestId.get(request.id) ?? []).map((rule) => {
    const approvals = requestReviews.filter((review) => review.decision === 'approved' && reviewMatchesRule(review, rule));

    return {
      ...rule,
      approvals,
      satisfied: approvals.length >= (rule.minApprovals ?? 1),
      subjectLabel: rule.requirementKind === 'member'
        ? membersById.get(rule.memberId)?.name ?? rule.memberId
        : teamsById.get(rule.teamId)?.name ?? rule.teamId,
    };
  });
  const satisfiedRules = requestRules.filter((rule) => rule.satisfied).length;

  return {
    ...request,
    requester: membersById.get(request.requesterId),
    targetTeam: teamsById.get(request.targetTeamId),
    rules: requestRules,
    reviews: requestReviews.map((review) => ({
      ...review,
      reviewer: membersById.get(review.reviewerId),
      team: teamsById.get(review.teamId),
    })),
    invitations: (invitationsByRequestId.get(request.id) ?? []).map((invitation) => ({
      ...invitation,
      invitedBy: membersById.get(invitation.invitedById),
      inviteeMember: membersById.get(invitation.inviteeMemberId),
      inviteeTeam: teamsById.get(invitation.inviteeTeamId),
    })),
    action: actionByRequestId.get(request.id),
    satisfiedRules,
    progressLabel: `${satisfiedRules}/${requestRules.length} gates`,
  };
}

function reviewMatchesRule(review, rule) {
  if (rule.requirementKind === 'member') {
    return review.reviewerId === rule.memberId;
  }
  return review.teamId === rule.teamId;
}

function renderPage(requests) {
  const readyActions = requests.filter((request) => request.action?.status === 'ready').length;
  const pendingInvitations = requests.flatMap((request) => request.invitations).filter((invitation) => invitation.status === 'pending').length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Approval Workflow Example</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-50 text-zinc-950">
  <main class="mx-auto max-w-6xl px-5 py-8">
    <header class="mb-6">
      <h1 class="text-2xl font-bold tracking-normal">Approval Workflow Example</h1>
      <p class="mt-2 max-w-2xl text-sm text-zinc-600">Change requests connect requesters, teams, invited reviewers, approval gates, reviews, and ready actions.</p>
    </header>

    <section class="mb-5 grid gap-3 md:grid-cols-3">
      ${renderStat('Change requests', requests.length, 'bg-sky-50 text-sky-700 ring-sky-100')}
      ${renderStat('Ready actions', readyActions, 'bg-emerald-50 text-emerald-700 ring-emerald-100')}
      ${renderStat('Pending invites', pendingInvitations, 'bg-amber-50 text-amber-700 ring-amber-100')}
    </section>

    <section class="space-y-4">
      ${requests.map(renderRequest).join('\n      ')}
    </section>
  </main>
</body>
</html>`;
}

function renderStat(label, value, classes) {
  return `<div class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p class="text-xs font-medium uppercase tracking-normal text-zinc-500">${escapeHtml(label)}</p>
        <p class="mt-2 text-2xl font-semibold ${classes} inline-flex rounded-md px-2.5 py-1 ring-1 ring-inset">${escapeHtml(value)}</p>
      </div>`;
}

function renderRequest(request) {
  const ruleTotal = Math.max(request.rules.length, 1);
  const progressPercent = Math.round((request.satisfiedRules / ruleTotal) * 100);

  return `<article data-change-request="${escapeHtml(request.id)}" class="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <div class="flex flex-col gap-3 border-b border-zinc-100 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-normal text-zinc-500">${escapeHtml(request.key)}</span>
              <span class="${statusClass(request.status)}">${escapeHtml(labelFor(request.status))}</span>
            </div>
            <h2 class="mt-2 text-lg font-semibold text-zinc-950">${escapeHtml(request.title)}</h2>
            <p class="mt-2 max-w-3xl text-sm text-zinc-600">${escapeHtml(request.summary)}</p>
          </div>
          <div class="${actionClass(request.action?.status)}">${escapeHtml(labelFor(request.action?.status ?? 'blocked'))}</div>
        </div>

        <div class="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div class="space-y-4">
            <div class="grid gap-3 text-sm md:grid-cols-3">
              ${renderMeta('Requester', request.requester?.name ?? request.requesterId)}
              ${renderMeta('Target team', request.targetTeam?.name ?? request.targetTeamId)}
              ${renderMeta('Action intent', request.actionIntent)}
            </div>
            <section>
              <div class="mb-2 flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-zinc-900">Approval progress</h3>
                <span class="text-xs font-medium text-zinc-500">${escapeHtml(request.progressLabel)}</span>
              </div>
              <div class="h-2 rounded-full bg-zinc-100">
                <div class="h-2 rounded-full bg-emerald-500" style="width: ${progressPercent}%"></div>
              </div>
              <ul class="mt-3 grid gap-2 md:grid-cols-2">
                ${request.rules.map(renderRule).join('\n                ')}
              </ul>
            </section>
          </div>

          <div class="space-y-4">
            ${renderInvitations(request.invitations)}
            ${renderReviews(request.reviews)}
            ${renderAction(request.action)}
          </div>
        </div>
      </article>`;
}

function renderMeta(label, value) {
  return `<div class="rounded-md bg-zinc-50 px-3 py-2 ring-1 ring-inset ring-zinc-200">
                <p class="text-xs font-medium uppercase tracking-normal text-zinc-500">${escapeHtml(label)}</p>
                <p class="mt-1 font-medium text-zinc-900">${escapeHtml(value)}</p>
              </div>`;
}

function renderRule(rule) {
  const state = rule.satisfied
    ? '<span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">approved</span>'
    : '<span class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">needed</span>';

  return `<li class="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-zinc-900">${escapeHtml(rule.label)}</span>
                    ${state}
                  </div>
                  <p class="mt-1 text-xs text-zinc-500">${escapeHtml(rule.subjectLabel)} · ${escapeHtml(rule.minApprovals ?? 1)} approval required</p>
                </li>`;
}

function renderInvitations(invitations) {
  return `<section>
              <h3 class="mb-2 text-sm font-semibold text-zinc-900">Invitations</h3>
              <div class="space-y-2">
                ${invitations.map(renderInvitation).join('\n                ') || '<p class="text-sm text-zinc-500">No invitations.</p>'}
              </div>
            </section>`;
}

function renderInvitation(invitation) {
  const target = invitation.inviteeMember?.name ?? invitation.inviteeTeam?.name ?? 'Unknown reviewer';

  return `<div class="rounded-md border border-zinc-200 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-zinc-900">${escapeHtml(target)}</span>
                    <span class="${invitationClass(invitation.status)}">${escapeHtml(labelFor(invitation.status))}</span>
                  </div>
                  <p class="mt-1 text-xs text-zinc-500">Invited by ${escapeHtml(invitation.invitedBy?.name ?? invitation.invitedById)}</p>
                </div>`;
}

function renderReviews(reviews) {
  return `<section>
              <h3 class="mb-2 text-sm font-semibold text-zinc-900">Reviews</h3>
              <div class="space-y-2">
                ${reviews.map(renderReview).join('\n                ') || '<p class="text-sm text-zinc-500">No reviews yet.</p>'}
              </div>
            </section>`;
}

function renderReview(review) {
  return `<div class="rounded-md border border-zinc-200 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium text-zinc-900">${escapeHtml(review.reviewer?.name ?? review.reviewerId)}</span>
                    <span class="${decisionClass(review.decision)}">${escapeHtml(labelFor(review.decision))}</span>
                  </div>
                  <p class="mt-1 text-xs text-zinc-500">${escapeHtml(review.team?.name ?? 'No team')} · ${escapeHtml(review.bodyMarkdown)}</p>
                </div>`;
}

function renderAction(action) {
  if (!action) {
    return '<p class="rounded-md border border-zinc-200 p-3 text-sm text-zinc-500">No action record.</p>';
  }

  return `<section class="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <h3 class="text-sm font-semibold text-zinc-900">Action</h3>
              <p class="mt-1 text-sm font-medium text-zinc-800">${escapeHtml(action.title)}</p>
              <p class="mt-1 text-xs text-zinc-500">${escapeHtml(action.notes)}</p>
            </section>`;
}

function statusClass(status) {
  const classes = {
    open: 'rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700',
    changes_requested: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
    approved: 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700',
    action_ready: 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700',
    completed: 'rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700',
  };
  return classes[status] ?? classes.open;
}

function decisionClass(decision) {
  const classes = {
    approved: 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700',
    changes_requested: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
    commented: 'rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700',
  };
  return classes[decision] ?? classes.commented;
}

function invitationClass(status) {
  const classes = {
    accepted: 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700',
    pending: 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700',
    declined: 'rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700',
  };
  return classes[status] ?? classes.pending;
}

function actionClass(status) {
  const classes = {
    blocked: 'inline-flex rounded-md bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-100',
    ready: 'inline-flex rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100',
    completed: 'inline-flex rounded-md bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200',
  };
  return classes[status] ?? classes.blocked;
}

function labelFor(value) {
  return String(value ?? '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
