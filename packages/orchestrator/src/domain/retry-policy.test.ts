import { FailureClass as F } from '@aiqa/shared';
import { describe, expect, it } from 'vitest';
import { decide, deferralDelayMs } from './retry-policy.js';

describe('decide', () => {
  it('regenerates with feedback for fixable failures until attempts run out', () => {
    for (const f of [
      F.POLICY_VIOLATION,
      F.UNKNOWN_SYMBOL,
      F.TYPE_ERROR,
      F.LINT_ERROR,
      F.EXECUTION_FAILURE,
      F.WEAK_ASSERTION,
    ]) {
      expect(decide(f, 1, 3, 0, 3)).toEqual({ action: 'retry', kind: 'retry' });
      expect(decide(f, 2, 3, 0, 3)).toEqual({ action: 'retry', kind: 'retry' });
      expect(decide(f, 3, 3, 0, 3)).toEqual({ action: 'stop' });
    }
  });

  it('repairs a malformed response rather than regenerating from scratch', () => {
    expect(decide(F.MALFORMED_RESPONSE, 1, 3, 0, 3)).toEqual({ action: 'retry', kind: 'repair' });
  });

  it('never retries a flaky test', () => {
    expect(decide(F.FLAKY, 1, 3, 0, 3)).toEqual({ action: 'stop' });
  });

  it('defers when the model is unavailable, without using an attempt, up to a limit', () => {
    expect(decide(F.LLM_UNAVAILABLE, 0, 3, 0, 3)).toEqual({ action: 'defer' });
    expect(decide(F.LLM_TIMEOUT, 0, 3, 2, 3)).toEqual({ action: 'defer' });
    expect(decide(F.LLM_UNAVAILABLE, 0, 3, 3, 3)).toEqual({ action: 'stop' });
  });

  it('stops when the context cannot be made to fit', () => {
    expect(decide(F.CONTEXT_BUDGET_EXCEEDED, 0, 3, 0, 3)).toEqual({ action: 'stop' });
  });
});

describe('deferralDelayMs', () => {
  it('backs off 1, 5, 15 minutes and then stays at 15', () => {
    expect([0, 1, 2, 3].map(deferralDelayMs)).toEqual([60_000, 300_000, 900_000, 900_000]);
  });
});
