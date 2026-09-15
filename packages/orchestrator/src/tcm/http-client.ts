import type { ClaimResult, ReportInput, TcmClient } from './client.js';
import type { TestCase } from '../domain/types.js';

interface ApiCase {
  id: string;
  version: number;
  title: string;
  feature: string;
  priority: string;
  preconditions: string;
  steps: Array<{ action: string; expected: string }>;
  test_data: Record<string, unknown>;
}

/** Talks to the mock TCM's JSON API (apps/mock-tcm). */
export class HttpTcmClient implements TcmClient {
  constructor(private readonly baseUrl: string) {}

  async getCase(id: string): Promise<TestCase | undefined> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(id)}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`TCM GET case ${id} failed: HTTP ${response.status}`);
    const body = (await response.json()) as { case: ApiCase };
    return toTestCase(body.case);
  }

  async claim(id: string, version: number, runId: string): Promise<ClaimResult> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(id)}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, run_id: runId }),
    });
    const body = (await response.json()) as { case?: ApiCase; error?: string };
    if (response.ok && body.case) return { ok: true, testCase: toTestCase(body.case) };
    if (response.status === 404)
      return { ok: false, reason: 'not_found', message: `${id} not found` };
    return { ok: false, reason: 'conflict', message: body.error ?? `HTTP ${response.status}` };
  }

  async report(id: string, input: ReportInput): Promise<{ ok: boolean; message?: string }> {
    const response = await fetch(`${this.baseUrl}/api/cases/${encodeURIComponent(id)}/automation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: input.status,
        automation_ref: input.automationRef,
        note: input.note,
      }),
    });
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: body.error ?? `HTTP ${response.status}` };
  }
}

function toTestCase(c: ApiCase): TestCase {
  return {
    id: c.id,
    version: c.version,
    title: c.title,
    feature: c.feature,
    priority: c.priority,
    preconditions: c.preconditions,
    steps: c.steps,
    testData: c.test_data ?? {},
  };
}
