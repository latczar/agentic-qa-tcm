import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as prettier from 'prettier';
import { FailureClass, RunStatus, TcmAutomationStatus } from '@aiqa/shared';
import type { ContextBuilder } from '../context/builder.js';
import type { FrameworkClient } from '../context/framework-client.js';
import { render, type PromptTemplates } from '../context/prompts.js';
import { OUTPUT_JSON_SCHEMA } from '../domain/output-schema.js';
import { decide } from '../domain/retry-policy.js';
import type {
  AttemptKind,
  ContextReceipt,
  GateReport,
  GenerationAttempt,
  GenerationRun,
  SelfReport,
  TestCase,
} from '../domain/types.js';
import { gateContract } from '../gates/g0-contract.js';
import type { Gates } from '../gates/runner.js';
import {
  ProviderTimeoutError,
  ProviderUnavailableError,
  type ChatMessage,
  type LlmProvider,
} from '../llm/provider.js';
import type { RunRepository } from '../repo/runs.js';
import type { TcmClient } from '../tcm/client.js';
import { generate, type AgentLogEntry, type ContextMode } from './agent.js';
import type { ArtefactStore } from './artefacts.js';
import { toRunEvent, type EventEmitter } from './events.js';
import { feedbackFrom } from './feedback.js';

export interface PipelineDeps {
  tcm: TcmClient;
  provider: LlmProvider;
  runs: RunRepository;
  context: ContextBuilder;
  /** MCP client of the framework-context server; the agent loop runs the model's tool calls through it. */
  framework: FrameworkClient;
  gates: Gates;
  artefacts: ArtefactStore;
  prompts: PromptTemplates;
  frameworkRoot: string;
  maxAttempts: number;
  maxDeferrals: number;
  mode: ContextMode;
  maxToolCalls: number;
  events: EventEmitter;
  publicUrl: string;
  /** For the replay provider: which scenario is playing. */
  scenario?: string;
  log?: (message: string) => void;
}

export const GENERATED_DIR = path.join('tests', 'generated');

/** The output contract as JSON Schema, for providers that support constrained output. */

/**
 * Idempotent entry point. One run per (test case, version): a second call with the same
 * identity returns the existing run and creates nothing.
 */
export async function startRun(
  deps: PipelineDeps,
  testCaseId: string,
  version?: number,
): Promise<{ created: boolean; run: GenerationRun }> {
  const testCase = await deps.tcm.getCase(testCaseId);
  if (!testCase) throw new Error(`${testCaseId} does not exist in the TCM`);
  return deps.runs.create({
    id: `run-${randomUUID().slice(0, 8)}`,
    testCaseId,
    testCaseVersion: version ?? testCase.version,
    maxAttempts: deps.maxAttempts,
    provider: deps.provider.name,
    model: deps.provider.model,
  });
}

