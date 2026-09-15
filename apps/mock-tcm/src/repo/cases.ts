import { TcmAutomationStatus } from '@aiqa/shared';
import type { Db } from '../db.js';
import type { SeedCase } from '../domain/seed-loader.js';
import { bumpsVersion, canTransition, type Actor } from '../domain/transitions.js';
import type { CaseContent, HistoryEntry, TestCase } from '../domain/types.js';

export interface CaseFilter {
  automation_status?: TcmAutomationStatus;
  feature?: string;
}

export interface AutomationUpdate {
  status: TcmAutomationStatus;
  run_id?: string | null;
  automation_ref?: string | null;
  note?: string | null;
}

export type TransitionResult =
  | { ok: true; testCase: TestCase }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'conflict'; message: string; testCase: TestCase };

/** All reads and writes for test cases. Every status change also writes a history row. */
export class CaseRepository {
  constructor(private readonly db: Db) {}

  async list(filter: CaseFilter = {}): Promise<TestCase[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.automation_status) {
      params.push(filter.automation_status);
      clauses.push(`automation_status = $${params.length}`);
    }
    if (filter.feature) {
      params.push(filter.feature);
      clauses.push(`feature = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.db.query<TestCase>(
      `SELECT * FROM test_cases ${where} ORDER BY id`,
      params,
    );
    return rows.map(normalise);
  }

  async get(id: string): Promise<TestCase | undefined> {
    const { rows } = await this.db.query<TestCase>('SELECT * FROM test_cases WHERE id = $1', [id]);
    return rows[0] ? normalise(rows[0]) : undefined;
  }

  async history(id: string): Promise<HistoryEntry[]> {
    const { rows } = await this.db.query<HistoryEntry>(
      'SELECT * FROM case_history WHERE case_id = $1 ORDER BY at DESC, id DESC',
      [id],
    );
    return rows.map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
  }

  async count(): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM test_cases',
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Replaces everything with the seed. Used on first start and by the test-only reset. */
  async replaceAll(cases: SeedCase[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE case_history, test_cases');
      for (const c of cases) {
        await client.query(
          `INSERT INTO test_cases
             (id, title, feature, priority, preconditions, steps, test_data, automation_status, automation_ref, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
          [
            c.id,
            c.title,
            c.feature,
            c.priority,
            c.preconditions,
            JSON.stringify(c.steps),
            JSON.stringify(c.test_data),
            c.automation_status,
            c.automation_ref,
          ],
        );
        await client.query(
          `INSERT INTO case_history (case_id, actor, from_status, to_status, version, note)
           VALUES ($1, 'seed', NULL, $2, 1, 'Seeded')`,
          [c.id, c.automation_status],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Edits the content and bumps the version. Status is untouched. */
  async updateContent(
    id: string,
    content: CaseContent,
    actor: string,
  ): Promise<TestCase | undefined> {
    const { rows } = await this.db.query<TestCase>(
      `UPDATE test_cases
         SET title = $2, feature = $3, priority = $4, preconditions = $5, steps = $6, test_data = $7,
             version = version + 1, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        content.title,
        content.feature,
        content.priority,
        content.preconditions,
        JSON.stringify(content.steps),
        JSON.stringify(content.test_data),
      ],
    );
    const updated = rows[0];
    if (!updated) return undefined;
    await this.db.query(
      `INSERT INTO case_history (case_id, actor, from_status, to_status, version, note)
       VALUES ($1, $2, $3, $3, $4, 'Content edited')`,
      [id, actor, updated.automation_status, updated.version],
    );
    return normalise(updated);
  }

  /**
   * Moves a case to a new status if the actor is allowed to, in one statement so that two
   * concurrent requests cannot both succeed. When `expectedVersion` is given the move also
   * requires that exact version, which is how the pipeline's claim stays idempotent.
   */
  async transition(
    id: string,
    actor: Actor,
    to: TcmAutomationStatus,
    options: {
      expectedVersion?: number;
      run_id?: string | null;
      automation_ref?: string | null;
      note?: string | null;
      actorName?: string;
    } = {},
  ): Promise<TransitionResult> {
    const current = await this.get(id);
    if (!current) return { ok: false, reason: 'not_found' };
    if (!canTransition(actor, current.automation_status, to)) {
      return {
        ok: false,
        reason: 'conflict',
        message: `A ${actor} cannot move ${id} from ${current.automation_status} to ${to}.`,
        testCase: current,
      };
    }
    if (options.expectedVersion !== undefined && options.expectedVersion !== current.version) {
      return {
        ok: false,
        reason: 'conflict',
        message: `${id} is at version ${current.version}, not ${options.expectedVersion}.`,
        testCase: current,
      };
    }

    const bump = bumpsVersion(actor, to);
    const params: unknown[] = [id, current.automation_status, to];
    const sets = [
      'automation_status = $3',
      'updated_at = now()',
      bump ? 'version = version + 1' : null,
    ];
    if (options.run_id !== undefined) {
      params.push(options.run_id);
      sets.push(`automation_run_id = $${params.length}`);
    }
    if (options.automation_ref !== undefined) {
      params.push(options.automation_ref);
      sets.push(`automation_ref = $${params.length}`);
    }
    if (options.note !== undefined) {
      params.push(options.note);
      sets.push(`automation_note = $${params.length}`);
    }
    if (options.expectedVersion !== undefined) {
      params.push(options.expectedVersion);
    }
    const versionGuard =
      options.expectedVersion !== undefined ? `AND version = $${params.length}` : '';

    // The WHERE re-checks the status we read, so a concurrent transition makes this a no-op.
    const { rows } = await this.db.query<TestCase>(
      `UPDATE test_cases SET ${sets.filter(Boolean).join(', ')}
       WHERE id = $1 AND automation_status = $2 ${versionGuard}
       RETURNING *`,
      params,
    );
    const updated = rows[0];
    if (!updated) {
      const latest = (await this.get(id)) ?? current;
      return {
        ok: false,
        reason: 'conflict',
        message: `${id} changed while this request was in flight. It is now ${latest.automation_status} at version ${latest.version}.`,
        testCase: latest,
      };
    }
    await this.db.query(
      `INSERT INTO case_history (case_id, actor, from_status, to_status, version, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        options.actorName ?? actor,
        current.automation_status,
        to,
        updated.version,
        options.note ?? null,
      ],
    );
    return { ok: true, testCase: normalise(updated) };
  }
}

function normalise(row: TestCase): TestCase {
  return {
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}
