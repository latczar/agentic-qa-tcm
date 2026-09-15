import { TcmAutomationStatus as S } from '@aiqa/shared';
import { describe, expect, it } from 'vitest';
import { allowedTargets, bumpsVersion, canTransition, statusLabel } from './transitions.js';

describe('canTransition', () => {
  it('lets a human request and withdraw automation', () => {
    expect(canTransition('human', S.NOT_PLANNED, S.READY_FOR_AUTOMATION)).toBe(true);
    expect(canTransition('human', S.READY_FOR_AUTOMATION, S.NOT_PLANNED)).toBe(true);
  });

  it('lets a human retry after a failure or re-request after the case changed', () => {
    expect(canTransition('human', S.NEEDS_ATTENTION, S.READY_FOR_AUTOMATION)).toBe(true);
    expect(canTransition('human', S.AUTOMATED, S.READY_FOR_AUTOMATION)).toBe(true);
  });

  it('does not let a human interfere with a run in flight or a pending review', () => {
    expect(canTransition('human', S.AUTOMATION_IN_PROGRESS, S.NOT_PLANNED)).toBe(false);
    expect(canTransition('human', S.PENDING_REVIEW, S.AUTOMATED)).toBe(false);
    expect(canTransition('human', S.PENDING_REVIEW, S.NEEDS_ATTENTION)).toBe(false);
  });

  it('lets the pipeline claim, report and conclude', () => {
    expect(canTransition('pipeline', S.READY_FOR_AUTOMATION, S.AUTOMATION_IN_PROGRESS)).toBe(true);
    expect(canTransition('pipeline', S.AUTOMATION_IN_PROGRESS, S.PENDING_REVIEW)).toBe(true);
    expect(canTransition('pipeline', S.AUTOMATION_IN_PROGRESS, S.NEEDS_ATTENTION)).toBe(true);
    expect(canTransition('pipeline', S.PENDING_REVIEW, S.AUTOMATED)).toBe(true);
    expect(canTransition('pipeline', S.PENDING_REVIEW, S.NEEDS_ATTENTION)).toBe(true);
  });

  it('never lets the pipeline decide that a case should be automated', () => {
    expect(canTransition('pipeline', S.NOT_PLANNED, S.READY_FOR_AUTOMATION)).toBe(false);
    expect(canTransition('pipeline', S.NOT_PLANNED, S.AUTOMATION_IN_PROGRESS)).toBe(false);
    expect(canTransition('pipeline', S.AUTOMATED, S.AUTOMATION_IN_PROGRESS)).toBe(false);
  });

  it('refuses no-op transitions', () => {
    expect(canTransition('human', S.NOT_PLANNED, S.NOT_PLANNED)).toBe(false);
    expect(canTransition('pipeline', S.PENDING_REVIEW, S.PENDING_REVIEW)).toBe(false);
  });
});

describe('allowedTargets', () => {
  it('lists what the UI should offer', () => {
    expect(allowedTargets('human', S.NEEDS_ATTENTION)).toEqual([
      S.READY_FOR_AUTOMATION,
      S.NOT_PLANNED,
    ]);
    expect(allowedTargets('human', S.AUTOMATION_IN_PROGRESS)).toEqual([]);
  });
});

describe('bumpsVersion', () => {
  it('bumps only when a human requests automation', () => {
    expect(bumpsVersion('human', S.READY_FOR_AUTOMATION)).toBe(true);
    expect(bumpsVersion('human', S.NOT_PLANNED)).toBe(false);
    expect(bumpsVersion('pipeline', S.AUTOMATION_IN_PROGRESS)).toBe(false);
    expect(bumpsVersion('pipeline', S.AUTOMATED)).toBe(false);
  });
});

describe('statusLabel', () => {
  it('reads like English', () => {
    expect(statusLabel(S.READY_FOR_AUTOMATION)).toBe('Ready for automation');
    expect(statusLabel(S.NEEDS_ATTENTION)).toBe('Needs attention');
  });
});
