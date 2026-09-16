import { FailureClass, RunStatus, TcmAutomationStatus } from '@aiqa/shared';
import { loadManifest, DEFAULT_FRAMEWORK_ROOT, repoRoot } from '@aiqa/framework-manifest';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ContextBuilder } from '../context/builder.js';
import { FrameworkClient } from '../context/framework-client.js';
import { loadPrompts } from '../context/prompts.js';
import type { GateReport, TestCase } from '../domain/types.js';
import type { CandidateInput, Gates, GatesOutcome } from '../gates/runner.js';
import { FailingProvider } from '../llm/failing-provider.js';
import { ReplayProvider } from '../llm/replay-provider.js';
import { InMemoryRunRepository } from '../repo/runs.js';
import { FakeTcmClient } from '../tcm/fake-client.js';
import { NullArtefactStore } from './artefacts.js';
import { NullEventEmitter } from './events.js';
import { executeRun, startRun, type PipelineDeps } from './run-pipeline.js';

// The pipeline's control flow with fake gates: claiming, idempotency, retry kinds, deferral,
// exhaustion and TCM reporting. The real gates are covered by gates.test.ts and the integration run.

const tc014: TestCase = {
  id: 'TC-014',
  version: 1,
  title: 'Sick leave can be recorded for a day in the past',
  feature: 'leave',
  priority: 'high',
  preconditions: 'Signed in as Amira Hassan.',
  steps: [
    {
      action: 'Request sick leave for last Monday',
      expected: 'Listed as pending, balance unchanged',
    },
  ],
  testData: {},
};

/** Fake gates that answer from a script of outcomes, one per attempt. */
class ScriptedGates implements Gates {
  calls: CandidateInput[] = [];
  constructor(private readonly script: Array<FailureClass | 'pass'>) {}
  async run(input: CandidateInput): Promise<GatesOutcome> {
    this.calls.push(input);
    const outcome = this.script[this.calls.length - 1] ?? 'pass';
    const g1 = {
      gate: 'G1' as const,
      name: 'Structural policy',
      passed: true,
      durationMs: 1,
      errors: [],
    };
    if (outcome === 'pass') {
      return {
        report: { passed: true, results: [g1], failedGate: null, failureClass: null },
        selfReport: { claimedMethods: [], actualMethods: [], accuracy: null },
      };
    }
    const report: GateReport = {
      passed: false,
      results: [
        g1,
        {
          gate: 'G2',
          name: 'Symbol existence',
          passed: false,
          durationMs: 1,
          errors: [
            {
              code: 'UNKNOWN_MEMBER',
              message: 'no such member',
              hint: 'Did you mean submitRequest?',
            },
          ],
        },
      ],
      failedGate: 'G2',
      failureClass: outcome,
    };
    return { report, selfReport: null };
  }
}

let context: ContextBuilder;
let framework: FrameworkClient;
let prompts: Awaited<ReturnType<typeof loadPrompts>>;

beforeAll(async () => {
  const manifest = await loadManifest();
  framework = await FrameworkClient.inProcess(manifest, DEFAULT_FRAMEWORK_ROOT);
  prompts = await loadPrompts(path.join(repoRoot, 'prompts'), 'v1');
  context = new ContextBuilder(framework, manifest, prompts, 6000);
});

async function replay(name: string) {
  return ReplayProvider.load(path.join(repoRoot, 'scenarios'), name);
}

function deps(
  overrides: Partial<Omit<PipelineDeps, 'tcm'>> & {
    gates: Gates;
    provider: PipelineDeps['provider'];
  },
): PipelineDeps & { tcm: FakeTcmClient } {
  const tcm = FakeTcmClient.fromCases([tc014]);
  return {
    tcm,
    runs: new InMemoryRunRepository(),
    context,
    artefacts: new NullArtefactStore(),
    prompts,
    frameworkRoot: path.join(repoRoot, 'artifacts', 'unit-framework'),
    maxAttempts: 3,
    maxDeferrals: 3,
    framework,
    mode: 'curated',
    maxToolCalls: 6,
    events: new NullEventEmitter(),
    publicUrl: 'http://localhost:5000',
    ...overrides,
  };
}

describe('startRun', () => {
  it('is idempotent per test case and version', async () => {
    const d = deps({ gates: new ScriptedGates([]), provider: await replay('happy') });
    const first = await startRun(d, 'TC-014');
    const second = await startRun(d, 'TC-014');
    const other = await startRun(d, 'TC-014', 2);
    expect(first.created).toBe(true);
    expect(second).toEqual({ created: false, run: first.run });
    expect(other.created).toBe(true);
    expect(other.run.id).not.toBe(first.run.id);
  });

  it('refuses an unknown case', async () => {
    const d = deps({ gates: new ScriptedGates([]), provider: await replay('happy') });
    await expect(startRun(d, 'TC-999')).rejects.toThrow(/does not exist/);
  });
});

