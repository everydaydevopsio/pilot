#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from './util/config.js';
import { createLogger } from './util/logger.js';
import { BrowserManager } from './browser.js';
import { startServer } from './server.js';

// Get subcommand from first positional argument
const args = process.argv.slice(2);
const subcommand = args[0] && !args[0].startsWith('-') ? args[0] : null;

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`
ai-agent-browser - DevTools-grade browser control for AI agents

Usage:
  aab [command] [options]

Commands:
  init          Create debug-browser skill in current project
  (default)     Start the ai-agent-browser server

Server Options:
  --port            HTTP/WS listen port (default: 8765)
  --host            Bind address (default: 127.0.0.1)
  --no-launch       Connect to existing Chrome instead of launching one
  --cdp-port        Chrome DevTools Protocol port (default: 9222, only with --no-launch)
  --cdp-host        CDP host (default: 127.0.0.1, only with --no-launch)
  --headless        Run Chrome headless (default: true)
  --no-headless     Show the Chrome window
  --chrome-path     Path to Chrome executable (auto-detected if omitted)
  --log-level       Log level: trace|debug|info|warn|error (default: info)
  -h, --help        Show this help message

Init Options:
  --force       Overwrite existing skill file

Examples:
  aab                           Start server with defaults
  aab --port 9000               Start server on port 9000
  aab init                      Create Claude Code skill
  npx ai-agent-browser init     Create skill via npx
`);
}

async function runServer(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      'cdp-port': { type: 'string' },
      'cdp-host': { type: 'string' },
      'log-level': { type: 'string' },
      'no-launch': { type: 'boolean' },
      headless: { type: 'boolean' },
      'no-headless': { type: 'boolean' },
      'chrome-path': { type: 'string' },
      help: { type: 'boolean', short: 'h' }
    },
    strict: false
  });

  if (values.help) {
    printHelp();
    return;
  }

  const config = loadConfig({
    port: values.port ? parseInt(values.port as string, 10) : undefined,
    host: values.host as string | undefined,
    cdpPort: values['cdp-port']
      ? parseInt(values['cdp-port'] as string, 10)
      : undefined,
    cdpHost: values['cdp-host'] as string | undefined,
    logLevel: values['log-level'] as string | undefined,
    launchChrome: values['no-launch'] ? false : undefined,
    headless: values['no-headless']
      ? false
      : (values.headless as boolean | undefined),
    chromePath: values['chrome-path'] as string | undefined
  });

  const logger = createLogger(config.logLevel);
  logger.info({ config }, 'Starting ai-agent-browser');

  const browser = new BrowserManager(config);

  const server = await startServer(config, browser);

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down');
    await server.close();
    await browser.destroy();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down');
    await server.close();
    await browser.destroy();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  // Handle subcommands
  if (subcommand === 'init') {
    const { runInit } = await import('./cli/init.js');
    const force = args.includes('--force');
    await runInit({ force });
    return;
  }

  if (subcommand === 'help' || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Unknown subcommand
  if (subcommand && subcommand !== 'start') {
    // eslint-disable-next-line no-console
    console.error(`Unknown command: ${subcommand}`);
    // eslint-disable-next-line no-console
    console.error('Run "aab --help" for usage information.');
    process.exit(1);
  }

  // Default: start server
  await runServer();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err);
  process.exit(1);
});
