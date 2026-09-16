import { describe, expect, it } from 'vitest';
import type { GenerationRun, TestCase } from '../domain/types.js';
import { escapeHtml, renderDetail, renderInbox } from './review-pages.js';

function run(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return {
    id: 'run-abc12345',
    testCaseId: 'TC-014',
    testCaseVersion: 1,
    status: 'PENDING_REVIEW',
    attempts: 1,
    maxAttempts: 3,
    deferrals: 0,
    provider: 'replay',
    model: 'replay',
    candidatePath: 'tests/generated/tc-014-sick-leave.spec.ts',
    bestAttempt: 1,
    failureClass: null,
    summary: 'All gates passed.',
    reviewedBy: null,
    reviewedAt: null,
    reviewComment: null,
    createdAt: '2026-09-16T10:00:00.000Z',
    updatedAt: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('escapes &, <, >, and the double quote used in attribute values', () => {
    expect(escapeHtml(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;'");
  });
});

describe('renderInbox', () => {
  it('lists only PENDING_REVIEW runs, linked by id', () => {
    const html = renderInbox([run(), run({ id: 'run-done', status: 'APPROVED' })]);
    expect(html).toContain('href="/review/run-abc12345"');
    expect(html).not.toContain('run-done');
  });

  it('shows a message when nothing is pending', () => {
    const html = renderInbox([run({ status: 'APPROVED' })]);
    expect(html).toContain('Nothing is waiting for review');
  });

  it('escapes fields taken from the test case or model', () => {
    const html = renderInbox([run({ provider: '<img src=x>' })]);
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});

describe('renderDetail', () => {
  const testCase: TestCase = {
    id: 'TC-014',
    version: 1,
    title: 'Sick leave can be recorded for a day in the past',
    feature: 'leave',
    priority: 'high',
    preconditions: 'Signed in as Amira Hassan.',
    steps: [{ action: 'Submit sick leave', expected: 'Listed as pending' }],
    testData: {},
  };

  it('shows the approve/reject form only while PENDING_REVIEW', () => {
    const pending = renderDetail({
      run: run(),
      testCase,
      code: 'const x = 1;',
      lastAttempt: null,
      parsed: null,
    });
    expect(pending).toContain('name="decision" value="approve"');
    expect(pending).toContain('name="decision" value="reject"');

    const decided = renderDetail({
      run: run({ status: 'APPROVED', reviewedBy: 'lat', reviewedAt: '2026-09-16T10:05:00.000Z' }),
      testCase,
      code: 'const x = 1;',
      lastAttempt: null,
      parsed: null,
    });
    expect(decided).not.toContain('name="decision"');
    expect(decided).toContain('by lat');
  });

  it("escapes generated code so it cannot execute in the reviewer's browser", () => {
    const html = renderDetail({
      run: run(),
      testCase,
      code: '</pre><script>alert(1)</script>',
      lastAttempt: null,
      parsed: null,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows a placeholder when the candidate file is missing from disk', () => {
    const html = renderDetail({
      run: run(),
      testCase,
      code: null,
      lastAttempt: null,
      parsed: null,
    });
    expect(html).toContain('candidate file not found on disk');
  });
});
