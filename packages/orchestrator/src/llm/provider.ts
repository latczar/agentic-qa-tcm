export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** Hint for providers that support constrained output. */
  jsonSchema?: Record<string, unknown>;
  /** Free-form tag for replay providers: which scenario and attempt this is. */
  tag?: { scenario?: string; attempt: number };
}

export interface CompletionResponse {
  text: string;
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
 * The only thing the pipeline knows about a language model. Ollama implements it in phase 6.
 * Replay serves canned responses for tests and CI. Failing simulates an outage.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  /** Throws ProviderUnavailableError when the model cannot be reached. Called before every attempt. */
  health(): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
