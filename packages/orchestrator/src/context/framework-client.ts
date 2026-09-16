import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { FrameworkManifest } from '@aiqa/framework-manifest';
import { createServer } from '@aiqa/mcp-server';
import type { ToolDefinition } from '../llm/provider.js';

/**
 * The orchestrator's window onto the framework: an MCP client of the framework-context server.
 * The server runs in-process over an in-memory transport, which is the same protocol and the same
 * tools as the stdio server, without a child process. The context builder uses it to curate;
 * the agent loop hands its tool list to the model and executes the calls the model makes.
 */
export class FrameworkClient {
  private constructor(private readonly client: Client) {}

  static async inProcess(
    manifest: FrameworkManifest,
    frameworkRoot: string,
  ): Promise<FrameworkClient> {
    const server = createServer({ manifest, frameworkRoot });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'orchestrator', version: '0.1.0' });
    await client.connect(clientTransport);
    return new FrameworkClient(client);
  }

  /** The server's tools in the provider-neutral shape the agent loop hands to a model. */
  async listTools(): Promise<ToolDefinition[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    }));
  }

  async callText(tool: string, args: Record<string, unknown> = {}): Promise<string> {
    const result = await this.client.callTool({ name: tool, arguments: args });
    const first = (result.content as Array<{ type: string; text?: string }>)[0];
    const text = first?.text ?? '';
    if (result.isError) throw new Error(`${tool} failed: ${text}`);
    return text;
  }

  async callJson<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    return JSON.parse(await this.callText(tool, args)) as T;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