/** Drives a run from QUEUED or DEFERRED to a terminal state or another deferral. */
export async function executeRun(deps: PipelineDeps, runId: string): Promise<GenerationRun> {
  const log = deps.log ?? (() => {});
  let run = await deps.runs.get(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== RunStatus.QUEUED && run.status !== RunStatus.DEFERRED) {
    log(`${run.id} is ${run.status}; nothing to do`);
    return run;
  }

  // 1. Claim the case, once.
  let testCase: TestCase;
  if (run.status === RunStatus.QUEUED) {
    const claim = await deps.tcm.claim(run.testCaseId, run.testCaseVersion, run.id);
    if (!claim.ok) {
      log(`${run.id}: could not claim ${run.testCaseId}: ${claim.message}`);
      const failed = await deps.runs.update(run.id, {
        status: RunStatus.NEEDS_ATTENTION,
        summary: `Could not claim ${run.testCaseId} at version ${run.testCaseVersion}: ${claim.message}`,
      });
      await deps.events.emit(toRunEvent('run.needs_attention', failed, deps.publicUrl));
      return failed;
    }
    testCase = claim.testCase;
  } else {
    const fetched = await deps.tcm.getCase(run.testCaseId);
    if (!fetched) throw new Error(`${run.testCaseId} vanished from the TCM`);
    testCase = fetched;
  }

  // 2. Is the model there at all? If not, defer without spending an attempt.
  try {
    await deps.provider.health();
  } catch (error) {
    return defer(deps, run, error as Error, log);
  }

  // 3. Build the context once. Retries append feedback rather than rebuilding.
  run = await deps.runs.update(run.id, { status: RunStatus.BUILDING_CONTEXT });
  const built = await deps.context.build(testCase);
  const mode: ContextMode =
    deps.mode === 'agentic' && deps.provider.supportsTools ? 'agentic' : 'curated';
  const receipt: ContextReceipt = { ...built.receipt, mode };
  const conversation: ChatMessage[] = [...built.messages];
  let kind: AttemptKind = 'generate';
  let previousCode: string | null = null;
  let bestAttempt: { no: number; gatesPassed: number } | null = null;

  while (true) {
    const attemptNo = run.attempts + 1;
    run = await deps.runs.update(run.id, { status: RunStatus.GENERATING });
    log(`${run.id}: attempt ${attemptNo}/${run.maxAttempts} (${kind}, ${mode})`);
    const started = Date.now();

    // 4. Ask the model, with tools in agentic mode.
    let raw: string;
    let agentLog: AgentLogEntry[] = [];
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    try {
      const result = await generate(
        deps.provider,
        deps.framework,
        conversation,
        {
          mode,
          maxToolCalls: deps.maxToolCalls,
          jsonSchema: deps.prompts.responseFormat === 'json' ? OUTPUT_JSON_SCHEMA : undefined,
        },
        { scenario: deps.scenario, attempt: attemptNo },
      );
      raw = result.response.text;
      agentLog = result.agentLog;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
      if (agentLog.length)
        log(
          `${run.id}: model made ${agentLog.length} tool call(s): ${agentLog.map((e) => e.tool).join(', ')}`,
        );
    } catch (error) {
      if (error instanceof ProviderUnavailableError || error instanceof ProviderTimeoutError) {
        return defer(deps, run, error, log);
      }
      throw error;
    }
    conversation.push({ role: 'assistant', content: raw });

    const record = (
      parsedOk: boolean,
      report: GateReport,
      failureClass: FailureClass | null,
      selfReport: SelfReport | null,
    ): GenerationAttempt => ({
      runId,
      attemptNo,
      kind,
      mode,
      promptVersion: deps.prompts.version,
      contextReceipt: receipt,
      prompt: conversation
        .slice(0, -1)
        .map((m) => `[${m.role}${m.toolName ? `:${m.toolName}` : ''}]\n${m.content}`)
        .join('\n\n'),
      rawResponse: raw,
      parsedOk,
      gateReport: report,
      failureClass,
      selfReport,
      agentLog,
      promptTokens,
      completionTokens,
      durationMs: Date.now() - started,
    });

    // 5. G0: is it even a valid response?
    const g0 = gateContract(raw, testCase.id);
    let report: GateReport;
    let code: string | null = null;
    let selfReport: SelfReport | null = null;

    if (!g0.parsed) {
      report = {
        passed: false,
        results: [g0.result],
        failedGate: 'G0',
        failureClass: FailureClass.MALFORMED_RESPONSE,
      };
    } else {
      // 6. Write the candidate into the framework and run G1 to G5 against it.
      run = await deps.runs.update(run.id, { status: RunStatus.VALIDATING });
      const fileName = normaliseFileName(g0.parsed.fileName, testCase.id);
      const absPath = path.join(deps.frameworkRoot, GENERATED_DIR, fileName);
      code = await formatCandidate(withHeader(g0.parsed.code, run, attemptNo, testCase), absPath);
      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, code, 'utf8');

      const outcome = await deps.gates.run({
        testCaseId: testCase.id,
        code,
        claimedMethods: g0.parsed.usedMethods,
        absPath,
      });
      report = { ...outcome.report, results: [g0.result, ...outcome.report.results] };
      selfReport = outcome.selfReport;

      if (report.passed) {
        const relPath = path.relative(deps.frameworkRoot, absPath).split(path.sep).join('/');
        await deps.runs.addAttempt(record(true, report, null, selfReport));
        await deps.artefacts.attempt(run.id, attemptNo, {
          messages: conversation,
          response: raw,
          code,
          report,
          receipt,
        });
        run = await deps.runs.update(run.id, {
          status: RunStatus.PENDING_REVIEW,
          attempts: attemptNo,
          candidatePath: relPath,
          bestAttempt: attemptNo,
          failureClass: null,
          summary: `All gates passed on attempt ${attemptNo}. Candidate: ${relPath}`,
        });
        await deps.tcm.report(testCase.id, {
          status: TcmAutomationStatus.PENDING_REVIEW,
          automationRef: `packages/e2e-framework/${relPath}`,
          note: run.summary,
        });
        await deps.artefacts.summary(run, summaryText(run, report));
        await deps.events.emit(toRunEvent('run.pending_review', run, deps.publicUrl));
        log(`${run.id}: PENDING_REVIEW after ${attemptNo} attempt(s)`);
        return run;
      }
      // A failing candidate never stays in the framework; the artefact copy is kept.
      await rm(absPath, { force: true });
    }

    // 7. Record the failed attempt and decide what to do next.
    const failureClass = report.failureClass ?? FailureClass.POLICY_VIOLATION;
    await deps.runs.addAttempt(record(Boolean(g0.parsed), report, failureClass, selfReport));
    await deps.artefacts.attempt(run.id, attemptNo, {
      messages: conversation,
      response: raw,
      code,
      report,
      receipt,
    });
    const gatesPassed = report.results.filter((r) => r.passed).length;
    if (!bestAttempt || gatesPassed > bestAttempt.gatesPassed)
      bestAttempt = { no: attemptNo, gatesPassed };
    run = await deps.runs.update(run.id, {
      attempts: attemptNo,
      failureClass,
      bestAttempt: bestAttempt.no,
    });
    log(`${run.id}: attempt ${attemptNo} failed at ${report.failedGate} (${failureClass})`);

    const decision = decide(
      failureClass,
      attemptNo,
      run.maxAttempts,
      run.deferrals,
      deps.maxDeferrals,
    );
    if (decision.action === 'retry') {
      kind = decision.kind;
      const feedback = feedbackFrom(report);
      const template = kind === 'repair' ? deps.prompts.repair : deps.prompts.retry;
      conversation.push({
        role: 'user',
        content: render(template, {
          attempt: String(attemptNo),
          maxAttempts: String(run.maxAttempts),
          testCaseId: testCase.id,
          gate: feedback.gate,
          failureClass,
          errors: feedback.errors,
          hints: feedback.hints,
          previousCode: g0.parsed?.code ?? previousCode ?? '',
        }),
      });
      previousCode = g0.parsed?.code ?? previousCode;
      continue;
    }

    const summary = `Stopped after ${attemptNo} attempt(s): ${failureClass} at ${report.failedGate}. Best attempt: ${bestAttempt.no}.`;
    run = await deps.runs.update(run.id, { status: RunStatus.NEEDS_ATTENTION, summary });
    await deps.tcm.report(testCase.id, {
      status: TcmAutomationStatus.NEEDS_ATTENTION,
      note: summary,
    });
    await deps.artefacts.summary(run, summaryText(run, report));
    await deps.events.emit(toRunEvent('run.needs_attention', run, deps.publicUrl));
    log(`${run.id}: NEEDS_ATTENTION (${failureClass})`);
    return run;
  }
}

