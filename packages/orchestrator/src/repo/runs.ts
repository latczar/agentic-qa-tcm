import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { FailureClass, RunStatus } from '@aiqa/shared';
import type { GenerationAttempt, GenerationRun } from '../domain/types.js';

export interface NewRun {
  id: string;
  testCaseId: string;
  testCaseVersion: number;
  maxAttempts: number;
  provider: string;
  model: string;
}

export type RunPatch = Partial<
  Pick<
    GenerationRun,
    | 'status'
    | 'attempts'
    | 'deferrals'
    | 'candidatePath'
    | 'bestAttempt'
    | 'failureClass'
    | 'summary'
  >
>;

export interface ReviewDecision {
  status: Extract<GenerationRun['status'], 'APPROVED' | 'REJECTED'>;
  reviewedBy: string;
  reviewComment: string | null;
}

/** Persistence for runs and attempts. Postgres in real use, memory in unit tests. */
export interface RunRepository {
  /** Inserts unless a run already exists for (testCaseId, version). Returns which happened. */
  create(run: NewRun): Promise<{ created: boolean; run: GenerationRun }>;
  get(id: string): Promise<GenerationRun | undefined>;
  update(id: string, patch: RunPatch): Promise<GenerationRun>;
  /**
   * Records a human decision, atomically guarded on the run still being PENDING_REVIEW so a
   * double-click or two reviewers racing cannot both win. Returns undefined if the guard failed
   * or the run does not exist.
   */
  review(id: string, decision: ReviewDecision): Promise<GenerationRun | undefined>;
  addAttempt(attempt: GenerationAttempt): Promise<void>;
  attempts(runId: string): Promise<GenerationAttempt[]>;
  list(limit?: number): Promise<GenerationRun[]>;
}

