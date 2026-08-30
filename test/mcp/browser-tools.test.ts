import { registerBrowserTools } from '../../src/mcp/tools/browser.js';

describe('registerBrowserTools', () => {
  it('accepts and forwards startupTimeoutMs for browser_start', async () => {
    const launch = jest
      .fn()
      .mockResolvedValue({ headless: true, viewport: 'desktop' });
    const manager = {
      isConnected: jest.fn().mockReturnValue(false),
      launch,
      destroy: jest.fn()
    };
    const server = {
      tool: jest.fn()
    };
    const context = {
      manager: null,
      consoleBuffer: null
    };

    registerBrowserTools(
      server as never,
      context as never,
      () => manager as never
    );

    const browserStart = server.tool.mock.calls.find(
      ([name]) => name === 'browser_start'
    );
    expect(browserStart).toBeDefined();

    const [, , shape, handler] = browserStart!;
    expect(shape.startupTimeoutMs.safeParse(15000).success).toBe(true);

    await handler({ headless: true, startupTimeoutMs: 15000 });

    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
        startupTimeoutMs: 15000
      })
    );
  });
});
