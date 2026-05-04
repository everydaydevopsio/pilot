#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { loadConfig } from '../util/config.js';
import { createLogger } from '../util/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
) as { version: string; description: string; name: string };

const args = process.argv.slice(2);

async function run(): Promise<void> {
  if (args.includes('--version') || args.includes('-v')) {
    console.log(pkg.version);
    return;
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`${pkg.name} v${pkg.version}`);
    console.log(pkg.description);
    console.log('');
    console.log('Usage: aab [command] [options]');
    console.log('');
    console.log('Commands:');
    console.log(
      '  init [--force]    Install the Claude Code debug-browser skill'
    );
    console.log('  (default)         Start the MCP server on stdio');
    console.log('');
    console.log('Options:');
    console.log('  --version, -v     Show version number');
    console.log('  --help, -h        Show this help message');
    console.log('');
    console.log('Environment variables:');
    console.log(
      '  AAB_CDP_PORT          Chrome DevTools Protocol port (default: 9222)'
    );
    console.log(
      '  AAB_CDP_HOST          Chrome DevTools Protocol host (default: 127.0.0.1)'
    );
    console.log(
      '  AAB_MCP_BUFFER_SIZE   Console event buffer size (default: 1000)'
    );
    console.log(
      '  AAB_LOG_LEVEL         Log level: trace|debug|info|warn|error|fatal (default: info)'
    );
    return;
  }

  const subcommand = args[0] && !args[0].startsWith('-') ? args[0] : null;

  const baseConfig = loadConfig();
  createLogger(baseConfig.logLevel);

  if (subcommand === 'init') {
    const { runInit } = await import('../cli/init.js');
    const force = args.includes('--force');
    await runInit({ force });
    return;
  }

  const config = {
    bufferSize: parseInt(process.env.AAB_MCP_BUFFER_SIZE ?? '1000', 10),
    cdpPort: process.env.AAB_CDP_PORT
      ? parseInt(process.env.AAB_CDP_PORT, 10)
      : undefined,
    cdpHost: process.env.AAB_CDP_HOST
  };

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

run().catch((err) => {
  console.error('[aab-mcp] Failed to start:', err);
  process.exit(1);
});
