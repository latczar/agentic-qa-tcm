import { loadManifest } from '@aiqa/framework-manifest';
import { loadConfig, packageRoot, type OrchestratorConfig } from './config.js';
import { ContextBuilder } from './context/builder.js';
import { FrameworkClient } from './context/framework-client.js';
import { loadPrompts } from './context/prompts.js';
import { RealGates } from './gates/runner.js';
import { FailingProvider } from './llm/failing-provider.js';
import { OllamaProvider } from './llm/ollama-provider.js';
import type { LlmProvider } from './llm/provider.js';
import { ReplayProvider } from './llm/replay-provider.js';
import { FileArtefactStore } from './pipeline/artefacts.js';
import type { PipelineDeps } from './pipeline/run-pipeline.js';
import { InMemoryRunRepository, PgRunRepository, type RunRepository } from './repo/runs.js';
import type { TcmClient } from './tcm/client.js';
import { HttpTcmClient } from './tcm/http-client.js';

export interface WiringOptions {
  config?: OrchestratorConfig;
  provider?: LlmProvider;
  tcm?: TcmClient;
  runs?: RunRepository;
  scenario?: string;
  log?: (message: string) => void;
}

/** Builds real pipeline dependencies from configuration. Tests pass their own pieces in. */
export async function wire(
  options: WiringOptions = {},
): Promise<PipelineDeps & { close: () => Promise<void> }> {
  const config = options.config ?? loadConfig();
  const manifest = await loadManifest(config.manifestPath);
  const framework = await FrameworkClient.inProcess(manifest, config.frameworkRoot);
  const prompts = await loadPrompts(config.promptsDir, config.promptVersion);
  const provider = options.provider ?? (await providerFromConfig(config, options.scenario));
  const ownsRuns = !options.runs;
  const runs =
    options.runs ??
    (await PgRunRepository.connect(config.databaseUrl, new URL('../schema.sql', import.meta.url)));
  const tcm = options.tcm ?? new HttpTcmClient(config.tcmUrl);

  return {
    tcm,
    provider,
    runs,
    context: new ContextBuilder(framework, manifest, prompts, config.contextTokenBudget),
    framework,
    gates: new RealGates(manifest, config.frameworkRoot),
    artefacts: new FileArtefactStore(config.artifactsDir),
    prompts,
    frameworkRoot: config.frameworkRoot,
    maxAttempts: config.maxAttempts,
    maxDeferrals: config.maxDeferrals,
    mode: config.mode,
    maxToolCalls: config.maxToolCalls,
    scenario: options.scenario,
    log: options.log ?? ((m) => console.log(m)),
    close: async () => {
      await framework.close();
      if (ownsRuns && runs instanceof PgRunRepository) await runs.close();
    },
  };
}

export async function providerFromConfig(
  config: OrchestratorConfig,
  scenario?: string,
): Promise<LlmProvider> {
  switch (config.provider) {
    case 'replay':
      if (!scenario) {
        throw new Error(
          'The replay provider needs a scenario (--scenario <name> or LLM_SCENARIO).',
        );
      }
      return ReplayProvider.load(config.scenariosDir, scenario);
    case 'failing':
      return new FailingProvider('unavailable');
    case 'ollama':
      return new OllamaProvider({
        baseUrl: config.ollamaUrl,
        model: config.model,
        timeoutMs: config.llmTimeoutMs,
        numCtx: config.numCtx,
      });
  }
}

export { InMemoryRunRepository, packageRoot };
