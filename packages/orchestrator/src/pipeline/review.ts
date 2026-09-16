import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { RunStatus, TcmAutomationStatus } from '@aiqa/shared';
import type { GenerationRun } from '../domain/types.js';
import type { RunRepository } from '../repo/runs.js';
import type { TcmClient } from '../tcm/client.js';

export interface ReviewDeps {
  runs: RunRepository;
  tcm: TcmClient;
  frameworkRoot: string;
}

export interface ReviewInput {
  decision: 'approve' | 'reject';
  reviewer: string;
  comment: string | null;
}

export type ReviewOutcome =
  { ok: true; run: GenerationRun } | { ok: false; reason: 'not_found' | 'not_pending' };

/**
 * Approve promotes the candidate from tests/generated/ into tests/e2e/<feature>/ and reports
 * AUTOMATED to the TCM with the new location. Reject reports NEEDS_ATTENTION and leaves the
 * candidate exactly where it is: it already passed every gate, so it is kept in tests/generated/
 * for a human to finish rather than deleted.
 *
 * The status transition happens first, atomically guarded on the run still being PENDING_REVIEW
 * (see RunRepository.review). Only the caller that wins that guard touches the filesystem or the
 * TCM, so a double-click or two reviewers racing cannot promote or report a run twice.
 */
export async function applyReview(
  deps: ReviewDeps,
  runId: string,
  input: ReviewInput,
): Promise<ReviewOutcome> {
  const before = await deps.runs.get(runId);
  if (!before) return { ok: false, reason: 'not_found' };

  const status = input.decision === 'approve' ? RunStatus.APPROVED : RunStatus.REJECTED;
  const reviewed = await deps.runs.review(runId, {
    status,
    reviewedBy: input.reviewer,
    reviewComment: input.comment,
  });
  if (!reviewed) return { ok: false, reason: 'not_pending' };

  if (input.decision === 'reject') {
    await deps.tcm.report(reviewed.testCaseId, {
      status: TcmAutomationStatus.NEEDS_ATTENTION,
      note: input.comment ?? reviewed.summary,
    });
    return { ok: true, run: reviewed };
  }

  if (!reviewed.candidatePath) throw new Error(`Run ${runId} has no candidate to promote`);
  const testCase = await deps.tcm.getCase(reviewed.testCaseId);
  if (!testCase) throw new Error(`${reviewed.testCaseId} vanished from the TCM`);

  const fileName = path.basename(reviewed.candidatePath);
  const destRel = path.join('tests', 'e2e', testCase.feature, fileName).split(path.sep).join('/');
  const destAbs = path.join(deps.frameworkRoot, destRel);
  await mkdir(path.dirname(destAbs), { recursive: true });
  await rename(path.join(deps.frameworkRoot, reviewed.candidatePath), destAbs);

  await deps.tcm.report(reviewed.testCaseId, {
    status: TcmAutomationStatus.AUTOMATED,
    automationRef: `packages/e2e-framework/${destRel}`,
    note: input.comment ?? reviewed.summary,
  });
  const run = await deps.runs.update(runId, { candidatePath: destRel });
  return { ok: true, run };
}
