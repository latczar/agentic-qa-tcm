import path from 'node:path';
import { FailureClass } from '@aiqa/shared';
import type { GateResult } from '../domain/types.js';
import { runNode, stripAnsi, toolEntry } from './process.js';

interface PwResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
}
interface PwSpec {
  title: string;
  tests: Array<{ results: PwResult[] }>;
}
interface PwSuite {
  title: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
}

export interface SabotageOutcome {
  result: GateResult;
  failureClass: typeof FailureClass.WEAK_ASSERTION | null;
}

/**
 * G6: re-runs the candidate once more with one real feature deliberately broken (the app reads
 * an X-Sabotage header and silently no-ops that feature) and requires the test to fail. A test
 * that still passes never checked the thing it claims to verify, only the surface response.
 * Only meaningful for a candidate that actually exercises the sabotaged feature; callers decide
 * relevance before invoking this.
 */
export async function gateSabotage(
  frameworkRoot: string,
  candidateAbsPath: string,
  sabotageId: string,
): Promise<SabotageOutcome> {
  const rel = path.relative(frameworkRoot, candidateAbsPath).split(path.sep).join('/');
  const gate = 'G6' as const;
  const name = `Sabotage check (${sabotageId})`;
  const fail = (code: string, message: string, hint?: string): SabotageOutcome => ({
    failureClass: FailureClass.WEAK_ASSERTION,
    result: {
      gate,
      name,
      passed: false,
      durationMs: result.durationMs,
      errors: [{ code, message, hint }],
    },
  });

  const result = await runNode(
    toolEntry('playwright'),
    ['test', rel, '--project=candidates', '--retries', '0', '--reporter', 'json'],
    {
      cwd: frameworkRoot,
      timeoutMs: 120_000,
      env: { CI: '', PW_TEST_HTML_REPORT_OPEN: 'never', SABOTAGE: sabotageId },
    },
  );

  let report: { suites?: PwSuite[] } | null = null;
  try {
    const start = result.stdout.indexOf('{');
    report = JSON.parse(result.stdout.slice(start)) as { suites?: PwSuite[] };
  } catch {
    // report stays null; handled below.
  }
  if (!report) {
    return fail(
      'NO_REPORT',
      `Playwright produced no JSON report while checking sabotage "${sabotageId}". ${stripAnsi(result.stderr || result.stdout).slice(0, 400)}`,
    );
  }

  const specs = [...walk(report.suites ?? [])];
  if (specs.length === 0) {
    return fail(
      'NO_TESTS_RAN',
      `Playwright found no tests while checking sabotage "${sabotageId}".`,
    );
  }

  const allFailed = specs.every((s) =>
    s.tests.flatMap((t) => t.results).every((r) => r.status !== 'passed'),
  );
  if (allFailed) {
    return {
      failureClass: null,
      result: { gate, name, passed: true, durationMs: result.durationMs, errors: [] },
    };
  }

  return fail(
    'SABOTAGE_SURVIVED',
    `The test still passed with "${sabotageId}" deliberately broken: the request is accepted but silently never saved. Its assertions only check the surface response (a success message), never the actual outcome.`,
    'Assert on the real effect of the action — e.g. that the leave balance actually decreased, or the request now appears in the list — not just the success message.',
  );
}

function* walk(suites: PwSuite[]): Generator<PwSpec> {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) yield spec;
    yield* walk(suite.suites ?? []);
  }
}
