import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { repoRoot } from '@aiqa/framework-manifest';

/**
 * Smoke test over real stdio: launches the server exactly as .mcp.json does, lists the tools,
 * and calls two of them. Run with: npm run mcp:probe
 */
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import', 'tsx', 'packages/mcp-server/src/stdio.ts'],
  cwd: repoRoot,
  stderr: 'pipe',
});
const client = new Client({ name: 'probe', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools (${tools.length}): ${tools.map((t) => t.name).join(', ')}`);

const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as Array<{ text: string }>)[0]?.text ?? '';

console.log('\nsearch_symbols("submitLeave"):');
console.log(
  text(
    await client.callTool({
      name: 'search_symbols',
      arguments: { query: 'submitLeave', limit: 3 },
    }),
  ),
);

const page = JSON.parse(
  text(await client.callTool({ name: 'get_page_object', arguments: { name: 'ApprovalsPage' } })),
) as { via: string; methods: Array<{ signature: string }> };
console.log(
  `\nget_page_object("ApprovalsPage"): via ${page.via}, ${page.methods.length} methods, e.g. ${page.methods[0]?.signature}`,
);

await client.close();
