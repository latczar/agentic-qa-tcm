import path from 'node:path';
import { FailureClass } from '@aiqa/shared';
import type { GateError, GateResult } from '../domain/types.js';
import { runNode, stripAnsi, toolEntry } from './process.js';

interface PwResult {
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  errors?: Array<{ message?: string }>;
  duration: number;
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

export interface ExecutionOutcome {
  result: GateResult;
  failureClass: typeof FailureClass.FLAKY | typeof FailureClass.EXECUTION_FAILURE | null;
}

/**
 * G5: the candidate runs against the application, twice, with no retries. Every repeat must pass.
 * Mixed outcomes are flakiness, which is a finding in its own right and is never retried.
 */
export async function gateExecute(
  frameworkRoot: string,
  candidateAbsPath: string,
): Promise<ExecutionOutcome> {
  const rel = path.relative(frameworkRoot, candidateAbsPath).split(path.sep).join('/');
  const result = await runNode(
    toolEntry('playwright'),
    [
      'test',
      rel,
      '--project=candidates',
      '--repeat-each',
      '2',
      '--retries',
      '0',
      '--reporter',
      'json',
    ],
    { cwd: frameworkRoot, timeoutMs: 240_000, env: { CI: '', PW_TEST_HTML_REPORT_OPEN: 'never' } },
  );

  const errors: GateError[] = [];
  const specs: Array<{ title: string; outcomes: string[] }> = [];
  let report: { suites?: PwSuite[] } | null = null;
  try {
    const start = result.stdout.indexOf('{');
    report = JSON.parse(result.stdout.slice(start)) as { suites?: PwSuite[] };
  } catch {
    errors.push({
      code: 'NO_REPORT',
      message: `Playwright produced no JSON report. ${stripAnsi(result.stderr || result.stdout).slice(0, 600)}`,
    });
  }

  for (const spec of walk(report?.suites ?? [])) {
    const results = spec.tests.flatMap((t) => t.results);
    const outcomes = results.map((r) => r.status);
    specs.push({ title: spec.title, outcomes });
    const failures = results.filter((r) => r.status !== 'passed');
    for (const [i, f] of failures.entries()) {
      const message = stripAnsi(f.errors?.[0]?.message ?? f.status)
        .split('\n')
        .slice(0, 6)
        .join('\n');
      errors.push({
        code: `RUN_${f.status.toUpperCase()}`,
        message: `"${spec.title}" run ${i + 1}: ${message}`,
      });
    }
  }
  if (specs.length === 0 && errors.length === 0) {
    errors.push({ code: 'NO_TESTS_RAN', message: 'Playwright found no tests in the candidate.' });
  }
  if (result.timedOut)
    errors.push({ code: 'TIMEOUT', message: 'Playwright did not finish within 240 seconds.' });

  const mixed = specs.some(
    (s) => s.outcomes.includes('passed') && s.outcomes.some((o) => o !== 'passed'),
  );
  const passed = errors.length === 0;
  return {
    failureClass: passed ? null : mixed ? FailureClass.FLAKY : FailureClass.EXECUTION_FAILURE,
    result: {
      gate: 'G5',
      name: 'Playwright execution (x2)',
      passed,
      durationMs: result.durationMs,
      errors: mixed
        ? [
            {
              code: 'FLAKY',
              message:
                'The test passed on one run and failed on another. Flaky tests are not retried.',
            },
            ...errors,
          ]
        : errors,
      details: { specs, exitCode: result.code },
    },
  };
}

function* walk(suites: PwSuite[]): Generator<PwSpec> {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) yield spec;
    yield* walk(suite.suites ?? []);
  }
}
