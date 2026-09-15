import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  DEFAULT_FRAMEWORK_ROOT,
  DEFAULT_MANIFEST_PATH,
  loadManifest,
} from '@aiqa/framework-manifest';
import { createServer } from './server.js';

/**
 * Entry point for stdio clients: the orchestrator, Claude Code, the MCP Inspector.
 *   node --import tsx packages/mcp-server/src/stdio.ts [--manifest <file>] [--framework-root <dir>]
 * Never write to stdout here; stdout is the protocol channel. Diagnostics go to stderr.
 */
const args = process.argv.slice(2);
const option = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const manifest = await loadManifest(option('--manifest') ?? DEFAULT_MANIFEST_PATH);
const server = createServer({
  manifest,
  frameworkRoot: option('--framework-root') ?? DEFAULT_FRAMEWORK_ROOT,
});
await server.connect(new StdioServerTransport());
console.error(
  `framework-context MCP server ready: ${manifest.pageObjects.length} page objects, ${manifest.examples.length} example files`,
);
