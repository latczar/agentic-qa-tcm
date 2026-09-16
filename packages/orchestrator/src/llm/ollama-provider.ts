import {
  ProviderTimeoutError,
  ProviderUnavailableError,
  type ChatMessage,
  type CompletionRequest,
  type CompletionResponse,
  type LlmProvider,
  type ToolCall,
} from './provider.js';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  /** Wall-clock limit for one completion. CPU inference of a 7B model can take minutes. */
  timeoutMs: number;
  /** Context window requested from the model. */
  numCtx: number;
  /** How long Ollama keeps the model loaded between calls. */
  keepAlive?: string;
  fetchImpl?: typeof fetch;
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

/**
 * Ollama's /api/chat behind the provider interface. Temperature zero, constrained JSON output when a
 * schema is given, tool calling when tools are given. Network failures become "unavailable" and
 * slow answers become "timeout", so the pipeline can defer instead of failing the run.
 */
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  readonly model: string;
  readonly supportsTools = true;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OllamaOptions) {
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      throw new ProviderUnavailableError(
        `Ollama is not reachable at ${this.options.baseUrl} (${(error as Error).message}). Start it with "ollama serve".`,
      );
    }
    if (!response.ok)
      throw new ProviderUnavailableError(`Ollama answered HTTP ${response.status} on /api/tags.`);
    const body = (await response.json()) as { models?: Array<{ name: string }> };
    const names = (body.models ?? []).map((m) => m.name);
    const wanted = this.model.includes(':') ? this.model : `${this.model}:latest`;
    if (!names.includes(wanted)) {
      throw new ProviderUnavailableError(
        `Model ${this.model} is not pulled. Run "ollama pull ${this.model}". Available: ${names.join(', ') || 'none'}.`,
      );
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const started = Date.now();
    const payload: Record<string, unknown> = {
      model: this.model,
      messages: request.messages.map(toOllamaMessage),
      stream: false,
      keep_alive: this.options.keepAlive ?? '10m',
      options: { temperature: 0, num_ctx: this.options.numCtx, num_predict: 4096 },
    };
    // Constrained output and tool calling do not mix: with a schema the model must answer, not call.
    if (request.tools?.length) {
      payload.tools = request.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    } else if (request.jsonSchema) {
      payload.format = request.jsonSchema;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const e = error as Error;
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new ProviderTimeoutError(
          `Ollama did not answer within ${Math.round(this.options.timeoutMs / 1000)}s.`,
        );
      }
      throw new ProviderUnavailableError(`Ollama request failed: ${e.message}`);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ProviderUnavailableError(
        `Ollama answered HTTP ${response.status}: ${text.slice(0, 300)}`,
      );
    }
    const body = (await response.json()) as OllamaChatResponse;
    const toolCalls: ToolCall[] | undefined = body.message.tool_calls?.map((c) => ({
      name: c.function.name,
      arguments: c.function.arguments ?? {},
    }));
    return {
      text: body.message.content ?? '',
      ...(toolCalls?.length ? { toolCalls } : {}),
      model: body.model ?? this.model,
      promptTokens: body.prompt_eval_count ?? null,
      completionTokens: body.eval_count ?? null,
      durationMs: body.total_duration
        ? Math.round(body.total_duration / 1_000_000)
        : Date.now() - started,
    };
  }
}

function toOllamaMessage(m: ChatMessage): Record<string, unknown> {
  const out: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    out.tool_calls = m.toolCalls.map((c) => ({
      function: { name: c.name, arguments: c.arguments },
    }));
  }
  if (m.role === 'tool' && m.toolName) out.tool_name = m.toolName;
  return out;
}
