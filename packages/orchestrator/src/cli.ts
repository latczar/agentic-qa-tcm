import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { repoRoot } from '@aiqa/framework-manifest';
import { loadConfig, type ContextMode, type ProviderName } from './config.js';
import type { GenerationAttempt, GenerationRun } from './domain/types.js';
import { ReplayProvider } from './llm/replay-provider.js';
import { executeRun, startRun, type PipelineDeps } from './pipeline/run-pipeline.js';
import { applyReview } from './pipeline/review.js';
import { FakeTcmClient } from './tcm/fake-client.js';
import { InMemoryRunRepository, wire } from './wiring.js';

/**
 * npm run pipeline -- run --scenario happy [--case TC-014] [--tcm http|fake] [--memory]
 * npm run pipeline -- run --provider ollama --case TC-014 [--model qwen2.5-coder:7b] [--mode curated|agentic]
 * npm run pipeline -- bench --cases TC-005,TC-014,TC-034,TC-045 --provider ollama [--mode agentic] [--out docs/results.md]
 * npm run pipeline -- scenarios
 * npm run pipeline -- show <runId>
 * npm run pipeline -- review <runId> approve|reject --by <name> [--comment <text>]
 */
const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const has = (name: string) => rest.includes(`--${name}`);

const config = {
  ...loadConfig(),
  ...(flag('provider') ? { provider: flag('provider') as ProviderName } : {}),
  ...(flag('model') ? { model: flag('model')! } : {}),
  ...(flag('mode') ? { mode: flag('mode') as ContextMode } : {}),
};
const seedDir = path.join(repoRoot, 'apps', 'mock-tcm', 'seed', 'test-cases');

async function buildDeps(scenario?: string) {
  const tcmMode = flag('tcm') ?? (command === 'bench' ? 'fake' : 'http');
  const tcm = tcmMode === 'fake' ? await FakeTcmClient.fromSeedDir(seedDir) : undefined;
  const runs = has('memory') || command === 'bench' ? new InMemoryRunRepository() : undefined;
  const deps = await wire({ config, scenario, tcm, runs });
  return { deps, fakeTcm: tcm };
}

function describeAttempt(a: GenerationAttempt): string {
  const failed = a.gateReport?.results.find((r) => !r.passed);
  const outcome = a.gateReport?.passed
    ? 'passed all gates'
    : `failed ${failed?.gate ?? '?'} ${a.failureClass ?? ''}`;
  const accuracy =
    a.selfReport?.accuracy != null
      ? `, self-report ${Math.round(a.selfReport.accuracy * 100)}%`
      : '';
  const tools = a.agentLog.length ? `, ${a.agentLog.length} tool call(s)` : '';
  const tokens =
    a.promptTokens != null ? `, ${a.promptTokens}+${a.completionTokens ?? 0} tokens` : '';
  return `attempt ${a.attemptNo} (${a.kind}, ${a.mode}): ${outcome}${accuracy}${tools}${tokens}, ${(a.durationMs / 1000).toFixed(1)}s`;
}

async function runOne(deps: PipelineDeps, caseId: string, version?: number) {
  const { created, run } = await startRun(deps, caseId, version);
  console.log(
    `${created ? 'Created' : 'Existing'} run ${run.id} for ${run.testCaseId} v${run.testCaseVersion} (${run.status})`,
  );
  const finished = await executeRun(deps, run.id);
  const attempts = await deps.runs.attempts(run.id);
  return { finished, attempts };
}