describe('executeRun', () => {
  it('claims, generates, passes the gates and reports PENDING_REVIEW to the TCM', async () => {
    const gates = new ScriptedGates(['pass']);
    const d = deps({ gates, provider: await replay('happy') });
    const { run } = await startRun(d, 'TC-014');
    const done = await executeRun(d, run.id);

    expect(done.status).toBe(RunStatus.PENDING_REVIEW);
    expect(done.attempts).toBe(1);
    expect(done.candidatePath).toBe('tests/generated/tc-014-sick-leave-past-date.spec.ts');
    expect(d.tcm.statusOf('TC-014')).toBe(TcmAutomationStatus.PENDING_REVIEW);
    expect(d.tcm.reports[0]).toMatchObject({
      status: 'PENDING_REVIEW',
      automationRef: expect.stringContaining('tests/generated/'),
    });
    expect(gates.calls[0]?.code).toMatch(/Generated by ai-qa-pipeline/);
    const attempts = await d.runs.attempts(run.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.contextReceipt.sections.map((s) => s.name)).toEqual([
      'testCase',
      'conventions',
      'fixtures',
      'pageObjects',
      'examples',
    ]);
  });

  it('does nothing the second time it is asked to execute a finished run', async () => {
    const d = deps({ gates: new ScriptedGates(['pass']), provider: await replay('happy') });
    const { run } = await startRun(d, 'TC-014');
    await executeRun(d, run.id);
    const again = await executeRun(d, run.id);
    expect(again.status).toBe(RunStatus.PENDING_REVIEW);
    expect(d.tcm.reports).toHaveLength(1);
  });

  it('cannot claim a case that is not READY and says why', async () => {
    const d = deps({ gates: new ScriptedGates([]), provider: await replay('happy') });
    d.tcm.setStatus('TC-014', TcmAutomationStatus.NOT_PLANNED);
    const { run } = await startRun(d, 'TC-014');
    const done = await executeRun(d, run.id);
    expect(done.status).toBe(RunStatus.NEEDS_ATTENTION);
    expect(done.summary).toMatch(/Could not claim/);
  });

  it('repairs a malformed response, then succeeds', async () => {
    const gates = new ScriptedGates(['pass']);
    const d = deps({ gates, provider: await replay('malformed-then-valid') });
    const { run } = await startRun(d, 'TC-014');
    const done = await executeRun(d, run.id);
    expect(done.status).toBe(RunStatus.PENDING_REVIEW);
    expect(done.attempts).toBe(2);
    const attempts = await d.runs.attempts(run.id);
    expect(attempts.map((a) => [a.kind, a.failureClass])).toEqual([
      ['generate', FailureClass.MALFORMED_RESPONSE],
      ['repair', null],
    ]);
    expect(attempts[1]?.prompt).toMatch(/could not be read/);
  });

  it('retries with the gate feedback in the prompt', async () => {
    const gates = new ScriptedGates([FailureClass.UNKNOWN_SYMBOL, 'pass']);
    const d = deps({ gates, provider: await replay('unknown-method') });
    const { run } = await startRun(d, 'TC-014');
    const done = await executeRun(d, run.id);
    expect(done.status).toBe(RunStatus.PENDING_REVIEW);
    expect(done.attempts).toBe(2);
    const second = (await d.runs.attempts(run.id))[1];
    expect(second?.kind).toBe('retry');
    expect(second?.prompt).toMatch(/\[UNKNOWN_MEMBER\]/);
    expect(second?.prompt).toMatch(/Did you mean submitRequest/);
  });

  it('stops after max attempts, keeps the best attempt, and reports NEEDS_ATTENTION', async () => {
    const gates = new ScriptedGates([
      FailureClass.UNKNOWN_SYMBOL,
      FailureClass.UNKNOWN_SYMBOL,
      FailureClass.UNKNOWN_SYMBOL,
    ]);
    const d = deps({ gates, provider: await replay('exhausted') });
    const { run } = await startRun(d, 'TC-014');
    const done = await executeRun(d, run.id);
    expect(done.status).toBe(RunStatus.NEEDS_ATTENTION);
    expect(done.attempts).toBe(3);
    expect(done.bestAttempt).toBe(1);
    expect(done.failureClass).toBe(FailureClass.UNKNOWN_SYMBOL);
    expect(d.tcm.statusOf('TC-014')).toBe(TcmAutomationStatus.NEEDS_ATTENTION);
    expect(d.tcm.reports[0]?.note).toMatch(/Stopped after 3 attempt/);
  });

  it('never retries a flaky test', async () => {
    const gates = new ScriptedGates([FailureClass.FLAKY]);
    const d = deps({ gates, provider: await replay('flaky') });
    const { run } = await startRun(d, 'TC-014');
    const done = await executeRun(d, run.id);
    expect(done.status).toBe(RunStatus.NEEDS_ATTENTION);
    expect(done.attempts).toBe(1);
    expect(done.failureClass).toBe(FailureClass.FLAKY);
  });

  it('defers when the model is unavailable, without spending an attempt, then gives up', async () => {
    const d = deps({
      gates: new ScriptedGates([]),
      provider: new FailingProvider('unavailable'),
      maxDeferrals: 2,
    });
    const { run } = await startRun(d, 'TC-014');

    const first = await executeRun(d, run.id);
    expect(first.status).toBe(RunStatus.DEFERRED);
    expect(first.attempts).toBe(0);
    expect(first.deferrals).toBe(1);
    expect(d.tcm.statusOf('TC-014')).toBe(TcmAutomationStatus.AUTOMATION_IN_PROGRESS);

    const second = await executeRun(d, run.id);
    expect(second.status).toBe(RunStatus.DEFERRED);
    expect(second.deferrals).toBe(2);

    const third = await executeRun(d, run.id);
    expect(third.status).toBe(RunStatus.NEEDS_ATTENTION);
    expect(third.attempts).toBe(0);
    expect(d.tcm.statusOf('TC-014')).toBe(TcmAutomationStatus.NEEDS_ATTENTION);
  });
});
