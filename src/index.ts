#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from './util/config.js';
import { createLogger } from './util/logger.js';
import { BrowserManager } from './browser.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      host: { type: 'string' },
      'cdp-port': { type: 'string' },
      'cdp-host': { type: 'string' },
      'log-level': { type: 'string' }
    },
    strict: false
  });

  const config = loadConfig({
    port: values.port ? parseInt(values.port as string, 10) : undefined,
    host: values.host as string | undefined,
    cdpPort: values['cdp-port']
      ? parseInt(values['cdp-port'] as string, 10)
      : undefined,
    cdpHost: values['cdp-host'] as string | undefined,
    logLevel: values['log-level'] as string | undefined
  });

  const logger = createLogger(config.logLevel);
  logger.info({ config }, 'Starting ai-agent-browser');

  const browser = new BrowserManager(config);
  await browser.connect();

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

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err);
  process.exit(1);
});