if (command === 'scenarios') {
  for (const name of await ReplayProvider.listScenarios(config.scenariosDir)) {
    const provider = await ReplayProvider.load(config.scenariosDir, name).catch(() => null);
    const e = provider?.expectations;
    console.log(
      `${name.padEnd(24)} ${provider ? `${provider.testCaseId}  expects ${e?.finalStatus} after ${e?.attempts} attempt(s)` : '(failing provider)'}`,
    );
  }
} else if (command === 'run') {
  const scenario =
    flag('scenario') ?? (config.provider === 'replay' ? process.env.LLM_SCENARIO : undefined);
  const { deps } = await buildDeps(scenario);
  try {
    const caseId =
      flag('case') ??
      (deps.provider instanceof ReplayProvider ? deps.provider.testCaseId : undefined);
    if (!caseId) throw new Error('Pass --case TC-nnn (or a --scenario that names one).');
    const { finished, attempts } = await runOne(
      deps,
      caseId,
      flag('version') ? Number(flag('version')) : undefined,
    );
    console.log(`\nResult: ${finished.status}`);
    if (finished.summary) console.log(finished.summary);
    for (const a of attempts) console.log(`  ${describeAttempt(a)}`);
    console.log(`Artefacts: ${config.artifactsDir}/${finished.id}`);
    process.exitCode = finished.status === 'PENDING_REVIEW' ? 0 : 1;
  } finally {
    await deps.close();
  }
} else if (command === 'bench') {
  const cases = (flag('cases') ?? 'TC-005,TC-014,TC-034,TC-045').split(',').map((c) => c.trim());
  const { deps, fakeTcm } = await buildDeps();
  const rows: string[] = [];
  const startedAll = Date.now();
  try {
    console.log(
      `Bench: ${cases.length} case(s), provider ${deps.provider.name} (${deps.provider.model}), mode ${config.mode}\n`,
    );
    for (const caseId of cases) {
      fakeTcm?.setStatus(caseId, 'READY_FOR_AUTOMATION');
      const { finished, attempts } = await runOne(deps, caseId);
      for (const a of attempts) console.log(`  ${describeAttempt(a)}`);
      console.log(`  => ${finished.status}\n`);
      rows.push(benchRow(finished, attempts));
      // Leave the framework clean between cases; the artefacts keep every candidate.
      if (finished.candidatePath)
        await import('node:fs/promises').then((fs) =>
          fs.rm(path.join(config.frameworkRoot, finished.candidatePath!), { force: true }),
        );
    }
  } finally {
    await deps.close();
  }
  const table = [
    `| Case | Result | Attempts | Failed gates | Self-report | Tool calls | Tokens (in+out) | Time |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...rows,
  ].join('\n');
  const passed = rows.filter((r) => r.includes('| PENDING_REVIEW |')).length;
  const summary = `${passed} of ${cases.length} cases reached review. Provider ${deps.provider.name} (${deps.provider.model}), mode ${config.mode}, prompt ${config.promptVersion}, ${Math.round((Date.now() - startedAll) / 1000)}s total.`;
  console.log(`${table}\n\n${summary}`);
  const out = flag('out');
  if (out) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await writeFile(
      path.resolve(repoRoot, out),
      `# Generation results\n\nRecorded ${stamp} UTC on the development machine.\n\n${summary}\n\n${table}\n`,
      'utf8',
    );
    console.log(`Written to ${out}`);
  }
} else if (command === 'show') {
  const deps = await wire({
    config,
    provider: {
      name: 'none',
      model: 'none',
      supportsTools: false,
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
} else if (command === 'review') {
  const [runId, decisionArg] = rest;
  if ((decisionArg !== 'approve' && decisionArg !== 'reject') || !runId) {
    throw new Error('Usage: pipeline review <runId> approve|reject --by <name> [--comment <text>]');
  }
  const reviewer = flag('by');
  if (!reviewer) throw new Error('Pass --by <name>.');
  const deps = await wire({
    config,
    provider: {
      name: 'none',
      model: 'none',
      supportsTools: false,
      health: async () => {},
      complete: async () => {
        throw new Error('read-only');
      },
    },
  });
  try {
    const outcome = await applyReview(deps, runId, {
      decision: decisionArg,
      reviewer,
      comment: flag('comment') ?? null,
    });
    if (!outcome.ok) throw new Error(`Could not record decision: ${outcome.reason}`);
    console.log(`${outcome.run.id}: ${outcome.run.status} (reviewed by ${reviewer})`);
    if (outcome.run.candidatePath) console.log(`Candidate: ${outcome.run.candidatePath}`);
  } finally {
    await deps.close();
  }
} else {
  console.error(
    'Usage: pipeline run|bench|scenarios|show|review. See the comment at the top of src/cli.ts.',
  );
  process.exitCode = 2;
}

function benchRow(run: GenerationRun, attempts: GenerationAttempt[]): string {
  const failedGates = attempts
    .map((a) => a.gateReport?.results.find((r) => !r.passed)?.gate)
    .filter(Boolean)
    .join(', ');
  const last = attempts.at(-1);
  const selfReport =
    last?.selfReport?.accuracy != null ? `${Math.round(last.selfReport.accuracy * 100)}%` : 'n/a';
  const toolCalls = attempts.reduce((n, a) => n + a.agentLog.length, 0);
  const tokens = attempts.reduce(
    (n, a) => n + (a.promptTokens ?? 0) + (a.completionTokens ?? 0),
    0,
  );
  const seconds = Math.round(attempts.reduce((n, a) => n + a.durationMs, 0) / 1000);
  return `| ${run.testCaseId} | ${run.status} | ${run.attempts} | ${failedGates || 'none'} | ${selfReport} | ${toolCalls} | ${tokens || 'n/a'} | ${seconds}s |`;
}