export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, GenerationRun>();
  private readonly attemptRows: GenerationAttempt[] = [];

  async create(input: NewRun) {
    const existing = [...this.runs.values()].find(
      (r) => r.testCaseId === input.testCaseId && r.testCaseVersion === input.testCaseVersion,
    );
    if (existing) return { created: false, run: existing };
    const now = new Date().toISOString();
    const run: GenerationRun = {
      id: input.id,
      testCaseId: input.testCaseId,
      testCaseVersion: input.testCaseVersion,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: input.maxAttempts,
      deferrals: 0,
      provider: input.provider,
      model: input.model,
      candidatePath: null,
      bestAttempt: null,
      failureClass: null,
      summary: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return { created: true, run };
  }

  async get(id: string) {
    return this.runs.get(id);
  }

  async update(id: string, patch: RunPatch) {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run ${id} not found`);
    const updated = { ...run, ...patch, updatedAt: new Date().toISOString() };
    this.runs.set(id, updated);
    return updated;
  }

  async review(id: string, decision: ReviewDecision) {
    const run = this.runs.get(id);
    if (!run || run.status !== 'PENDING_REVIEW') return undefined;
    const now = new Date().toISOString();
    const updated: GenerationRun = {
      ...run,
      status: decision.status,
      reviewedBy: decision.reviewedBy,
      reviewedAt: now,
      reviewComment: decision.reviewComment,
      updatedAt: now,
    };
    this.runs.set(id, updated);
    return updated;
  }

  async addAttempt(attempt: GenerationAttempt) {
    this.attemptRows.push(attempt);
  }

  async attempts(runId: string) {
    return this.attemptRows
      .filter((a) => a.runId === runId)
      .sort((a, b) => a.attemptNo - b.attemptNo);
  }

  async list(limit = 50) {
    return [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

interface RunRow {
  id: string;
  test_case_id: string;
  test_case_version: number;
  status: RunStatus;
  attempts: number;
  max_attempts: number;
  deferrals: number;
  provider: string;
  model: string;
  candidate_path: string | null;
  best_attempt: number | null;
  failure_class: FailureClass | null;
  summary: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_comment: string | null;
  created_at: Date;
  updated_at: Date;
}

export class PgRunRepository implements RunRepository {
  constructor(private readonly db: pg.Pool) {}

  static async connect(databaseUrl: string, schemaFile: URL): Promise<PgRunRepository> {
    const db = new pg.Pool({ connectionString: databaseUrl, max: 5 });
    await db.query(await readFile(schemaFile, 'utf8'));
    return new PgRunRepository(db);
  }

  async close(): Promise<void> {
    await this.db.end();
  }

  async create(input: NewRun) {
    const inserted = await this.db.query<RunRow>(
      `INSERT INTO generation_runs (id, test_case_id, test_case_version, status, max_attempts, provider, model)
       VALUES ($1, $2, $3, 'QUEUED', $4, $5, $6)
       ON CONFLICT (test_case_id, test_case_version) DO NOTHING
       RETURNING *`,
      [
        input.id,
        input.testCaseId,
        input.testCaseVersion,
        input.maxAttempts,
        input.provider,
        input.model,
      ],
    );
    if (inserted.rows[0]) return { created: true, run: toRun(inserted.rows[0]) };
    const existing = await this.db.query<RunRow>(
      'SELECT * FROM generation_runs WHERE test_case_id = $1 AND test_case_version = $2',
      [input.testCaseId, input.testCaseVersion],
    );
    return { created: false, run: toRun(existing.rows[0]!) };
  }

  async get(id: string) {
    const { rows } = await this.db.query<RunRow>('SELECT * FROM generation_runs WHERE id = $1', [
      id,
    ]);
    return rows[0] ? toRun(rows[0]) : undefined;
  }

  async update(id: string, patch: RunPatch) {
    const columns: Record<keyof RunPatch, string> = {
      status: 'status',
      attempts: 'attempts',
      deferrals: 'deferrals',
      candidatePath: 'candidate_path',
      bestAttempt: 'best_attempt',
      failureClass: 'failure_class',
      summary: 'summary',
    };
    const sets: string[] = ['updated_at = now()'];
    const params: unknown[] = [id];
    for (const [key, column] of Object.entries(columns) as Array<[keyof RunPatch, string]>) {
      if (patch[key] !== undefined) {
        params.push(patch[key]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    const { rows } = await this.db.query<RunRow>(
      `UPDATE generation_runs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    if (!rows[0]) throw new Error(`Run ${id} not found`);
    return toRun(rows[0]);
  }

  async review(id: string, decision: ReviewDecision) {
    const { rows } = await this.db.query<RunRow>(
      `UPDATE generation_runs
       SET status = $2, reviewed_by = $3, reviewed_at = now(), review_comment = $4, updated_at = now()
       WHERE id = $1 AND status = 'PENDING_REVIEW'
       RETURNING *`,
      [id, decision.status, decision.reviewedBy, decision.reviewComment],
    );
    return rows[0] ? toRun(rows[0]) : undefined;
  }

  async addAttempt(a: GenerationAttempt) {
    await this.db.query(
      `INSERT INTO generation_attempts
         (run_id, attempt_no, kind, prompt_version, context_receipt, prompt, raw_response, parsed_ok, gate_report, failure_class, self_report, duration_ms, mode, agent_log, prompt_tokens, completion_tokens)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        a.runId,
        a.attemptNo,
        a.kind,
        a.promptVersion,
        JSON.stringify(a.contextReceipt),
        a.prompt,
        a.rawResponse,
        a.parsedOk,
        a.gateReport ? JSON.stringify(a.gateReport) : null,
        a.failureClass,
        a.selfReport ? JSON.stringify(a.selfReport) : null,
        a.durationMs,
        a.mode,
        JSON.stringify(a.agentLog),
        a.promptTokens,
        a.completionTokens,
      ],
    );
  }

  async attempts(runId: string) {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM generation_attempts WHERE run_id = $1 ORDER BY attempt_no',
      [runId],
    );
    return rows.map((r) => ({
      runId: r.run_id as string,
      attemptNo: r.attempt_no as number,
      kind: r.kind as GenerationAttempt['kind'],
      promptVersion: r.prompt_version as string,
      contextReceipt: r.context_receipt as GenerationAttempt['contextReceipt'],
      prompt: r.prompt as string,
      rawResponse: r.raw_response as string | null,
      parsedOk: r.parsed_ok as boolean,
      gateReport: r.gate_report as GenerationAttempt['gateReport'],
      failureClass: r.failure_class as GenerationAttempt['failureClass'],
      selfReport: r.self_report as GenerationAttempt['selfReport'],
      mode: (r.mode as GenerationAttempt['mode']) ?? 'curated',
      agentLog: (r.agent_log as GenerationAttempt['agentLog']) ?? [],
      promptTokens: (r.prompt_tokens as number | null) ?? null,
      completionTokens: (r.completion_tokens as number | null) ?? null,
      durationMs: r.duration_ms as number,
    }));
  }

  async list(limit = 50) {
    const { rows } = await this.db.query<RunRow>(
      'SELECT * FROM generation_runs ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return rows.map(toRun);
  }
}

function toRun(r: RunRow): GenerationRun {
  return {
    id: r.id,
    testCaseId: r.test_case_id,
    testCaseVersion: r.test_case_version,
    status: r.status,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    deferrals: r.deferrals,
    provider: r.provider,
    model: r.model,
    candidatePath: r.candidate_path,
    bestAttempt: r.best_attempt,
    failureClass: r.failure_class,
    summary: r.summary,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    reviewComment: r.review_comment,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}