async function defer(
  deps: PipelineDeps,
  run: GenerationRun,
  error: Error,
  log: (m: string) => void,
) {
  const deferrals = run.deferrals + 1;
  const failureClass =
    error instanceof ProviderTimeoutError ? FailureClass.LLM_TIMEOUT : FailureClass.LLM_UNAVAILABLE;
  const decision = decide(
    failureClass,
    run.attempts,
    run.maxAttempts,
    run.deferrals,
    deps.maxDeferrals,
  );
  if (decision.action === 'defer') {
    log(`${run.id}: deferred (${deferrals}/${deps.maxDeferrals}): ${error.message}`);
    const deferred = await deps.runs.update(run.id, {
      status: RunStatus.DEFERRED,
      deferrals,
      failureClass,
      summary: `Deferred ${deferrals} time(s): ${error.message}`,
    });
    await deps.events.emit(toRunEvent('run.deferred', deferred, deps.publicUrl));
    return deferred;
  }
  const summary = `Model unavailable ${deferrals} times; giving up. Last error: ${error.message}`;
  const updated = await deps.runs.update(run.id, {
    status: RunStatus.NEEDS_ATTENTION,
    deferrals,
    failureClass,
    summary,
  });
  await deps.tcm.report(run.testCaseId, {
    status: TcmAutomationStatus.NEEDS_ATTENTION,
    note: summary,
  });
  await deps.events.emit(toRunEvent('run.needs_attention', updated, deps.publicUrl));
  log(`${run.id}: NEEDS_ATTENTION (model unavailable)`);
  return updated;
}

