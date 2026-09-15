import { FailureClass } from '@aiqa/shared';
import type { FrameworkManifest } from '@aiqa/framework-manifest';
import type { GateReport, GateResult, SelfReport } from '../domain/types.js';
import { analyseCode } from './analysis.js';
import { gateEslint } from './g4-eslint.js';
import { gateExecute } from './g5-execute.js';
import { gateStructure } from './g1-structure.js';
import { gateSymbols } from './g2-symbols.js';
import { gateTypescript } from './g3-typescript.js';

export interface CandidateInput {
  testCaseId: string;
  code: string;
  claimedMethods: string[];
  /** Absolute path where the candidate has been written inside the framework. */
  absPath: string;
}

export interface GatesOutcome {
  report: GateReport;
  selfReport: SelfReport | null;
}

/** Runs gates G1 to G5 in order and stops at the first failure. G0 runs before the file exists. */
export interface Gates {
  run(input: CandidateInput): Promise<GatesOutcome>;
}

export class RealGates implements Gates {
  constructor(
    private readonly manifest: FrameworkManifest,
    private readonly frameworkRoot: string,
  ) {}

  async run(input: CandidateInput): Promise<GatesOutcome> {
    const results: GateResult[] = [];
    const fail = (failureClass: FailureClass): GatesOutcome => ({
      report: { passed: false, results, failedGate: results.at(-1)?.gate ?? null, failureClass },
      selfReport,
    });
    let selfReport: SelfReport | null = null;

    const analysis = analyseCode(input.code);

    const g1 = gateStructure(analysis, this.manifest, input.testCaseId);
    results.push(g1);
    if (!g1.passed) return fail(FailureClass.POLICY_VIOLATION);

    const g2 = gateSymbols(analysis, this.manifest, input.claimedMethods);
    selfReport = g2.selfReport;
    results.push(g2.result);
    if (!g2.result.passed) return fail(FailureClass.UNKNOWN_SYMBOL);

    const g3 = await gateTypescript(this.frameworkRoot, input.absPath);
    results.push(g3);
    if (!g3.passed) return fail(FailureClass.TYPE_ERROR);

    const g4 = await gateEslint(input.absPath);
    results.push(g4);
    if (!g4.passed) return fail(FailureClass.LINT_ERROR);

    const g5 = await gateExecute(this.frameworkRoot, input.absPath);
    results.push(g5.result);
    if (!g5.result.passed) return fail(g5.failureClass ?? FailureClass.EXECUTION_FAILURE);

    return { report: { passed: true, results, failedGate: null, failureClass: null }, selfReport };
  }
}
