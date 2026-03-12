import { BrowserManager } from '../src/browser.js';
import { loadConfig } from '../src/util/config.js';
import { createLogger } from '../src/util/logger.js';
import CDP from 'chrome-remote-interface';

jest.mock('chrome-remote-interface');

const MockCDP = CDP as jest.MockedFunction<typeof CDP> & {
  List: jest.MockedFunction<typeof CDP.List>;
};

describe('BrowserManager', () => {
  beforeAll(() => {
    createLogger('error');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules reconnect when Chrome not reachable', async () => {
    MockCDP.List = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    process.env.AAB_CDP_RETRY_MS = '5000';
    const config = loadConfig();
    const manager = new BrowserManager(config);

    await manager.connect();

    expect(manager.isConnected()).toBe(false);
    await manager.destroy();
  });

  it('isConnected returns false initially', () => {
    const config = loadConfig();
    const manager = new BrowserManager(config);
    expect(manager.isConnected()).toBe(false);
    void manager.destroy();
  });

  it('getClient returns null when not connected', () => {
    const config = loadConfig();
    const manager = new BrowserManager(config);
    expect(manager.getClient()).toBeNull();
    void manager.destroy();
  });

  it('emits browser_disconnected event on Chrome disconnect', async () => {
    const eventEmitter = {
      on: jest.fn(),
      Runtime: {
        consoleAPICalled: jest.fn(),
        enable: jest.fn().mockResolvedValue(undefined)
      },
      Console: {
        messageAdded: jest.fn(),
        enable: jest.fn().mockResolvedValue(undefined)
      },
      Page: {
        enable: jest.fn().mockResolvedValue(undefined),
        frameNavigated: jest.fn()
      },
      Network: {
        enable: jest.fn().mockResolvedValue(undefined),
        requestWillBeSent: jest.fn(),
        responseReceived: jest.fn(),
        loadingFailed: jest.fn(),
        loadingFinished: jest.fn()
      },
      close: jest.fn().mockResolvedValue(undefined)
    };

    MockCDP.List = jest
      .fn()
      .mockResolvedValue([
        { id: 'target-1', type: 'page', url: 'about:blank' }
      ]);
    (
      MockCDP as unknown as jest.MockedFunction<
        () => Promise<typeof eventEmitter>
      >
    ).mockResolvedValue(eventEmitter as never);

    process.env.AAB_CDP_RETRY_MS = '60000';
    const config = loadConfig();
    const manager = new BrowserManager(config);

    const events: string[] = [];
    manager.setEventCallback((event) => events.push(event));

    await manager.connect();
    expect(manager.isConnected()).toBe(true);

    // Simulate disconnect
    const disconnectHandler = (eventEmitter.on as jest.Mock).mock.calls.find(
      ([ev]: [string]) => ev === 'disconnect'
    )?.[1];
    disconnectHandler?.();

    expect(events).toContain('browser_disconnected');
    await manager.destroy();
  });

  it('waitForNetworkIdle resolves immediately when no pending requests', async () => {
    const config = loadConfig();
    const manager = new BrowserManager(config);
    await expect(manager.waitForNetworkIdle(1000)).resolves.toBeUndefined();
    await manager.destroy();
  });
});
