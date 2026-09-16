import type { GenerationAttempt, GenerationRun, TestCase } from '../domain/types.js';
import type { GeneratedTest } from '../domain/output-schema.js';

/** Plain server-rendered HTML for human review. No client framework, no build step. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
  body { font: 14px/1.5 -apple-system, Segoe UI, sans-serif; color: #1a1a1a; background: #fafafa; margin: 0; }
  header { background: #1a1a1a; color: #fff; padding: 0.75rem 1.5rem; }
  header a { color: #fff; text-decoration: none; font-weight: 600; }
  main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  pre { background: #1a1a1a; color: #eee; padding: 1rem; overflow-x: auto; border-radius: 4px; }
  .muted { color: #666; }
  .pass { color: #146c2e; }
  .fail { color: #b3261e; font-weight: 600; }
  .pill { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.8rem; background: #eee; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 1rem 1.25rem; margin: 1rem 0; }
  form.decide { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: flex-end; }
  form.decide label { display: block; font-size: 0.8rem; color: #444; margin-bottom: 0.2rem; }
  input, textarea, button { font: inherit; }
  input[type=text], textarea { padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; }
  button { padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #333; cursor: pointer; }
  button.approve { background: #146c2e; color: #fff; border-color: #146c2e; }
  button.reject { background: #b3261e; color: #fff; border-color: #b3261e; }
`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · ai-qa-pipeline review</title>
<style>${STYLE}</style>
</head>
<body>
<header><a href="/review">ai-qa-pipeline review</a></header>
<main>${body}</main>
</body>
</html>`;
}

export function renderMessage(title: string, text: string): string {
  return layout(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>`);
}

export function renderInbox(runs: GenerationRun[]): string {
  const pending = runs.filter((r) => r.status === 'PENDING_REVIEW');
  const rows = pending
    .map(
      (r) => `<tr>
        <td><a href="/review/${escapeHtml(r.id)}">${escapeHtml(r.id)}</a></td>
        <td>${escapeHtml(r.testCaseId)} v${r.testCaseVersion}</td>
        <td>${escapeHtml(r.provider)} (${escapeHtml(r.model)})</td>
        <td>${r.attempts} of ${r.maxAttempts}</td>
        <td class="muted">${escapeHtml(r.createdAt)}</td>
      </tr>`,
    )
    .join('\n');
  const body = `
    <h1>Awaiting review</h1>
    ${
      pending.length === 0
        ? '<p class="muted">Nothing is waiting for review right now.</p>'
        : `<table>
            <tr><th>Run</th><th>Test case</th><th>Model</th><th>Attempts</th><th>Created</th></tr>
            ${rows}
          </table>`
    }
  `;
  return layout('Awaiting review', body);
}

export interface DetailData {
  run: GenerationRun;
  testCase: TestCase | undefined;
  code: string | null;
  lastAttempt: GenerationAttempt | null;
  parsed: GeneratedTest | null;
}

export function renderDetail(data: DetailData): string {
  const { run, testCase, code, lastAttempt, parsed } = data;
  const isPending = run.status === 'PENDING_REVIEW';

  const steps = testCase
    ? testCase.steps
        .map(
          (s, i) =>
            `<tr><td>${i + 1}</td><td>${escapeHtml(s.action)}</td><td>${escapeHtml(s.expected)}</td></tr>`,
        )
        .join('\n')
    : '';

  const gateRows =
    lastAttempt?.gateReport?.results
      .map(
        (g) =>
          `<tr><td>${g.gate}</td><td>${escapeHtml(g.name)}</td><td class="${g.passed ? 'pass' : 'fail'}">${g.passed ? 'pass' : 'FAIL'}</td><td>${g.errors.length ? escapeHtml(g.errors.map((e) => e.message).join('; ')) : ''}</td></tr>`,
      )
      .join('\n') ?? '';

  const decisionCard = isPending
    ? `<div class="card">
        <h2>Decide</h2>
        <form class="decide" method="post" action="/review/${escapeHtml(run.id)}/decide">
          <div>
            <label for="reviewer">Reviewer</label>
            <input type="text" id="reviewer" name="reviewer" required placeholder="Your name" />
          </div>
          <div style="flex: 1 1 240px;">
            <label for="comment">Comment (optional)</label>
            <input type="text" id="comment" name="comment" placeholder="Why" style="width: 100%;" />
          </div>
          <button class="approve" type="submit" name="decision" value="approve">Approve</button>
          <button class="reject" type="submit" name="decision" value="reject">Reject</button>
        </form>
      </div>`
    : `<div class="card">
        <p><span class="pill">${escapeHtml(run.status)}</span>
        ${run.reviewedBy ? `by ${escapeHtml(run.reviewedBy)} at ${escapeHtml(run.reviewedAt ?? '')}` : ''}</p>
        ${run.reviewComment ? `<p>${escapeHtml(run.reviewComment)}</p>` : ''}
      </div>`;

  const body = `
    <p><a href="/review">&larr; back to inbox</a></p>
    <h1>${escapeHtml(run.id)} <span class="pill">${escapeHtml(run.status)}</span></h1>

    <div class="card">
      <h2>${testCase ? escapeHtml(testCase.title) : escapeHtml(run.testCaseId)}</h2>
      <p class="muted">${escapeHtml(run.testCaseId)} v${run.testCaseVersion} &middot; ${testCase ? escapeHtml(testCase.feature) : ''} &middot; ${testCase ? escapeHtml(testCase.priority) : ''}</p>
      ${testCase?.preconditions ? `<p><strong>Preconditions:</strong> ${escapeHtml(testCase.preconditions)}</p>` : ''}
      ${steps ? `<table><tr><th>#</th><th>Action</th><th>Expected</th></tr>${steps}</table>` : ''}
    </div>

    <div class="card">
      <h2>Generated test</h2>
      <p class="muted">Provider ${escapeHtml(run.provider)} (${escapeHtml(run.model)}) &middot; attempt ${run.bestAttempt ?? '?'} of ${run.attempts} &middot; ${run.candidatePath ? escapeHtml(run.candidatePath) : 'no candidate on disk'}</p>
      ${
        parsed
          ? `<p><strong>Confidence:</strong> ${Math.round(parsed.confidence * 100)}%
             ${parsed.assumptions.length ? `<br /><strong>Assumptions:</strong> ${escapeHtml(parsed.assumptions.join('; '))}` : ''}</p>`
          : ''
      }
      <pre>${code ? escapeHtml(code) : '(candidate file not found on disk)'}</pre>
    </div>

    <div class="card">
      <h2>Gate report</h2>
      ${gateRows ? `<table><tr><th>Gate</th><th>Name</th><th>Result</th><th>Errors</th></tr>${gateRows}</table>` : '<p class="muted">No gate report.</p>'}
    </div>

    ${decisionCard}
  `;
  return layout(run.id, body);
}
