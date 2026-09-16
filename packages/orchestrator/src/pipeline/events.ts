import type { GenerationRun } from '../domain/types.js';

export type RunEventName =
  'run.pending_review' | 'run.needs_attention' | 'run.deferred' | 'run.approved' | 'run.rejected';

export interface RunEvent {
  event: RunEventName;
  runId: string;
  testCaseId: string;
  testCaseVersion: number;
  status: string;
  summary: string | null;
  candidatePath: string | null;
  reviewUrl: string;
}

export interface EventEmitter {
  emit(event: RunEvent): Promise<void>;
}

/**
 * Posts a run event to n8n's webhook. Best-effort and fire-and-forget: n8n is notification
 * glue, not part of the pipeline's own correctness, so a delivery failure is logged and
 * swallowed rather than allowed to fail a run.
 */
export class WebhookEventEmitter implements EventEmitter {
  constructor(
    private readonly url: string,
    private readonly log: (message: string) => void = () => {},
    private readonly timeoutMs = 5000,
  ) {}

  async emit(event: RunEvent): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        signal: controller.signal,
      });
    } catch (error) {
      this.log(`event ${event.event} for ${event.runId} could not be delivered: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** No webhook configured, or a test that does not care about notifications. */
export class NullEventEmitter implements EventEmitter {
  async emit(_event: RunEvent): Promise<void> {}
}

export function reviewUrlFor(publicUrl: string, runId: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/review/${runId}`;
}

/** Builds the event payload from a run's own fields, so callers cannot forget one. */
export function toRunEvent(
  eventName: RunEventName,
  run: Pick<
    GenerationRun,
    'id' | 'testCaseId' | 'testCaseVersion' | 'status' | 'summary' | 'candidatePath'
  >,
  publicUrl: string,
): RunEvent {
  return {
    event: eventName,
    runId: run.id,
    testCaseId: run.testCaseId,
    testCaseVersion: run.testCaseVersion,
    status: run.status,
    summary: run.summary,
    candidatePath: run.candidatePath,
    reviewUrl: reviewUrlFor(publicUrl, run.id),
  };
}
