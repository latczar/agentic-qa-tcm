import path from 'node:path';
import { rm } from 'node:fs/promises';
import { repoRoot } from '@aiqa/framework-manifest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { FailingProvider } from '../llm/failing-provider.js';
import { ReplayProvider } from '../llm/replay-provider.js';
import { PgRunRepository } from '../repo/runs.js';
import { FakeTcmClient } from '../tcm/fake-client.js';
import { executeRun, startRun } from './run-pipeline.js';
import { wire } from '../wiring.js';

/**
 * The scenario matrix: every scenario folder runs through the REAL pipeline (Postgres, tsc, ESLint,
 * Playwright against the HR Portal) and must end exactly as its scenario.json says.
 * Needs Postgres from docker-compose. Playwright starts the HR Portal itself.
 * Run with: npm run test:integration
 */
const config = loadConfig();
const scenariosDir = path.join(repoRoot, 'scenarios');
const seedDir = path.join(repoRoot, 'apps', 'mock-tcm', 'seed', 'test-cases');
let runs: PgRunRepository;
const artifactsDir = path.join(repoRoot, 'artifacts', 'integration-runs');

beforeAll(async () => {
  runs = await PgRunRepository.connect(
    config.databaseUrl,
    new URL('../../schema.sql', import.meta.url),
  );
  await rm(artifactsDir, { recursive: true, force: true });
});

afterAll(async () => {
  await runs.close();
});

const scenarioNames = await ReplayProvider.listScenarios(scenariosDir);

describe.each(scenarioNames)('scenario %s', (name) => {
  it('ends as scenario.json expects', async () => {
    const meta = JSON.parse(
      await (
        await import('node:fs/promises')
      ).readFile(path.join(scenariosDir, name, 'scenario.json'), 'utf8'),
    ) as {
      testCaseId: string;
      provider?: string;
      expect: {
        finalStatus: string;
        attempts: number;
        failureClasses: string[];
        tcmStatus: string;
        runFailureClass?: string;
      };
    };

    const provider =
      meta.provider === 'failing'
        ? new FailingProvider('unavailable')
        : await ReplayProvider.load(scenariosDir, name);
    const tcm = await FakeTcmClient.fromSeedDir(seedDir);
    // Each scenario gets its own version so runs never collide in the shared database.
    const version = 1000 + scenarioNames.indexOf(name) + (Math.floor(Date.now() / 1000) % 100000);
    tcm.setStatus(meta.testCaseId, 'READY_FOR_AUTOMATION', version);

    const deps = await wire({
      config: { ...config, artifactsDir },
      provider,
      tcm,
      runs,
      scenario: name,
      log: () => {},
    });
    try {
      const { run } = await startRun(deps, meta.testCaseId, version);
      const done = await executeRun(deps, run.id);
      const attempts = await runs.attempts(run.id);

      expect(done.status).toBe(meta.expect.finalStatus);
      expect(done.attempts).toBe(meta.expect.attempts);
      expect(attempts.map((a) => a.failureClass).filter(Boolean)).toEqual(
        meta.expect.failureClasses,
      );
      expect(tcm.statusOf(meta.testCaseId)).toBe(meta.expect.tcmStatus);
      if (meta.expect.runFailureClass) expect(done.failureClass).toBe(meta.expect.runFailureClass);
      if (done.status === 'PENDING_REVIEW') {
        expect(done.candidatePath).toMatch(/^tests\/generated\/tc-014-.*\.spec\.ts$/);
        const last = attempts.at(-1)!;
        expect(last.gateReport?.results.map((r) => r.gate)).toEqual([
          'G0',
          'G1',
          'G2',
          'G3',
          'G4',
          'G5',
        ]);
        // Clean up the accepted candidate so the next scenario starts from an empty generated folder.
        await rm(path.join(config.frameworkRoot, done.candidatePath!), { force: true });
      }
    } finally {
      await deps.close();
    }
  }, 300_000);
});
