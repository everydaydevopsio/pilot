import { createMcpServer } from '../../src/mcp/server.js';
import type { McpConfig } from '../../src/mcp/server.js';

// Mock BrowserManager so tests never touch real Chrome
jest.mock('../../src/browser.js', () => {
  return {
    BrowserManager: jest.fn().mockImplementation(() => ({
      isConnected: jest.fn().mockReturnValue(false),
      getClient: jest.fn().mockReturnValue(null),
      launch: jest.fn().mockResolvedValue({ headless: true }),
      destroy: jest.fn().mockResolvedValue(undefined),
      setEventCallback: jest.fn()
    }))
  };
});

jest.mock('../../src/util/config.js', () => ({
  loadConfig: jest.fn().mockReturnValue({ host: '127.0.0.1', port: 9222 })
}));

const baseConfig: McpConfig = { bufferSize: 100 };

describe('createMcpServer', () => {
  it('returns a server and a cleanup function', async () => {
    const { server, cleanup } = await createMcpServer(baseConfig);
    expect(server).toBeDefined();
    expect(typeof cleanup).toBe('function');
    await cleanup();
  });

  it('cleanup is safe to call when browser was never started', async () => {
    const { cleanup } = await createMcpServer(baseConfig);
    await expect(cleanup()).resolves.toBeUndefined();
  });

  it('accepts cdpPort and cdpHost without throwing', async () => {
    await expect(
      createMcpServer({ bufferSize: 10, cdpPort: 9333, cdpHost: 'myhost' })
    ).resolves.toBeDefined();
  });
});