/** Forces the file name onto the run's test case id so a wrong id in the response cannot misplace the file. */
export function normaliseFileName(fileName: string, testCaseId: string): string {
  const num = testCaseId.replace(/^TC-/, '').toLowerCase();
  const slug = fileName
    .replace(/\.spec\.ts$/, '')
    .replace(/^tc-\d+-?/i, '')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `tc-${num}-${slug || 'generated'}.spec.ts`;
}

function withHeader(
  code: string,
  run: GenerationRun,
  attemptNo: number,
  testCase: TestCase,
): string {
  const header = [
    `// Generated by ai-qa-pipeline. Run ${run.id}, attempt ${attemptNo}.`,
    `// Source: ${testCase.id} v${testCase.version} "${testCase.title}". Provider: ${run.provider}, model: ${run.model}.`,
    `// Status: candidate awaiting human review. Do not edit in place; approve or reject the run.`,
  ].join('\n');
  return `${header}\n${code.replace(/^\s*\/\/ Generated by ai-qa-pipeline[\s\S]*?\n(?=\S)/, '')}`;
}

async function formatCandidate(code: string, filepath: string): Promise<string> {
  try {
    return await prettier.format(code, {
      filepath,
      singleQuote: true,
      printWidth: 100,
      trailingComma: 'all',
    });
  } catch {
    // Unparseable code is left as-is; G3 will explain what is wrong with it.
    return code;
  }
}

function summaryText(run: GenerationRun, report: GateReport): string {
  const gates = report.results
    .map(
      (r) =>
        `| ${r.gate} | ${r.name} | ${r.passed ? 'pass' : 'FAIL'} | ${r.durationMs} ms | ${r.errors.length} |`,
    )
    .join('\n');
  return [
    `# Run ${run.id}`,
    '',
    `Test case: ${run.testCaseId} v${run.testCaseVersion}`,
    `Status: ${run.status}`,
    `Attempts: ${run.attempts} of ${run.maxAttempts}`,
    `Provider: ${run.provider} (${run.model})`,
    run.candidatePath ? `Candidate: ${run.candidatePath}` : '',
    run.summary ? `Summary: ${run.summary}` : '',
    '',
    '## Last attempt gates',
    '',
    '| Gate | Name | Result | Duration | Errors |',
    '| --- | --- | --- | --- | --- |',
    gates,
    '',
  ].join('\n');
}
