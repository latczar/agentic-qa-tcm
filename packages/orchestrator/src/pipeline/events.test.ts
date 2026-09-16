import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRun } from '../domain/types.js';
import { NullEventEmitter, reviewUrlFor, toRunEvent, WebhookEventEmitter } from './events.js';

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
    candidatePath: 'tests/generated/tc-014.spec.ts',
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

describe('reviewUrlFor', () => {
  it('joins the base URL and run id with no double slash', () => {
    expect(reviewUrlFor('http://localhost:5000', 'run-1')).toBe(
      'http://localhost:5000/review/run-1',
    );
    expect(reviewUrlFor('http://localhost:5000/', 'run-1')).toBe(
      'http://localhost:5000/review/run-1',
    );
  });
});

describe('toRunEvent', () => {
  it('carries the run identity and a working review link', () => {
    const event = toRunEvent('run.pending_review', run(), 'http://localhost:5000');
    expect(event).toEqual({
      event: 'run.pending_review',
      runId: 'run-abc12345',
      testCaseId: 'TC-014',
      testCaseVersion: 1,
      status: 'PENDING_REVIEW',
      summary: 'All gates passed.',
      candidatePath: 'tests/generated/tc-014.spec.ts',
      reviewUrl: 'http://localhost:5000/review/run-abc12345',
    });
  });
});

describe('NullEventEmitter', () => {
  it('does nothing', async () => {
    await expect(
      new NullEventEmitter().emit(toRunEvent('run.approved', run(), 'http://localhost:5000')),
    ).resolves.toBeUndefined();
  });
});

describe('WebhookEventEmitter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the event as JSON to the configured URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const emitter = new WebhookEventEmitter('http://localhost:5678/webhook/run-events');
    const event = toRunEvent(
      'run.needs_attention',
      run({ status: 'NEEDS_ATTENTION' }),
      'http://localhost:5000',
    );
    await emitter.emit(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:5678/webhook/run-events');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(event);
  });

  it('swallows a delivery failure rather than throwing', async () => {
    const log = vi.fn();
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const emitter = new WebhookEventEmitter('http://localhost:5678/webhook/run-events', log);
    await expect(
      emitter.emit(
        toRunEvent('run.deferred', run({ status: 'DEFERRED' }), 'http://localhost:5000'),
      ),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toMatch(/run-abc12345.*ECONNREFUSED/);
  });
});
