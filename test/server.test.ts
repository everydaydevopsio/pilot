import { createServer } from '../src/server.js';
import type { BrowserManager } from '../src/browser.js';
import type { Client } from 'chrome-remote-interface';
import { loadConfig } from '../src/util/config.js';
import { createLogger } from '../src/util/logger.js';

function makeMockBrowser(connected = false): BrowserManager {
  return {
    getClient: jest.fn().mockReturnValue(connected ? ({} as Client) : null),
    isConnected: jest.fn().mockReturnValue(connected),
    setEventCallback: jest.fn()
  } as unknown as BrowserManager;
}

describe('HTTP endpoints', () => {
  beforeAll(() => {
    createLogger('error');
  });

  it('GET /health returns ok', async () => {
    const config = loadConfig({ port: 0 });
    const browser = makeMockBrowser(false);
    const app = await createServer(config, browser);

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.chromeConnected).toBe(false);
    expect(body.agentConnected).toBe(false);
    expect(typeof body.uptimeSec).toBe('number');
    await app.close();
  });

  it('GET /health reflects chrome connected state', async () => {
    const config = loadConfig({ port: 0 });
    const browser = makeMockBrowser(true);
    const app = await createServer(config, browser);

    const res = await app.inject({ method: 'GET', url: '/health' });
    const body = res.json();
    expect(body.chromeConnected).toBe(true);
    await app.close();
  });

  it('GET /screenshot returns 503 when browser disconnected', async () => {
    const config = loadConfig({ port: 0 });
    const browser = makeMockBrowser(false);
    const app = await createServer(config, browser);

    const res = await app.inject({ method: 'GET', url: '/screenshot' });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
