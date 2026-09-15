import { TcmAutomationStatus as S } from '@aiqa/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createPool, migrate, type Db } from '../db.js';
import { loadSeedCases, type SeedCase } from '../domain/seed-loader.js';
import { CaseRepository } from './cases.js';

// Needs the Postgres from docker-compose (database tcm). Run with: npm run test:integration

let db: Db;
let repo: CaseRepository;
let seed: SeedCase[];

beforeAll(async () => {
  const config = loadConfig();
  db = createPool(config.databaseUrl);
  await migrate(db);
  seed = await loadSeedCases(config.seedDir);
  repo = new CaseRepository(db);
});

beforeEach(async () => {
  await repo.replaceAll(seed);
});

afterAll(async () => {
  await db.end();
});

const readyId = () => seed.find((c) => c.automation_status === S.READY_FOR_AUTOMATION)!.id;
const notPlannedId = () => seed.find((c) => c.automation_status === S.NOT_PLANNED)!.id;

describe('CaseRepository', () => {
  it('lists and filters', async () => {
    const all = await repo.list();
    expect(all.length).toBe(seed.length);
    const ready = await repo.list({ automation_status: S.READY_FOR_AUTOMATION });
    expect(ready.every((c) => c.automation_status === S.READY_FOR_AUTOMATION)).toBe(true);
    expect(ready.length).toBeGreaterThan(0);
  });

  it('claims a ready case exactly once for a given version', async () => {
    const id = readyId();
    const first = await repo.transition(id, 'pipeline', S.AUTOMATION_IN_PROGRESS, {
      expectedVersion: 1,
      run_id: 'run-1',
    });
    expect(first.ok).toBe(true);

    const second = await repo.transition(id, 'pipeline', S.AUTOMATION_IN_PROGRESS, {
      expectedVersion: 1,
      run_id: 'run-2',
    });
    expect(second.ok).toBe(false);
    if (!second.ok && second.reason === 'conflict') {
      expect(second.testCase.automation_run_id).toBe('run-1');
    }
  });

  it('refuses a claim with the wrong version', async () => {
    const result = await repo.transition(readyId(), 'pipeline', S.AUTOMATION_IN_PROGRESS, {
      expectedVersion: 7,
      run_id: 'run-x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'conflict')
      expect(result.message).toMatch(/version 1, not 7/);
  });

  it('only one of two concurrent claims wins', async () => {
    const id = readyId();
    const results = await Promise.all(
      ['a', 'b', 'c', 'd'].map((n) =>
        repo.transition(id, 'pipeline', S.AUTOMATION_IN_PROGRESS, {
          expectedVersion: 1,
          run_id: `run-${n}`,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('bumps the version when a human requests automation, not when the pipeline reports', async () => {
    const id = notPlannedId();
    const requested = await repo.transition(id, 'human', S.READY_FOR_AUTOMATION);
    expect(requested.ok && requested.testCase.version).toBe(2);

    const claimed = await repo.transition(id, 'pipeline', S.AUTOMATION_IN_PROGRESS, {
      expectedVersion: 2,
      run_id: 'run-9',
    });
    expect(claimed.ok && claimed.testCase.version).toBe(2);
  });

  it('refuses transitions the actor is not allowed to make', async () => {
    const result = await repo.transition(notPlannedId(), 'pipeline', S.AUTOMATION_IN_PROGRESS);
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'conflict') expect(result.message).toMatch(/cannot move/);
  });

  it('records history for every change', async () => {
    const id = notPlannedId();
    await repo.transition(id, 'human', S.READY_FOR_AUTOMATION, { actorName: 'priya' });
    await repo.transition(id, 'pipeline', S.AUTOMATION_IN_PROGRESS, { run_id: 'run-1' });
    await repo.transition(id, 'pipeline', S.PENDING_REVIEW, {
      automation_ref: 'tests/generated/x.spec.ts',
      note: 'Gates passed',
    });
    const history = await repo.history(id);
    expect(history.map((h) => h.to_status)).toEqual([
      S.PENDING_REVIEW,
      S.AUTOMATION_IN_PROGRESS,
      S.READY_FOR_AUTOMATION,
      S.NOT_PLANNED,
    ]);
    expect(history[0]?.note).toBe('Gates passed');
    const updated = await repo.get(id);
    expect(updated?.automation_ref).toBe('tests/generated/x.spec.ts');
  });

  it('bumps the version on a content edit and keeps the status', async () => {
    const id = readyId();
    const before = (await repo.get(id))!;
    const after = await repo.updateContent(
      id,
      { ...before, title: `${before.title} (revised)` },
      'priya',
    );
    expect(after?.version).toBe(before.version + 1);
    expect(after?.automation_status).toBe(before.automation_status);
  });

  it('returns not_found for an unknown id', async () => {
    const result = await repo.transition('TC-000', 'human', S.READY_FOR_AUTOMATION);
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
