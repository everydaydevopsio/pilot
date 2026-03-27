import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WSClient } from './ws-client.js';
import { ConsoleBuffer, ConsoleMessage } from './console-buffer.js';
import { registerBrowserTools } from './tools/browser.js';
import { registerErrorTools } from './tools/errors.js';

export interface McpConfig {
  wsUrl: string;
  bufferSize: number;
}

export async function createMcpServer(config: McpConfig): Promise<McpServer> {
  const server = new McpServer({
    name: 'ai-agent-browser',
    version: '0.1.0'
  });

  const wsClient = new WSClient(config.wsUrl);
  const consoleBuffer = new ConsoleBuffer(config.bufferSize);

  // Subscribe to console_message events before connecting
  wsClient.onEvent((event, data) => {
    if (event === 'console_message') {
      consoleBuffer.push(data as ConsoleMessage);
    }
  });

  // Connect to ai-agent-browser WebSocket
  await wsClient.connect();

  // Register browser control tools
  registerBrowserTools(server, wsClient);

  // Register error monitoring tools
  registerErrorTools(server, consoleBuffer);

  return server;
}
