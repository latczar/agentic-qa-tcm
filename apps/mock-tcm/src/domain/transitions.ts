import { TcmAutomationStatus } from '@aiqa/shared';

export type Actor = 'human' | 'pipeline';

const S = TcmAutomationStatus;

/**
 * Who may move a case from which status to which.
 * Humans decide whether a case should be automated. The pipeline reports what happened.
 * Nothing else is allowed, which is what keeps the two from stepping on each other.
 */
const ALLOWED: Record<Actor, ReadonlyArray<readonly [TcmAutomationStatus, TcmAutomationStatus]>> = {
  human: [
    [S.NOT_PLANNED, S.READY_FOR_AUTOMATION],
    [S.READY_FOR_AUTOMATION, S.NOT_PLANNED],
    [S.NEEDS_ATTENTION, S.READY_FOR_AUTOMATION],
    [S.NEEDS_ATTENTION, S.NOT_PLANNED],
    [S.AUTOMATED, S.READY_FOR_AUTOMATION],
  ],
  pipeline: [
    [S.READY_FOR_AUTOMATION, S.AUTOMATION_IN_PROGRESS],
    [S.AUTOMATION_IN_PROGRESS, S.PENDING_REVIEW],
    [S.AUTOMATION_IN_PROGRESS, S.NEEDS_ATTENTION],
    [S.PENDING_REVIEW, S.AUTOMATED],
    [S.PENDING_REVIEW, S.NEEDS_ATTENTION],
  ],
};

export function canTransition(
  actor: Actor,
  from: TcmAutomationStatus,
  to: TcmAutomationStatus,
): boolean {
  return ALLOWED[actor].some(([a, b]) => a === from && b === to);
}

/** The statuses a given actor may move a case to from its current status. */
export function allowedTargets(actor: Actor, from: TcmAutomationStatus): TcmAutomationStatus[] {
  return ALLOWED[actor].filter(([a]) => a === from).map(([, b]) => b);
}

/**
 * Requesting automation is a new event, so it bumps the version even when the content
 * is unchanged. That lets a human deliberately retry a failed case while a duplicate
 * poll of an unchanged case still collapses to the same (id, version).
 */
export function bumpsVersion(actor: Actor, to: TcmAutomationStatus): boolean {
  return actor === 'human' && to === S.READY_FOR_AUTOMATION;
}

export function isAutomationStatus(value: unknown): value is TcmAutomationStatus {
  return typeof value === 'string' && (Object.values(S) as string[]).includes(value);
}

/** Human-readable label for the UI. */
export function statusLabel(status: TcmAutomationStatus): string {
  return status
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
