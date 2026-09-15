import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TcmAutomationStatus, type TcmAutomationStatus as Status } from '@aiqa/shared';
import { parse } from 'yaml';
import type { ClaimResult, ReportInput, TcmClient } from './client.js';
import type { TestCase } from '../domain/types.js';

interface FakeCase extends TestCase {
  status: Status;
  automationRef: string | null;
  note: string | null;
  runId: string | null;
}

/**
 * In-memory TCM with the same rules the mock TCM enforces for the pipeline: claim only a READY
 * case at the exact version, and only the pipeline's transitions afterwards.
 * Records every report so tests can assert what the TCM was told.
 */
export class FakeTcmClient implements TcmClient {
  readonly reports: Array<{ id: string } & ReportInput> = [];
  private readonly cases = new Map<string, FakeCase>();

  static fromCases(cases: TestCase[], status: Status = TcmAutomationStatus.READY_FOR_AUTOMATION) {
    const fake = new FakeTcmClient();
    for (const c of cases) fake.add(c, status);
    return fake;
  }

  /** Loads the mock TCM's YAML seed so tests use the same cases the demo does. */
  static async fromSeedDir(dir: string): Promise<FakeTcmClient> {
    const fake = new FakeTcmClient();
    for (const file of (await readdir(dir)).filter((f) => f.endsWith('.yaml')).sort()) {
      const items = parse(await readFile(path.join(dir, file), 'utf8')) as Array<
        Record<string, unknown>
      >;
      for (const raw of items) {
        fake.add(
          {
            id: String(raw.id),
            version: 1,
            title: String(raw.title),
            feature: String(raw.feature),
            priority: String(raw.priority ?? 'medium'),
            preconditions: String(raw.preconditions ?? '').trim(),
            steps: (raw.steps as Array<{ action: string; expected: string }>) ?? [],
            testData: (raw.test_data as Record<string, unknown>) ?? {},
          },
          (raw.automation_status as Status | undefined) ?? TcmAutomationStatus.NOT_PLANNED,
        );
      }
    }
    return fake;
  }

  add(testCase: TestCase, status: Status): void {
    this.cases.set(testCase.id, {
      ...testCase,
      status,
      automationRef: null,
      note: null,
      runId: null,
    });
  }

  setStatus(id: string, status: Status, version?: number): void {
    const c = this.cases.get(id);
    if (!c) throw new Error(`${id} not in fake TCM`);
    c.status = status;
    if (version !== undefined) c.version = version;
  }

  statusOf(id: string): Status | undefined {
    return this.cases.get(id)?.status;
  }

  async getCase(id: string): Promise<TestCase | undefined> {
    const c = this.cases.get(id);
    return c ? strip(c) : undefined;
  }

  async claim(id: string, version: number, runId: string): Promise<ClaimResult> {
    const c = this.cases.get(id);
    if (!c) return { ok: false, reason: 'not_found', message: `${id} not found` };
    if (c.status !== TcmAutomationStatus.READY_FOR_AUTOMATION || c.version !== version) {
      return {
        ok: false,
        reason: 'conflict',
        message: `${id} is ${c.status} at version ${c.version}, not READY_FOR_AUTOMATION at version ${version}.`,
      };
    }
    c.status = TcmAutomationStatus.AUTOMATION_IN_PROGRESS;
    c.runId = runId;
    return { ok: true, testCase: strip(c) };
  }

  async report(id: string, input: ReportInput): Promise<{ ok: boolean; message?: string }> {
    const c = this.cases.get(id);
    if (!c) return { ok: false, message: 'not found' };
    const allowed: Record<string, Status[]> = {
      AUTOMATION_IN_PROGRESS: [
        TcmAutomationStatus.PENDING_REVIEW,
        TcmAutomationStatus.NEEDS_ATTENTION,
      ],
      PENDING_REVIEW: [TcmAutomationStatus.AUTOMATED, TcmAutomationStatus.NEEDS_ATTENTION],
    };
    if (!allowed[c.status]?.includes(input.status)) {
      return {
        ok: false,
        message: `pipeline cannot move ${id} from ${c.status} to ${input.status}`,
      };
    }
    c.status = input.status;
    if (input.automationRef !== undefined) c.automationRef = input.automationRef;
    if (input.note !== undefined) c.note = input.note;
    this.reports.push({ id, ...input });
    return { ok: true };
  }
}

function strip(c: FakeCase): TestCase {
  const { status: _s, automationRef: _r, note: _n, runId: _id, ...testCase } = c;
  return testCase;
}
