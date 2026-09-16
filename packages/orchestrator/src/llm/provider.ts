export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For assistant messages that requested tools, and for tool results (the tool's name). */
  toolCalls?: ToolCall[];
  toolName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** JSON Schema the reply must conform to. Providers that support constrained output use it. */
  jsonSchema?: Record<string, unknown>;
  /** Tools the model may call. Providers that do not support tools ignore this. */
  tools?: ToolDefinition[];
  /** Free-form tag for replay providers: which scenario and attempt this is. */
  tag?: { scenario?: string; attempt: number };
}

export interface CompletionResponse {
  text: string;
  /** Present when the model asked for tools instead of answering. */
  toolCalls?: ToolCall[];
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
}

export class ProviderUnavailableError extends Error {
  readonly kind = 'unavailable' as const;
}

export class ProviderTimeoutError extends Error {
  readonly kind = 'timeout' as const;
}

/**
 * The only thing the pipeline knows about a language model. Ollama is the real one.
 * Replay serves canned responses for tests and CI. Failing simulates an outage.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  /** True when complete() honours `tools` and may return toolCalls. */
  readonly supportsTools: boolean;
  /** Throws ProviderUnavailableError when the model cannot be reached. Called before every attempt. */
  health(): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
