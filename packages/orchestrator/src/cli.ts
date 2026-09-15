import { loadConfig } from './config.js';
import { ReplayProvider } from './llm/replay-provider.js';
import { executeRun, startRun } from './pipeline/run-pipeline.js';
import { FakeTcmClient } from './tcm/fake-client.js';
import { InMemoryRunRepository, wire } from './wiring.js';
import { repoRoot } from '@aiqa/framework-manifest';
import path from 'node:path';

/**
 * npm run pipeline -- run --scenario happy [--case TC-014] [--tcm http|fake] [--memory]
 * npm run pipeline -- scenarios
 * npm run pipeline -- show <runId>
 */
const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const has = (name: string) => rest.includes(`--${name}`);
const config = loadConfig();

if (command === 'scenarios') {
  for (const name of await ReplayProvider.listScenarios(config.scenariosDir)) {
    const provider = await ReplayProvider.load(config.scenariosDir, name).catch(() => null);
    const e = provider?.expectations;
    console.log(
      `${name.padEnd(24)} ${provider ? `${provider.testCaseId}  expects ${e?.finalStatus} after ${e?.attempts} attempt(s)` : '(failing provider)'}`,
    );
  }
} else if (command === 'run') {
  const scenario = flag('scenario') ?? process.env.LLM_SCENARIO;
  const tcmMode = flag('tcm') ?? 'http';
  const tcm =
    tcmMode === 'fake'
      ? await FakeTcmClient.fromSeedDir(
          path.join(repoRoot, 'apps', 'mock-tcm', 'seed', 'test-cases'),
        )
      : undefined;
  const runs = has('memory') ? new InMemoryRunRepository() : undefined;
  const deps = await wire({ config, scenario, tcm, runs });
  try {
    const caseId =
      flag('case') ??
      (deps.provider instanceof ReplayProvider ? deps.provider.testCaseId : undefined);
    if (!caseId) throw new Error('Pass --case TC-nnn (or a --scenario that names one).');
    const { created, run } = await startRun(
      deps,
      caseId,
      flag('version') ? Number(flag('version')) : undefined,
    );
    console.log(
      `${created ? 'Created' : 'Existing'} run ${run.id} for ${run.testCaseId} v${run.testCaseVersion} (${run.status})`,
    );
    const finished = await executeRun(deps, run.id);
    console.log(`\nResult: ${finished.status}`);
    if (finished.summary) console.log(finished.summary);
    const attempts = await deps.runs.attempts(run.id);
    for (const a of attempts) {
      const failed = a.gateReport?.results.find((r) => !r.passed);
      console.log(
        `  attempt ${a.attemptNo} (${a.kind}): ${a.gateReport?.passed ? 'passed all gates' : `failed ${failed?.gate ?? '?'} ${a.failureClass ?? ''}`}` +
          (a.selfReport?.accuracy !== null && a.selfReport
            ? `, self-report accuracy ${Math.round(a.selfReport.accuracy * 100)}%`
            : ''),
      );
    }
    console.log(`Artefacts: ${config.artifactsDir}/${run.id}`);
    process.exitCode = finished.status === 'PENDING_REVIEW' ? 0 : 1;
  } finally {
    await deps.close();
  }
} else if (command === 'show') {
  const deps = await wire({
    config,
    provider: {
      name: 'none',
      model: 'none',
      health: async () => {},
      complete: async () => {
        throw new Error('read-only');
      },
    },
  });
  try {
    const run = await deps.runs.get(rest[0] ?? '');
    if (!run) throw new Error(`Run ${rest[0]} not found`);
    console.log(JSON.stringify({ run, attempts: await deps.runs.attempts(run.id) }, null, 2));
  } finally {
    await deps.close();
  }
} else {
  console.error(
    'Usage: pipeline run --scenario <name> [--case TC-nnn] [--tcm http|fake] [--memory] | scenarios | show <runId>',
  );
  process.exitCode = 2;
}
