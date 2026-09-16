import type { FrameworkClient } from '../context/framework-client.js';
import type {
  ChatMessage,
  CompletionResponse,
  LlmProvider,
  ToolDefinition,
} from '../llm/provider.js';

export type ContextMode = 'curated' | 'agentic';

export interface AgentLogEntry {
  tool: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  resultChars: number;
  durationMs: number;
}

export interface GenerationResult {
  response: CompletionResponse;
  /** Tool calls made during this attempt, in order. Empty in curated mode. */
  agentLog: AgentLogEntry[];
  /** Total tokens across all calls in this attempt, where the provider reports them. */
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface AgentOptions {
  mode: ContextMode;
  /** Upper bound on tool calls per attempt. The model is told to answer when it is reached. */
  maxToolCalls: number;
  jsonSchema: Record<string, unknown> | undefined;
}

/**
 * One attempt's conversation with the model.
 *
 * Curated: a single call with the curated context and constrained JSON output.
 * Agentic: the same context plus the framework-context MCP tools. While the model asks for tools,
 * run them and feed the results back; when it answers, that is the attempt. Tool calls are capped,
 * logged, and read-only by construction because the MCP server has no other kind.
 */
export async function generate(
  provider: LlmProvider,
  framework: FrameworkClient,
  conversation: ChatMessage[],
  options: AgentOptions,
  tag: { scenario?: string; attempt: number },
): Promise<GenerationResult> {
  const agentLog: AgentLogEntry[] = [];
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  const add = (r: CompletionResponse) => {
    if (r.promptTokens !== null) promptTokens = (promptTokens ?? 0) + r.promptTokens;
    if (r.completionTokens !== null)
      completionTokens = (completionTokens ?? 0) + r.completionTokens;
  };

  const agentic = options.mode === 'agentic' && provider.supportsTools;
  const tools: ToolDefinition[] = agentic ? await framework.listTools() : [];

  let response = await provider.complete({
    messages: conversation,
    jsonSchema: options.jsonSchema,
    tools: agentic ? tools : undefined,
    tag,
  });
  add(response);

  while (agentic && response.toolCalls?.length) {
    conversation.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
    for (const call of response.toolCalls) {
      const started = Date.now();
      let content: string;
      let ok = true;
      try {
        content = await framework.callText(call.name, call.arguments);
      } catch (error) {
        ok = false;
        content = `Tool error: ${(error as Error).message}`;
      }
      agentLog.push({
        tool: call.name,
        arguments: call.arguments,
        ok,
        resultChars: content.length,
        durationMs: Date.now() - started,
      });
      conversation.push({ role: 'tool', content, toolName: call.name });
    }
    const exhausted = agentLog.length >= options.maxToolCalls;
    if (exhausted) {
      conversation.push({
        role: 'user',
        content: `You have used all ${options.maxToolCalls} tool calls for this attempt. Answer now with the JSON object.`,
      });
    }
    // Once the model stops calling tools we want constrained JSON, so drop the tools on the final turn.
    response = await provider.complete({
      messages: conversation,
      jsonSchema: options.jsonSchema,
      tools: exhausted ? undefined : tools,
      tag,
    });
    add(response);
  }

  return { response, agentLog, promptTokens, completionTokens };
}
