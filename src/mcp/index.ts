#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

const config = {
  bufferSize: parseInt(process.env.AAB_MCP_BUFFER_SIZE ?? '1000', 10),
  cdpPort: process.env.AAB_CDP_PORT
    ? parseInt(process.env.AAB_CDP_PORT, 10)
    : undefined,
  cdpHost: process.env.AAB_CDP_HOST
};

async function main(): Promise<void> {
  const { server, cleanup } = await createMcpServer(config);
  const transport = new StdioServerTransport();

  async function shutdown(): Promise<void> {
    await cleanup();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await server.connect(transport);
  console.error('[aab-mcp] MCP server running on stdio');
}

main().catch((err) => {
  console.error('[aab-mcp] Failed to start:', err);
  process.exit(1);
});
