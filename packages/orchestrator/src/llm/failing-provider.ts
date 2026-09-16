import {
  ProviderTimeoutError,
  ProviderUnavailableError,
  type CompletionRequest,
  type CompletionResponse,
  type LlmProvider,
} from './provider.js';

/** Simulates an outage or a hang, for the "model unavailable" scenario and for chaos tests. */
export class FailingProvider implements LlmProvider {
  readonly name = 'failing';
  readonly supportsTools = false;
  readonly model: string;

  constructor(private readonly mode: 'unavailable' | 'timeout' = 'unavailable') {
    this.model = `failing:${mode}`;
  }

  async health(): Promise<void> {
    if (this.mode === 'unavailable') {
      throw new ProviderUnavailableError('Model server is not reachable (simulated).');
    }
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    if (this.mode === 'timeout')
      throw new ProviderTimeoutError('Model did not answer in time (simulated).');
    throw new ProviderUnavailableError('Model server is not reachable (simulated).');
  }
}
