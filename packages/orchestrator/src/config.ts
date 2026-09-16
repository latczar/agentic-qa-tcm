import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FRAMEWORK_ROOT, DEFAULT_MANIFEST_PATH, repoRoot } from '@aiqa/framework-manifest';

export type ProviderName = 'replay' | 'failing' | 'ollama';
export type ContextMode = 'curated' | 'agentic';

export interface OrchestratorConfig {
  port: number;
  databaseUrl: string;
  tcmUrl: string;
  provider: ProviderName;
  model: string;
  ollamaUrl: string;
  /** Wall-clock limit for one model call. CPU inference of a 7B model can take minutes. */
  llmTimeoutMs: number;
  /** Context window requested from the model. */
  numCtx: number;
  /** curated: the orchestrator picks the context. agentic: the model may also call the MCP tools. */
  mode: ContextMode;
  maxToolCalls: number;
  maxAttempts: number;
  maxDeferrals: number;
  /** Input token budget for the prompt. Estimated at four characters per token. */
  contextTokenBudget: number;
  promptVersion: string;
  promptsDir: string;
  scenariosDir: string;
  artifactsDir: string;
  frameworkRoot: string;
  manifestPath: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const packageRoot = path.resolve(here, '..');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrchestratorConfig {
  return {
    port: Number(env.PORT ?? 5000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://aiqa:aiqa@localhost:5432/pipeline',
    tcmUrl: env.TCM_URL ?? 'http://localhost:4000',
    provider: (env.LLM_PROVIDER as ProviderName | undefined) ?? 'replay',
    model: env.LLM_MODEL ?? 'qwen2.5-coder:7b',
    ollamaUrl: env.OLLAMA_URL ?? 'http://localhost:11434',
    llmTimeoutMs: Number(env.LLM_TIMEOUT_MS ?? 600_000),
    numCtx: Number(env.NUM_CTX ?? 12_288),
    mode: (env.AGENT_MODE as ContextMode | undefined) ?? 'curated',
    maxToolCalls: Number(env.MAX_TOOL_CALLS ?? 6),
    maxAttempts: Number(env.MAX_ATTEMPTS ?? 3),
    maxDeferrals: Number(env.MAX_DEFERRALS ?? 3),
    contextTokenBudget: Number(env.CONTEXT_TOKEN_BUDGET ?? 6000),
    promptVersion: env.PROMPT_VERSION ?? 'v2',
    promptsDir: env.PROMPTS_DIR ?? path.join(repoRoot, 'prompts'),
    scenariosDir: env.SCENARIOS_DIR ?? path.join(repoRoot, 'scenarios'),
    artifactsDir: env.ARTIFACTS_DIR ?? path.join(repoRoot, 'artifacts', 'runs'),
    frameworkRoot: env.FRAMEWORK_ROOT ?? DEFAULT_FRAMEWORK_ROOT,
    manifestPath: env.MANIFEST_PATH ?? DEFAULT_MANIFEST_PATH,
  };
}
