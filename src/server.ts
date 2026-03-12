import Fastify from 'fastify';
import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { getLogger } from './util/logger.js';
import type { Config } from './util/config.js';
import type { BrowserManager } from './browser.js';
import { Session } from './session.js';

const VERSION = '0.1.0';

export async function createServer(
  config: Config,
  browser: BrowserManager
): Promise<FastifyInstance> {
  const logger = getLogger();

  const app = Fastify({
    logger: false // we use pino directly
  });

  await app.register(websocketPlugin);

  const startTime = Date.now();
  let activeSession: Session | null = null;

  // Health endpoint
  app.get('/health', () => {
    return {
      ok: true,
      version: VERSION,
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
      chromeConnected: browser.isConnected(),
      agentConnected: activeSession !== null
    };
  });

  // Convenience screenshot endpoint
  app.get('/screenshot', async (request, reply) => {
    const client = browser.getClient();
    if (!client) {
      return reply
        .status(503)
        .send({ ok: false, error: 'browser_disconnected' });
    }

    const { executeScreenshot } = await import('./commands/screenshot.js');
    const { dataUrl } = await executeScreenshot(client, {
      format: 'png',
      quality: 80,
      fullPage: false
    });

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buf = Buffer.from(base64, 'base64');

    return reply
      .header('Content-Type', 'image/png')
      .header('Content-Length', buf.length)
      .send(buf);
  });

  // WebSocket endpoint
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      if (activeSession !== null) {
        logger.warn('Rejecting second WebSocket connection');
        socket.close(4409, 'session_conflict');
        return;
      }

      logger.info('Agent WebSocket connected');
      activeSession = new Session(socket, browser);

      socket.on('close', () => {
        activeSession = null;
        logger.info('Agent session ended');
      });
    });
  });

  return app;
}

export async function startServer(
  config: Config,
  browser: BrowserManager
): Promise<FastifyInstance> {
  const logger = getLogger();
  const app = await createServer(config, browser);

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'Server listening');

  return app;
}
