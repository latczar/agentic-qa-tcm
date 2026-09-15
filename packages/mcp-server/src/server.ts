import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FrameworkManifest, PageObjectInfo } from '@aiqa/framework-manifest';
import { didYouMean, searchSymbols, symbolsOf } from './search.js';

export interface ServerOptions {
  manifest: FrameworkManifest;
  /** Absolute path to the framework package, used to read example sources and the conventions file. */
  frameworkRoot: string;
}

const MAX_SOURCE_BYTES = 40_000;

/**
 * Framework context as MCP tools. Every tool is read-only, returns compact JSON or text, and
 * names the nearest valid alternative when asked for something that does not exist.
 * Nothing here writes files, runs tests or talks to the TCM. Those are the orchestrator's job.
 */
export function createServer({ manifest, frameworkRoot }: ServerOptions): McpServer {
  const server = new McpServer({ name: 'framework-context', version: '0.1.0' });
  const symbols = symbolsOf(manifest);
  const byName = new Map(manifest.pageObjects.map((p) => [p.name.toLowerCase(), p]));

  server.registerTool(
    'list_page_objects',
    {
      title: 'List page objects',
      description:
        'Every page object in the framework with the app.<field> it is reached through, a one-line description, and how many methods and locators it has. Call get_page_object for details.',
      inputSchema: {},
    },
    async () =>
      json(
        manifest.pageObjects
          .filter((p) => p.appField)
          .map((p) => ({
            name: p.name,
            via: `app.${p.appField}`,
            description: p.description,
            methods: p.methods.length,
            locators: p.locators.length,
          })),
      ),
  );

  server.registerTool(
    'get_page_object',
    {
      title: 'Get a page object',
      description:
        'Methods (with parameter types and what they do), locators (with the data-testid they target) and inherited members of one page object. Set includeSource to also get the TypeScript file.',
      inputSchema: {
        name: z.string().describe('Class name, for example LeavePage. Case-insensitive.'),
        includeSource: z
          .boolean()
          .optional()
          .describe('Also return the source file. Default false.'),
      },
    },
    async ({ name, includeSource }) => {
      const found = byName.get(name.trim().toLowerCase());
      if (!found) {
        return failure(
          `No page object named "${name}".`,
          didYouMean(
            symbols.filter((s) => s.kind === 'pageObject'),
            name,
          ),
        );
      }
      const payload: Record<string, unknown> = summarise(found);
      if (includeSource) payload.source = await readFrameworkFile(frameworkRoot, found.file);
      return json(payload);
    },
  );

  server.registerTool(
    'list_fixtures',
    {
      title: 'List fixtures',
      description:
        'The fixtures a test can destructure from its callback, plus the seed users, seeded record ids and date helpers exported from the test module.',
      inputSchema: {},
    },
    async () =>
      json({
        importFrom: manifest.testModule,
        fixtures: manifest.fixtures,
        users: manifest.users.map((u) => ({
          use: `users.${u.key}`,
          who: `${u.firstName} ${u.lastName} (${u.role}, ${u.id})`,
          description: u.description,
        })),
        seeded: manifest.seeded.map((s) => ({
          use: `seeded.${s.key}`,
          value: s.value,
          description: s.description,
        })),
        helpers: manifest.helpers.map((h) => ({
          signature: `${h.name}(${h.params.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${h.returns}`,
          description: h.description,
        })),
      }),
  );

  server.registerTool(
    'get_conventions',
    {
      title: 'Get the framework conventions',
      description: 'The rulebook every spec must follow. Lint enforces the ticked rules.',
      inputSchema: {},
    },
    async () => text(await readFrameworkFile(frameworkRoot, manifest.conventionsFile)),
  );

  server.registerTool(
    'find_examples',
    {
      title: 'Find example tests',
      description:
        'Existing spec files with their test titles and tags, filtered by feature (auth, leave, expenses, approvals, employees) or by a keyword in a title. Call get_example to read one.',
      inputSchema: {
        feature: z.string().optional().describe('Feature folder name.'),
        query: z.string().optional().describe('Keyword to match against test titles.'),
        limit: z.number().int().min(1).max(20).optional().describe('Default 5.'),
      },
    },
    async ({ feature, query, limit }) => {
      const q = query?.trim().toLowerCase();
      const results = manifest.examples
        .filter((e) => !feature || e.feature === feature.trim().toLowerCase())
        .map((e) => ({
          ...e,
          tests: q ? e.tests.filter((t) => t.title.toLowerCase().includes(q)) : e.tests,
        }))
        .filter((e) => e.tests.length > 0)
        .slice(0, limit ?? 5);
      if (results.length === 0) {
        return failure(
          `No examples match feature=${feature ?? 'any'} query=${query ?? 'none'}.`,
          [...new Set(manifest.examples.map((e) => e.feature))].map((f) => `feature: ${f}`),
        );
      }
      return json(results);
    },
  );

  server.registerTool(
    'get_example',
    {
      title: 'Get an example test',
      description: 'The full source of one existing spec file, as returned by find_examples.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Path relative to the framework root, for example tests/e2e/leave/request-leave.spec.ts',
          ),
      },
    },
    async ({ path: relPath }) => {
      const known = manifest.examples.find((e) => e.path === relPath.trim().replaceAll('\\', '/'));
      if (!known) {
        return failure(
          `"${relPath}" is not an example spec.`,
          manifest.examples.map((e) => e.path).slice(0, 5),
        );
      }
      return text(await readFrameworkFile(frameworkRoot, known.path));
    },
  );

  server.registerTool(
    'search_symbols',
    {
      title: 'Search methods, locators, fixtures and helpers',
      description:
        'Fuzzy search across every name a spec may reference. Use it before inventing a method: if it is not here, it does not exist.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('Name or keyword, for example "cancel" or "submitLeave".'),
        limit: z.number().int().min(1).max(25).optional().describe('Default 10.'),
      },
    },
    async ({ query, limit }) => {
      const matches = searchSymbols(symbols, query, limit ?? 10);
      if (matches.length === 0) return failure(`Nothing matches "${query}".`, []);
      return json(
        matches.map((m) => ({
          symbol: m.symbol.id,
          kind: m.symbol.kind,
          signature: m.symbol.signature,
          description: m.symbol.description,
        })),
      );
    },
  );

  return server;
}

