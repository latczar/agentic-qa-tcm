import { DEFAULT_FRAMEWORK_ROOT, loadManifest } from '@aiqa/framework-manifest';
import { beforeAll, describe, expect, it } from 'vitest';
import { FrameworkClient } from '../context/framework-client.js';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  LlmProvider,
} from '../llm/provider.js';
import { generate } from './agent.js';

// A scripted provider drives the agent loop against the REAL MCP server (in-process), so the tool
// definitions, the calls and the results are the genuine article; only the model is fake.

class ScriptedProvider implements LlmProvider {
  readonly name = 'scripted';
  readonly model = 'scripted';
  readonly supportsTools: boolean;
  readonly requests: CompletionRequest[] = [];
  constructor(
    private readonly script: Array<Partial<CompletionResponse>>,
    supportsTools = true,
  ) {
    this.supportsTools = supportsTools;
  }
  async health() {}
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.requests.push({ ...request, messages: [...request.messages] });
    const step = this.script[this.requests.length - 1] ?? { text: '{"final":true}' };
    return {
      text: '',
      model: 'scripted',
      promptTokens: 10,
      completionTokens: 5,
      durationMs: 1,
      ...step,
    };
  }
}

let framework: FrameworkClient;
const schema = { type: 'object' };
const fresh = (): ChatMessage[] => [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'write the test' },
];

beforeAll(async () => {
  framework = await FrameworkClient.inProcess(await loadManifest(), DEFAULT_FRAMEWORK_ROOT);
});

describe('generate', () => {
  it('curated mode makes exactly one call with the schema and no tools', async () => {
    const provider = new ScriptedProvider([{ text: '{"a":1}' }]);
    const result = await generate(
      provider,
      framework,
      fresh(),
      { mode: 'curated', maxToolCalls: 6, jsonSchema: schema },
      { attempt: 1 },
    );
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.tools).toBeUndefined();
    expect(provider.requests[0]?.jsonSchema).toEqual(schema);
    expect(result.response.text).toBe('{"a":1}');
    expect(result.agentLog).toEqual([]);
  });

  it('agentic mode offers the seven MCP tools, runs the calls the model makes and feeds results back', async () => {
    const provider = new ScriptedProvider([
      { text: '', toolCalls: [{ name: 'search_symbols', arguments: { query: 'submitLeave' } }] },
      { text: '', toolCalls: [{ name: 'get_page_object', arguments: { name: 'LeaveFormPage' } }] },
      { text: '{"done":true}' },
    ]);
    const conversation = fresh();
    const result = await generate(
      provider,
      framework,
      conversation,
      { mode: 'agentic', maxToolCalls: 6, jsonSchema: schema },
      { attempt: 1 },
    );

    expect(provider.requests[0]?.tools?.map((t) => t.name).sort()).toEqual([
      'find_examples',
      'get_conventions',
      'get_example',
      'get_page_object',
      'list_fixtures',
      'list_page_objects',
      'search_symbols',
    ]);
    expect(result.agentLog.map((e) => [e.tool, e.ok])).toEqual([
      ['search_symbols', true],
      ['get_page_object', true],
    ]);
    const toolMessages = conversation.filter((m) => m.role === 'tool');
    expect(toolMessages[0]?.content).toContain('LeaveFormPage.submitRequest');
    expect(toolMessages[1]?.content).toContain('submitRequest(details: LeaveRequestDetails)');
    expect(result.response.text).toBe('{"done":true}');
    expect(result.promptTokens).toBe(30);
  });

  it('records a failed tool call as an error result and carries on', async () => {
    const provider = new ScriptedProvider([
      { text: '', toolCalls: [{ name: 'get_page_object', arguments: { name: 'NoSuchPage' } }] },
      { text: '{"done":true}' },
    ]);
    const conversation = fresh();
    const result = await generate(
      provider,
      framework,
      conversation,
      { mode: 'agentic', maxToolCalls: 6, jsonSchema: schema },
      { attempt: 1 },
    );
    expect(result.agentLog[0]?.ok).toBe(false);
    expect(conversation.find((m) => m.role === 'tool')?.content).toMatch(
      /No page object named "NoSuchPage"/,
    );
  });

  it('caps tool calls and tells the model to answer', async () => {
    const provider = new ScriptedProvider([
      {
        text: '',
        toolCalls: [
          { name: 'list_page_objects', arguments: {} },
          { name: 'list_fixtures', arguments: {} },
        ],
      },
      { text: '{"done":true}' },
    ]);
    const conversation = fresh();
    const result = await generate(
      provider,
      framework,
      conversation,
      { mode: 'agentic', maxToolCalls: 2, jsonSchema: schema },
      { attempt: 1 },
    );
    expect(result.agentLog).toHaveLength(2);
    expect(conversation.at(-1)?.content).toMatch(/used all 2 tool calls/);
    expect(provider.requests[1]?.tools).toBeUndefined();
  });

  it('falls back to curated when the provider cannot call tools', async () => {
    const provider = new ScriptedProvider([{ text: '{"a":1}' }], false);
    const result = await generate(
      provider,
      framework,
      fresh(),
      { mode: 'agentic', maxToolCalls: 6, jsonSchema: schema },
      { attempt: 1 },
    );
    expect(provider.requests[0]?.tools).toBeUndefined();
    expect(result.agentLog).toEqual([]);
  });
});
