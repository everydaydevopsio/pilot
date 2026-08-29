import { BrowserManager } from '../src/browser.js';
import { loadConfig } from '../src/util/config.js';
import { createLogger } from '../src/util/logger.js';
import CDP from 'chrome-remote-interface';

jest.mock('chrome-remote-interface');

const MockCDP = CDP as jest.MockedFunction<typeof CDP> & {
  List: jest.MockedFunction<typeof CDP.List>;
  New: jest.MockedFunction<typeof CDP.New>;
  Close: jest.MockedFunction<typeof CDP.Close>;
};

function makeMockClient() {
  return {
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    Runtime: {
      consoleAPICalled: jest.fn(),
      exceptionThrown: jest.fn(),
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
    Target: {
      activateTarget: jest.fn().mockResolvedValue(undefined)
    },
    Emulation: {
      setDeviceMetricsOverride: jest.fn().mockResolvedValue(undefined),
      setTouchEmulationEnabled: jest.fn().mockResolvedValue(undefined),
      setUserAgentOverride: jest.fn().mockResolvedValue(undefined)
    }
  };
}

describe('BrowserManager', () => {
  beforeAll(() => {
    createLogger('error');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('schedules reconnect when Chrome not reachable', async () => {
    MockCDP.List = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    process.env.PILOT_CDP_RETRY_MS = '5000';
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
        exceptionThrown: jest.fn(),
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
      Emulation: {
        setDeviceMetricsOverride: jest.fn().mockResolvedValue(undefined),
        setTouchEmulationEnabled: jest.fn().mockResolvedValue(undefined),
        setUserAgentOverride: jest.fn().mockResolvedValue(undefined)
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

    process.env.PILOT_CDP_RETRY_MS = '60000';
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

  describe('tab management', () => {
    it('listTabs returns page targets with active flag', async () => {
      MockCDP.List = jest.fn().mockResolvedValue([
        { id: 'tab-1', type: 'page', url: 'https://a.com', title: 'A' },
        { id: 'tab-2', type: 'page', url: 'https://b.com', title: 'B' },
        {
          id: 'ext-1',
          type: 'background_page',
          url: 'chrome-extension://x',
          title: 'Ext'
        }
      ]);

      const config = loadConfig();
      const manager = new BrowserManager(config);
      // Simulate that tab-1 is the active target by connecting first
      const mockClient = makeMockClient();
      (
        MockCDP as unknown as jest.MockedFunction<
          () => Promise<typeof mockClient>
        >
      ).mockResolvedValue(mockClient as never);
      MockCDP.List = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'tab-1', type: 'page', url: 'https://a.com', title: 'A' }
        ])
        .mockResolvedValueOnce([
          { id: 'tab-1', type: 'page', url: 'https://a.com', title: 'A' },
          { id: 'tab-2', type: 'page', url: 'https://b.com', title: 'B' },
          {
            id: 'ext-1',
            type: 'background_page',
            url: 'chrome-extension://x',
            title: 'Ext'
          }
        ]);

      await manager.connect();
      const tabs = await manager.listTabs();

      // Should only include page targets, not background_page
      expect(tabs).toHaveLength(2);
      expect(tabs[0]).toEqual({
        targetId: 'tab-1',
        url: 'https://a.com',
        title: 'A',
        active: true
      });
      expect(tabs[1]).toEqual({
        targetId: 'tab-2',
        url: 'https://b.com',
        title: 'B',
        active: false
      });
      await manager.destroy();
    });

    it('createTab calls CDP.New', async () => {
      MockCDP.New = jest.fn().mockResolvedValue({
        id: 'new-tab',
        url: 'https://new.com',
        title: ''
      });

      const config = loadConfig();
      const manager = new BrowserManager(config);
      const tab = await manager.createTab('https://new.com');

      expect(tab.targetId).toBe('new-tab');
      expect(tab.url).toBe('https://new.com');
      expect(MockCDP.New).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://new.com' })
      );
      await manager.destroy();
    });

    it('closeTab calls CDP.Close', async () => {
      MockCDP.Close = jest.fn().mockResolvedValue(undefined);

      const config = loadConfig();
      const manager = new BrowserManager(config);
      await manager.closeTab('tab-2');

      expect(MockCDP.Close).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tab-2' })
      );
      await manager.destroy();
    });

    it('closeTab throws when trying to close the active tab', async () => {
      const mockClient = makeMockClient();
      MockCDP.List = jest
        .fn()
        .mockResolvedValue([
          { id: 'tab-1', type: 'page', url: 'about:blank', title: '' }
        ]);
      (
        MockCDP as unknown as jest.MockedFunction<
          () => Promise<typeof mockClient>
        >
      ).mockResolvedValue(mockClient as never);

      const config = loadConfig();
      const manager = new BrowserManager(config);
      await manager.connect();

      await expect(manager.closeTab('tab-1')).rejects.toThrow(
        /cannot close the active tab/i
      );
      await manager.destroy();
    });

    it('switchTab connects to a new target', async () => {
      const mockClient = makeMockClient();
      MockCDP.List = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'tab-1', type: 'page', url: 'about:blank', title: '' }
        ])
        .mockResolvedValueOnce([
          { id: 'tab-1', type: 'page', url: 'about:blank', title: '' },
          {
            id: 'tab-2',
            type: 'page',
            url: 'https://example.com',
            title: 'Example'
          }
        ]);
      (
        MockCDP as unknown as jest.MockedFunction<
          () => Promise<typeof mockClient>
        >
      ).mockResolvedValue(mockClient as never);

      process.env.PILOT_CDP_RETRY_MS = '60000';
      const config = loadConfig();
      const manager = new BrowserManager(config);
      await manager.connect();

      expect(manager.getState().targetId).toBe('tab-1');

      await manager.switchTab('tab-2');

      expect(manager.getState().targetId).toBe('tab-2');
      expect(mockClient.close).toHaveBeenCalled();
      await manager.destroy();
    });

    it('switchTab throws for non-existent target', async () => {
      const mockClient = makeMockClient();
      MockCDP.List = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'tab-1', type: 'page', url: 'about:blank', title: '' }
        ])
        .mockResolvedValueOnce([
          { id: 'tab-1', type: 'page', url: 'about:blank', title: '' }
        ]);
      (
        MockCDP as unknown as jest.MockedFunction<
          () => Promise<typeof mockClient>
        >
      ).mockResolvedValue(mockClient as never);

      const config = loadConfig();
      const manager = new BrowserManager(config);
      await manager.connect();

      await expect(manager.switchTab('nonexistent')).rejects.toThrow(
        /no page tab found/i
      );
      await manager.destroy();
    });
  });
});
