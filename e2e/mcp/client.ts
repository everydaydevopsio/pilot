import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; data: string; mimeType: string };
export type ToolContent = TextContent | ImageContent;

export interface ToolResult {
  content: ToolContent[];
  isError?: boolean;
}

let clientCounter = 0;

export class McpTestClient {
  private client: Client;
  private transport: StdioClientTransport;
  private profileName: string;

  constructor() {
    this.profileName = `e2e-${process.pid}-${++clientCounter}`;
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [resolve('dist/mcp/index.js')],
      env: {
        ...process.env,
        AAB_MCP_BUFFER_SIZE: '500',
        AAB_PROFILE_NAME: this.profileName,
        NODE_ENV: 'test'
      }
    });

    this.client = new Client({ name: 'mcp-e2e-test', version: '1.0.0' });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async callTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<ToolResult> {
    const result = await this.client.callTool({
      name,
      arguments: args ?? {}
    });
    return result as ToolResult;
  }

  getText(result: ToolResult): string {
    const item = result.content.find(
      (c): c is TextContent => c.type === 'text'
    );
    return item?.text ?? '';
  }

  getImage(result: ToolResult): ImageContent | undefined {
    return result.content.find((c): c is ImageContent => c.type === 'image');
  }

  async listTools(): Promise<string[]> {
    const result = await this.client.listTools();
    return result.tools.map((t) => t.name);
  }

  async startBrowser(
    headless = process.env.AAB_HEADLESS === 'false' ? false : true
  ): Promise<void> {
    const args: Record<string, unknown> = { headless };
    // AAB_CHROME_PATH is injected by docker-compose.e2e.yml for the mcp profile
    if (process.env.AAB_CHROME_PATH) {
      args.chromePath = process.env.AAB_CHROME_PATH;
    }
    await this.callTool('browser_start', args);
  }

  async stopBrowser(): Promise<void> {
    try {
      await this.callTool('browser_stop');
    } catch {
      // ignore errors during cleanup
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
    } catch {
      // ignore errors during cleanup
    }
    this.cleanupProfile();
  }

  private cleanupProfile(): void {
    try {
      const xdgData =
        process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
      const profileDir = join(xdgData, 'aab', this.profileName);
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
