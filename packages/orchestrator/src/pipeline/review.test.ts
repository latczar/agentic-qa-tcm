import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TcmAutomationStatus } from '@aiqa/shared';
import type { TestCase } from '../domain/types.js';
import { InMemoryRunRepository } from '../repo/runs.js';
import { FakeTcmClient } from '../tcm/fake-client.js';
import type { EventEmitter, RunEvent } from './events.js';
import { applyReview, rewriteRelativeImports, type ReviewDeps } from './review.js';

/** Records every event so tests can assert what was announced, without a real HTTP server. */
class SpyEventEmitter implements EventEmitter {
  readonly events: RunEvent[] = [];
  async emit(event: RunEvent): Promise<void> {
    this.events.push(event);
  }
}

const tc014: TestCase = {
  id: 'TC-014',
  version: 1,
  title: 'Sick leave can be recorded for a day in the past',
  feature: 'leave',
  priority: 'high',
  preconditions: 'Signed in as Amira Hassan.',
  steps: [{ action: 'Request sick leave', expected: 'Listed as pending, balance unchanged' }],
  testData: {},
};

describe('rewriteRelativeImports', () => {
  it('recomputes a relative import for the new file depth', () => {
    const code = "import { test, users } from '../../src/fixtures/test.js';\n";
    const from = path.join('/repo', 'tests', 'generated', 'tc-014.spec.ts');
    const to = path.join('/repo', 'tests', 'e2e', 'leave', 'tc-014.spec.ts');
    expect(rewriteRelativeImports(code, from, to)).toBe(
      "import { test, users } from '../../../src/fixtures/test.js';\n",
    );
  });

  it('leaves code with no relative imports untouched', () => {
    const from = path.join('/repo', 'tests', 'generated', 'tc-014.spec.ts');
    const to = path.join('/repo', 'tests', 'e2e', 'leave', 'tc-014.spec.ts');
    expect(rewriteRelativeImports('// candidate\n', from, to)).toBe('// candidate\n');
  });
});

describe('applyReview', () => {
  let frameworkRoot: string;
  let runs: InMemoryRunRepository;
  let tcm: FakeTcmClient;
  let events: SpyEventEmitter;
  let deps: ReviewDeps;
  const candidateRel = path.join('tests', 'generated', 'tc-014-sick-leave.spec.ts');

  beforeEach(async () => {
    frameworkRoot = await mkdtemp(path.join(tmpdir(), 'aiqa-review-'));
    runs = new InMemoryRunRepository();
    tcm = FakeTcmClient.fromCases([tc014], TcmAutomationStatus.PENDING_REVIEW);
    events = new SpyEventEmitter();
    deps = { runs, tcm, frameworkRoot, events, publicUrl: 'http://localhost:5000' };
    await mkdir(path.join(frameworkRoot, 'tests', 'generated'), { recursive: true });
    await writeFile(path.join(frameworkRoot, candidateRel), '// candidate\n', 'utf8');
  });

  afterEach(async () => {
    await rm(frameworkRoot, { recursive: true, force: true });
  });

  async function pendingRun() {
    const { run } = await runs.create({
      id: 'run-test-1',
      testCaseId: 'TC-014',
      testCaseVersion: 1,
      maxAttempts: 3,
      provider: 'fake',
      model: 'fake',
    });
    return runs.update(run.id, {
      status: 'PENDING_REVIEW',
      candidatePath: candidateRel.split(path.sep).join('/'),
    });
  }

  it('approve promotes the file into tests/e2e/<feature>/ and reports AUTOMATED', async () => {
    const run = await pendingRun();

    const outcome = await applyReview(deps, run.id, {
      decision: 'approve',
      reviewer: 'lat',
      comment: 'looks good',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.run.status).toBe('APPROVED');
    expect(outcome.run.reviewedBy).toBe('lat');
    expect(outcome.run.candidatePath).toBe('tests/e2e/leave/tc-014-sick-leave.spec.ts');

    const promoted = await readFile(
      path.join(frameworkRoot, 'tests', 'e2e', 'leave', 'tc-014-sick-leave.spec.ts'),
      'utf8',
    );
    expect(promoted).toBe('// candidate\n');
    await expect(readFile(path.join(frameworkRoot, candidateRel), 'utf8')).rejects.toThrow();

    expect(tcm.reports).toEqual([
      {
        id: 'TC-014',
        status: 'AUTOMATED',
        automationRef: 'packages/e2e-framework/tests/e2e/leave/tc-014-sick-leave.spec.ts',
        note: 'looks good',
      },
    ]);

    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({
      event: 'run.approved',
      runId: run.id,
      reviewUrl: `http://localhost:5000/review/${run.id}`,
    });
  });

  it("rewrites the candidate's own relative imports so they still resolve after promotion", async () => {
    await writeFile(
      path.join(frameworkRoot, candidateRel),
      "import { test, users } from '../../src/fixtures/test.js';\n\ntest('x', () => {});\n",
      'utf8',
    );
    const run = await pendingRun();

    const outcome = await applyReview(deps, run.id, {
      decision: 'approve',
      reviewer: 'lat',
      comment: null,
    });

    expect(outcome.ok).toBe(true);
    const promoted = await readFile(
      path.join(frameworkRoot, 'tests', 'e2e', 'leave', 'tc-014-sick-leave.spec.ts'),
      'utf8',
    );
    expect(promoted).toContain("from '../../../src/fixtures/test.js'");
  });

  it('reject leaves the candidate in place and reports NEEDS_ATTENTION', async () => {
    const run = await pendingRun();

    const outcome = await applyReview(deps, run.id, {
      decision: 'reject',
      reviewer: 'lat',
      comment: 'wrong assertion',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.run.status).toBe('REJECTED');
    expect(outcome.run.candidatePath).toBe(candidateRel.split(path.sep).join('/'));

    const stillThere = await readFile(path.join(frameworkRoot, candidateRel), 'utf8');
    expect(stillThere).toBe('// candidate\n');

    expect(tcm.reports).toEqual([
      { id: 'TC-014', status: 'NEEDS_ATTENTION', note: 'wrong assertion' },
    ]);
    expect(events.events).toEqual([
      expect.objectContaining({ event: 'run.rejected', runId: run.id }),
    ]);
  });

  it('refuses a run that already has a decision', async () => {
    const run = await pendingRun();
    await applyReview(deps, run.id, { decision: 'approve', reviewer: 'lat', comment: null });

    const second = await applyReview(deps, run.id, {
      decision: 'reject',
      reviewer: 'someone-else',
      comment: null,
    });

    expect(second).toEqual({ ok: false, reason: 'not_pending' });
    expect(tcm.reports).toHaveLength(1);
    expect(events.events).toHaveLength(1);
  });

  it('returns not_found for an unknown run', async () => {
    const outcome = await applyReview(deps, 'run-does-not-exist', {
      decision: 'approve',
      reviewer: 'lat',
      comment: null,
    });
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
  });
});
