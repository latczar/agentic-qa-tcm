import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_FRAMEWORK_LABEL,
  DEFAULT_FRAMEWORK_ROOT,
  extractManifest,
} from '@aiqa/framework-manifest';
import { createServer } from './server.js';

// Drives the server through the real MCP protocol over an in-memory transport: no process,
// no stdio, but the same requests and responses a model-facing client would send.

let client: Client;

beforeAll(async () => {
  const manifest = extractManifest({
    frameworkRoot: DEFAULT_FRAMEWORK_ROOT,
    frameworkLabel: DEFAULT_FRAMEWORK_LABEL,
  });
  const server = createServer({ manifest, frameworkRoot: DEFAULT_FRAMEWORK_ROOT });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const first = (result.content as Array<{ type: string; text: string }>)[0];
  return { isError: result.isError === true, text: first?.text ?? '' };
}

const parse = (text: string) => JSON.parse(text) as unknown;

describe('framework-context MCP server', () => {
  it('lists exactly the seven read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'find_examples',
      'get_conventions',
      'get_example',
      'get_page_object',
      'list_fixtures',
      'list_page_objects',
      'search_symbols',
    ]);
  });

  it('list_page_objects names each one with its app field', async () => {
    const list = parse((await call('list_page_objects')).text) as Array<{
      name: string;
      via: string;
    }>;
    expect(list.find((p) => p.name === 'LeavePage')?.via).toBe('app.leave');
    expect(list.some((p) => p.name === 'BasePage')).toBe(false);
  });

  it('get_page_object returns signatures, locators with test ids and inherited members', async () => {
    const page = parse((await call('get_page_object', { name: 'leavepage' })).text) as {
      via: string;
      methods: Array<{ signature: string; kind: string; inheritedFrom?: string }>;
      locators: Array<{ name: string; testId: string | null }>;
    };
    expect(page.via).toBe('app.leave');
    expect(page.methods.map((m) => m.signature)).toContain(
      'cancel(requestId: string): Promise<void>',
    );
    expect(page.methods.find((m) => m.signature.startsWith('expectSuccess'))?.inheritedFrom).toBe(
      'BasePage',
    );
    expect(page.locators.find((l) => l.name === 'requestButton')?.testId).toBe('leave-request');
  });

  it('get_page_object can include the source', async () => {
    const page = parse(
      (await call('get_page_object', { name: 'LoginPage', includeSource: true })).text,
    ) as {
      source: string;
    };
    expect(page.source).toContain('export class LoginPage');
  });

  it('get_page_object suggests the nearest name for a typo', async () => {
    const result = await call('get_page_object', { name: 'LeavPage' });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/No page object named "LeavPage"/);
    expect(result.text).toMatch(/Did you mean: .*LeavePage/);
  });

  it('list_fixtures explains where to import from and who the seed users are', async () => {
    const fixtures = parse((await call('list_fixtures')).text) as {
      importFrom: string;
      fixtures: Array<{ name: string }>;
      users: Array<{ use: string; who: string }>;
    };
    expect(fixtures.importFrom).toBe('src/fixtures/test.ts');
    expect(fixtures.fixtures.map((f) => f.name)).toContain('signInAs');
    expect(fixtures.users.find((u) => u.use === 'users.employee')?.who).toMatch(/Dev Patel/);
  });

  it('get_conventions returns the rulebook', async () => {
    const result = await call('get_conventions');
    expect(result.text).toMatch(/^# Framework conventions/);
  });

  it('find_examples filters by feature and keyword, get_example reads the file', async () => {
    const examples = parse(
      (await call('find_examples', { feature: 'leave', query: 'cancel' })).text,
    ) as Array<{
      path: string;
      tests: Array<{ title: string; tags: string[] }>;
    }>;
    expect(examples).toHaveLength(1);
    expect(examples[0]?.tests[0]?.tags).toEqual(['@TC-013']);

    const source = await call('get_example', { path: examples[0]!.path });
    expect(source.text).toContain("test.describe('Leave requests'");
  });

  it('get_example refuses paths that are not example specs', async () => {
    const result = await call('get_example', { path: '../../package.json' });
    expect(result.isError).toBe(true);
  });

  it('search_symbols finds by exact, prefix, substring and near spelling', async () => {
    const exact = parse((await call('search_symbols', { query: 'cancel' })).text) as Array<{
      symbol: string;
    }>;
    expect(exact[0]?.symbol).toBe('LeavePage.cancel');

    const typo = parse((await call('search_symbols', { query: 'submitRequst' })).text) as Array<{
      symbol: string;
    }>;
    expect(typo.map((m) => m.symbol)).toContain('LeaveFormPage.submitRequest');

    const invented = await call('search_symbols', { query: 'submitLeave' });
    // The model may invent submitLeave; the answer must point at the real method.
    expect(parse(invented.text)).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 'LeaveFormPage.submitRequest' })]),
    );
  });

  it('reports invalid arguments as a tool error rather than crashing', async () => {
    const result = await call('get_page_object', {});
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/name/i);
  });
});
