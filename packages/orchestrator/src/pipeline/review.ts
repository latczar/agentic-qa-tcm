import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RunStatus, TcmAutomationStatus } from '@aiqa/shared';
import type { GenerationRun } from '../domain/types.js';
import type { RunRepository } from '../repo/runs.js';
import type { TcmClient } from '../tcm/client.js';
import { toRunEvent, type EventEmitter } from './events.js';

/**
 * A candidate's relative imports (e.g. '../../src/fixtures/test.js') are only correct for its
 * depth inside tests/generated/. Promotion moves the file to tests/e2e/<feature>/, one directory
 * deeper, so a plain rename would silently leave every import pointing at the wrong place. This
 * recomputes each relative specifier from where the file actually ends up, rather than assuming
 * a fixed depth difference.
 */
export function rewriteRelativeImports(
  code: string,
  fromAbsPath: string,
  toAbsPath: string,
): string {
  const fromDir = path.dirname(fromAbsPath);
  const toDir = path.dirname(toAbsPath);
  return code.replace(
    /from\s+(['"])(\.\.?\/[^'"]+)\1/g,
    (match: string, quote: string, specifier: string) => {
      const target = path.resolve(fromDir, specifier);
      const rewritten = path.relative(toDir, target).split(path.sep).join('/');
      const specWithPrefix = rewritten.startsWith('.') ? rewritten : `./${rewritten}`;
      return `from ${quote}${specWithPrefix}${quote}`;
    },
  );
}

export interface ReviewDeps {
  runs: RunRepository;
  tcm: TcmClient;
  frameworkRoot: string;
  events: EventEmitter;
  publicUrl: string;
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
    await deps.events.emit(toRunEvent('run.rejected', reviewed, deps.publicUrl));
    return { ok: true, run: reviewed };
  }

  if (!reviewed.candidatePath) throw new Error(`Run ${runId} has no candidate to promote`);
  const testCase = await deps.tcm.getCase(reviewed.testCaseId);
  if (!testCase) throw new Error(`${reviewed.testCaseId} vanished from the TCM`);

  const fileName = path.basename(reviewed.candidatePath);
  const destRel = path.join('tests', 'e2e', testCase.feature, fileName).split(path.sep).join('/');
  const destAbs = path.join(deps.frameworkRoot, destRel);
  const srcAbs = path.join(deps.frameworkRoot, reviewed.candidatePath);
  await mkdir(path.dirname(destAbs), { recursive: true });
  const code = await readFile(srcAbs, 'utf8');
  await writeFile(destAbs, rewriteRelativeImports(code, srcAbs, destAbs), 'utf8');
  await rm(srcAbs);

  await deps.tcm.report(reviewed.testCaseId, {
    status: TcmAutomationStatus.AUTOMATED,
    automationRef: `packages/e2e-framework/${destRel}`,
    note: input.comment ?? reviewed.summary,
  });
  const run = await deps.runs.update(runId, { candidatePath: destRel });
  await deps.events.emit(toRunEvent('run.approved', run, deps.publicUrl));
  return { ok: true, run };
}