function summarise(p: PageObjectInfo) {
  return {
    name: p.name,
    via: p.appField ? `app.${p.appField}` : null,
    file: p.file,
    description: p.description,
    extends: p.extends,
    methods: p.methods.map((m) => ({
      signature: `${m.name}(${m.params.map((x) => `${x.name}${x.optional ? '?' : ''}: ${x.type}`).join(', ')}): ${m.returns}`,
      kind: m.kind,
      description: m.description,
      ...(m.inheritedFrom ? { inheritedFrom: m.inheritedFrom } : {}),
    })),
    locators: p.locators.map((l) => ({
      name: l.name,
      testId: l.testId,
      ...(l.testId ? {} : { expression: l.expression }),
      ...(l.inheritedFrom ? { inheritedFrom: l.inheritedFrom } : {}),
    })),
  };
}

async function readFrameworkFile(frameworkRoot: string, relPath: string): Promise<string> {
  const resolved = path.resolve(frameworkRoot, relPath);
  if (!resolved.startsWith(path.resolve(frameworkRoot))) {
    throw new Error(`Refusing to read outside the framework: ${relPath}`);
  }
  const content = await readFile(resolved, 'utf8');
  return content.length > MAX_SOURCE_BYTES
    ? `${content.slice(0, MAX_SOURCE_BYTES)}\n// ... truncated at ${MAX_SOURCE_BYTES} bytes`
    : content;
}

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 1) }] };
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] };
}

function failure(message: string, suggestions: string[]) {
  const hint = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '';
  return { isError: true, content: [{ type: 'text' as const, text: `${message}${hint}` }] };
}
