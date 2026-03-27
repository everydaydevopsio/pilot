#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

const config = {
  wsUrl: process.env.AAB_WS_URL ?? 'ws://127.0.0.1:8765/ws',
  bufferSize: parseInt(process.env.AAB_MCP_BUFFER_SIZE ?? '1000', 10)
};

async function main(): Promise<void> {
  // Note: For stdio transport, use console.error for logging (stdout is for JSON-RPC)
  console.error(`[aab-mcp] Connecting to ${config.wsUrl}...`);

  try {
    const server = await createMcpServer(config);
    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.error('[aab-mcp] MCP server running on stdio');
  } catch (err) {
    console.error('[aab-mcp] Failed to start:', err);
    process.exit(1);
  }
}

main();
