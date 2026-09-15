import { parseGeneratedTest, type GeneratedTest } from '../domain/output-schema.js';
import type { GateResult } from '../domain/types.js';

/** G0: the response is one JSON object matching the contract, for the right test case. */
export function gateContract(
  raw: string,
  expectedTestCaseId: string,
): { result: GateResult; parsed: GeneratedTest | null } {
  const started = Date.now();
  const parsed = parseGeneratedTest(raw);
  if (!parsed.ok) {
    return {
      parsed: null,
      result: {
        gate: 'G0',
        name: 'Response contract',
        passed: false,
        durationMs: Date.now() - started,
        errors: parsed.problems.map((message) => ({ code: 'MALFORMED', message })),
      },
    };
  }
  const errors = [];
  if (parsed.value.testCaseId !== expectedTestCaseId) {
    errors.push({
      code: 'WRONG_TEST_CASE',
      message: `testCaseId is ${parsed.value.testCaseId} but this run is for ${expectedTestCaseId}.`,
    });
  }
  return {
    parsed: errors.length ? null : parsed.value,
    result: {
      gate: 'G0',
      name: 'Response contract',
      passed: errors.length === 0,
      durationMs: Date.now() - started,
      errors,
    },
  };
}
