import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OllamaProvider } from './ollama-provider.js';
import { ProviderTimeoutError, ProviderUnavailableError } from './provider.js';

// A fake Ollama: enough of /api/tags and /api/chat to prove the mapping, the health rules and the
// failure classes without a model. Behaviour is chosen per request through the model name.

let server: Server;
let baseUrl: string;
let lastBody: Record<string, unknown> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      if (req.url === '/api/tags') {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            models: [
              { name: 'qwen2.5-coder:7b' },
              { name: 'slow:latest' },
              { name: 'tools:latest' },
            ],
          }),
        );
        return;
      }
      lastBody = JSON.parse(raw) as Record<string, unknown>;
      const model = String(lastBody.model);
      if (model === 'slow') return; // never answers
      res.setHeader('content-type', 'application/json');
      if (model === 'tools') {
        res.end(
          JSON.stringify({
            model,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                { function: { name: 'get_page_object', arguments: { name: 'LeavePage' } } },
              ],
            },
            prompt_eval_count: 10,
            eval_count: 5,
            total_duration: 2_000_000,
          }),
        );
        return;
      }
      res.end(
        JSON.stringify({
          model,
          message: { role: 'assistant', content: '{"ok":true}' },
          prompt_eval_count: 100,
          eval_count: 20,
          total_duration: 1_500_000_000,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const provider = (model: string, timeoutMs = 2_000) =>
  new OllamaProvider({ baseUrl, model, timeoutMs, numCtx: 4096 });

describe('OllamaProvider', () => {
  it('health passes when the model is pulled and names the fix when it is not', async () => {
    await expect(provider('qwen2.5-coder:7b').health()).resolves.toBeUndefined();
    await expect(provider('missing:1b').health()).rejects.toThrow(/ollama pull missing:1b/);
  });

  it('health reports an unreachable server as unavailable', async () => {
    const dead = new OllamaProvider({
      baseUrl: 'http://127.0.0.1:9',
      model: 'x',
      timeoutMs: 1000,
      numCtx: 1024,
    });
    await expect(dead.health()).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it('sends temperature zero, the context size and the JSON schema as format, and maps the reply', async () => {
    const result = await provider('qwen2.5-coder:7b').complete({
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
      ],
      jsonSchema: { type: 'object' },
    });
    expect(lastBody.format).toEqual({ type: 'object' });
    expect(lastBody.options).toEqual({ temperature: 0, num_ctx: 4096, num_predict: 4096 });
    expect(lastBody.stream).toBe(false);
    expect(result).toMatchObject({
      text: '{"ok":true}',
      promptTokens: 100,
      completionTokens: 20,
      durationMs: 1500,
    });
    expect(result.toolCalls).toBeUndefined();
  });

  it('sends tools instead of format when tools are given, and maps tool calls back', async () => {
    const result = await provider('tools').complete({
      messages: [{ role: 'user', content: 'u' }],
      jsonSchema: { type: 'object' },
      tools: [
        {
          name: 'get_page_object',
          description: 'd',
          parameters: { type: 'object', properties: {} },
        },
      ],
    });
    expect(lastBody.format).toBeUndefined();
    expect((lastBody.tools as unknown[]).length).toBe(1);
    expect(result.toolCalls).toEqual([
      { name: 'get_page_object', arguments: { name: 'LeavePage' } },
    ]);
  });

  it('serialises tool results and assistant tool calls the way Ollama expects', async () => {
    await provider('qwen2.5-coder:7b').complete({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ name: 'search_symbols', arguments: { query: 'cancel' } }],
        },
        { role: 'tool', content: '[]', toolName: 'search_symbols' },
      ],
    });
    const messages = lastBody.messages as Array<Record<string, unknown>>;
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ function: { name: 'search_symbols' } }],
    });
    expect(messages[1]).toMatchObject({ role: 'tool', tool_name: 'search_symbols' });
  });

  it('turns a slow answer into a timeout, not a crash', async () => {
    await expect(
      provider('slow', 300).complete({ messages: [{ role: 'user', content: 'u' }] }),
    ).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});
