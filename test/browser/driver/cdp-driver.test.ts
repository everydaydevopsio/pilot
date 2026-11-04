import { CdpDriver } from '../../../src/browser/driver/cdp-driver.js';
import {
  CAPABILITIES,
  type DriverSession
} from '../../../src/browser/driver/types.js';
import type { BrowserManager } from '../../../src/browser/browser-manager.js';
import type { BrowserEventCallback } from '../../../src/browser/types.js';
import { ElementRefMap } from '../../../src/browser/inspect/element-ref.js';
import { DialogQueue } from '../../../src/browser/interaction/dialogs.js';
import { DownloadTracker } from '../../../src/browser/interaction/downloads.js';
import { NetworkBuffer } from '../../../src/browser/network/network-buffer.js';
import { createTraceState } from '../../../src/browser/performance/trace.js';
import { ConsoleBuffer } from '../../../src/mcp/console-buffer.js';
import { attachNetworkMonitor } from '../../../src/browser/network/network-monitor.js';
import { attachDialogHandler } from '../../../src/browser/interaction/dialogs.js';
import {
  attachDownloadHandler,
  enableDownloads
} from '../../../src/browser/interaction/downloads.js';
import { resetCssState } from '../../../src/browser/inspect/styles.js';
import { applyViewport } from '../../../src/viewport.js';
import * as check from '../../../src/commands/check.js';
import * as click from '../../../src/commands/click.js';
import * as dialog from '../../../src/commands/dialog.js';
import * as evaluate from '../../../src/commands/evaluate.js';
import * as fill from '../../../src/commands/fill.js';
import * as find from '../../../src/commands/find.js';
import * as hover from '../../../src/commands/hover.js';
import * as navigate from '../../../src/commands/navigate.js';
import * as network from '../../../src/commands/network.js';
import * as pageInfo from '../../../src/commands/page_info.js';
import * as performance from '../../../src/commands/performance.js';
import * as pressKey from '../../../src/commands/press_key.js';
import * as screenshot from '../../../src/commands/screenshot.js';
import * as scroll from '../../../src/commands/scroll.js';
import * as select from '../../../src/commands/select.js';
import * as snapshot from '../../../src/commands/snapshot.js';
import * as styles from '../../../src/commands/styles.js';
import * as tabs from '../../../src/commands/tabs.js';
import * as type from '../../../src/commands/type.js';
import * as upload from '../../../src/commands/upload.js';
import * as wait from '../../../src/commands/wait.js';

jest.mock('../../../src/browser/network/network-monitor.js', () => ({
  attachNetworkMonitor: jest.fn()
}));
jest.mock('../../../src/browser/interaction/dialogs.js', () => ({
  ...jest.requireActual('../../../src/browser/interaction/dialogs.js'),
  attachDialogHandler: jest.fn()
}));
jest.mock('../../../src/browser/interaction/downloads.js', () => ({
  ...jest.requireActual('../../../src/browser/interaction/downloads.js'),
  attachDownloadHandler: jest.fn(),
  enableDownloads: jest.fn().mockResolvedValue('/tmp')
}));
jest.mock('../../../src/browser/inspect/styles.js', () => ({
  resetCssState: jest.fn()
}));
jest.mock('../../../src/viewport.js', () => ({
  applyViewport: jest.fn().mockResolvedValue(undefined)
}));
// Replace every execute* command with a mock; keep formatters and schemas.
function mockExecutes(path: string): Record<string, unknown> {
  const actual = jest.requireActual(path);
  const mocked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    mocked[key] =
      key.startsWith('execute') && typeof value === 'function'
        ? jest.fn().mockResolvedValue({ from: key })
        : value;
  }
  return mocked;
}
jest.mock('../../../src/commands/check.js', () =>
  mockExecutes('../../../src/commands/check.js')
);
jest.mock('../../../src/commands/click.js', () =>
  mockExecutes('../../../src/commands/click.js')
);
jest.mock('../../../src/commands/dialog.js', () =>
  mockExecutes('../../../src/commands/dialog.js')
);
jest.mock('../../../src/commands/evaluate.js', () =>
  mockExecutes('../../../src/commands/evaluate.js')
);
jest.mock('../../../src/commands/fill.js', () =>
  mockExecutes('../../../src/commands/fill.js')
);
jest.mock('../../../src/commands/find.js', () =>
  mockExecutes('../../../src/commands/find.js')
);
jest.mock('../../../src/commands/hover.js', () =>
  mockExecutes('../../../src/commands/hover.js')
);
jest.mock('../../../src/commands/navigate.js', () =>
  mockExecutes('../../../src/commands/navigate.js')
);
jest.mock('../../../src/commands/network.js', () =>
  mockExecutes('../../../src/commands/network.js')
);
jest.mock('../../../src/commands/page_info.js', () =>
  mockExecutes('../../../src/commands/page_info.js')
);
jest.mock('../../../src/commands/performance.js', () =>
  mockExecutes('../../../src/commands/performance.js')
);
jest.mock('../../../src/commands/press_key.js', () =>
  mockExecutes('../../../src/commands/press_key.js')
);
jest.mock('../../../src/commands/screenshot.js', () =>
  mockExecutes('../../../src/commands/screenshot.js')
);
jest.mock('../../../src/commands/scroll.js', () =>
  mockExecutes('../../../src/commands/scroll.js')
);
jest.mock('../../../src/commands/select.js', () =>
  mockExecutes('../../../src/commands/select.js')
);
jest.mock('../../../src/commands/snapshot.js', () =>
  mockExecutes('../../../src/commands/snapshot.js')
);
jest.mock('../../../src/commands/styles.js', () =>
  mockExecutes('../../../src/commands/styles.js')
);
jest.mock('../../../src/commands/tabs.js', () =>
  mockExecutes('../../../src/commands/tabs.js')
);
jest.mock('../../../src/commands/type.js', () =>
  mockExecutes('../../../src/commands/type.js')
);
jest.mock('../../../src/commands/upload.js', () =>
  mockExecutes('../../../src/commands/upload.js')
);
jest.mock('../../../src/commands/wait.js', () =>
  mockExecutes('../../../src/commands/wait.js')
);

const client = { id: 'client-1' };

function makeSession(): DriverSession {
  return {
    consoleBuffer: new ConsoleBuffer(10),
    elementRefMap: new ElementRefMap(),
    networkBuffer: new NetworkBuffer(),
    dialogQueue: new DialogQueue(),
    downloadTracker: new DownloadTracker(),
    traceState: createTraceState()
  };
}

function makeManager(overrides: Partial<Record<string, unknown>> = {}) {
  let callback: BrowserEventCallback | null = null;
  const manager = {
    setEventCallback: jest.fn((cb: BrowserEventCallback) => {
      callback = cb;
    }),
    getClient: jest.fn(() => client),
    isConnected: jest.fn(() => true),
    launch: jest
      .fn()
      .mockResolvedValue({ headless: true, viewport: 'desktop' }),
    connectExisting: jest.fn().mockResolvedValue({ tabs: [] }),
    destroy: jest.fn().mockResolvedValue(undefined),
    getSessionInfo: jest.fn(() => ({ mode: 'launched', connected: true })),
    getViewportConfig: jest.fn(() => null),
    setViewportConfig: jest.fn(),
    ...overrides
  };
  return {
    manager: manager as unknown as BrowserManager,
    raw: manager,
    emit: (event: string, data?: unknown) => callback!(event, data)
  };
}

beforeEach(() => jest.clearAllMocks());

describe('CdpDriver identity', () => {
  it('is chrome and supports every capability', () => {
    const { manager } = makeManager();
    const driver = new CdpDriver(makeSession(), manager);
    expect(driver.kind).toBe('chrome');
    expect([...driver.capabilities].sort()).toEqual([...CAPABILITIES].sort());
  });

  it('reports the browser in session info', () => {
    const { manager } = makeManager();
    expect(new CdpDriver(makeSession(), manager).getSessionInfo()).toEqual({
      browser: 'chrome',
      mode: 'launched',
      connected: true
    });
  });
});

describe('CdpDriver lifecycle delegation', () => {
  it('delegates launch, connectExisting, destroy, isConnected', async () => {
    const { manager, raw } = makeManager();
    const driver = new CdpDriver(makeSession(), manager);
    await expect(driver.launch({ headless: true })).resolves.toEqual({
      headless: true,
      viewport: 'desktop'
    });
    expect(raw.launch).toHaveBeenCalledWith({ headless: true });
    await driver.connectExisting({ host: 'h', port: 1 });
    expect(raw.connectExisting).toHaveBeenCalledWith({ host: 'h', port: 1 });
    expect(driver.isConnected()).toBe(true);
    await driver.destroy();
    expect(raw.destroy).toHaveBeenCalled();
  });

  it('fails with the standard error when there is no CDP client', async () => {
    const { manager } = makeManager({ getClient: jest.fn(() => null) });
    const driver = new CdpDriver(makeSession(), manager);
    expect(() => driver.pageInfo()).toThrow(
      'Browser not started. Call browser_start first.'
    );
  });
});

describe('CdpDriver browser events', () => {
  it('buffers console messages', () => {
    const { manager, emit } = makeManager();
    const session = makeSession();
    new CdpDriver(session, manager);
    emit('console_message', {
      level: 'log',
      text: 'hi',
      timestamp: 1
    });
    expect(session.consoleBuffer.size()).toBe(1);
  });

  it('invalidates element refs on navigation', () => {
    const { manager, emit } = makeManager();
    const session = makeSession();
    const invalidate = jest.spyOn(session.elementRefMap, 'invalidate');
    new CdpDriver(session, manager);
    emit('page_navigated', { url: 'https://x.test' });
    expect(invalidate).toHaveBeenCalled();
  });

  it('attaches monitors once per CDP client', () => {
    const { manager, emit } = makeManager();
    const session = makeSession();
    new CdpDriver(session, manager);
    emit('browser_connected', {});
    emit('page_navigated', { url: 'a' });
    expect(attachNetworkMonitor).toHaveBeenCalledTimes(1);
    expect(attachNetworkMonitor).toHaveBeenCalledWith(
      client,
      session.networkBuffer
    );
    expect(attachDialogHandler).toHaveBeenCalledWith(
      client,
      session.dialogQueue
    );
    expect(attachDownloadHandler).toHaveBeenCalledWith(
      client,
      session.downloadTracker
    );
    expect(enableDownloads).toHaveBeenCalledWith(client);
  });

  it('reattaches monitors after a disconnect or tab switch', () => {
    const second = { id: 'client-2' };
    const getClient = jest
      .fn()
      .mockReturnValueOnce(client)
      .mockReturnValue(second);
    const { manager, emit } = makeManager({ getClient });
    new CdpDriver(makeSession(), manager);
    emit('browser_connected', {});
    emit('page_navigated', { url: 'tab switch' });
    expect(attachNetworkMonitor).toHaveBeenCalledTimes(2);
    expect(attachNetworkMonitor).toHaveBeenLastCalledWith(
      second,
      expect.any(NetworkBuffer)
    );
  });

  it('skips monitors while disconnected', () => {
    const { manager, emit } = makeManager({ getClient: jest.fn(() => null) });
    new CdpDriver(makeSession(), manager);
    emit('browser_connected', {});
    expect(attachNetworkMonitor).not.toHaveBeenCalled();
  });

  it('ignores a failure to enable downloads', async () => {
    (enableDownloads as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    const { manager, emit } = makeManager();
    new CdpDriver(makeSession(), manager);
    expect(() => emit('browser_connected', {})).not.toThrow();
    await Promise.resolve();
  });

  it('clears dialog, download, and CSS state on disconnect', () => {
    const { manager, emit } = makeManager();
    const session = makeSession();
    const clearDialogs = jest.spyOn(session.dialogQueue, 'clear');
    const clearDownloads = jest.spyOn(session.downloadTracker, 'clear');
    new CdpDriver(session, manager);
    emit('browser_connected', {});
    emit('browser_disconnected', {});
    expect(clearDialogs).toHaveBeenCalled();
    expect(clearDownloads).toHaveBeenCalled();
    expect(resetCssState).toHaveBeenCalled();
    // The next connection attaches monitors to the (same) client again.
    emit('browser_connected', {});
    expect(attachNetworkMonitor).toHaveBeenCalledTimes(2);
  });
});

describe('CdpDriver command delegation', () => {
  const { manager } = makeManager();
  const session = makeSession();
  const driver = new CdpDriver(session, manager);
  const refs = session.elementRefMap;

  it.each([
    [
      'navigate',
      () =>
        driver.navigate({
          url: 'https://x.test',
          waitUntil: 'load',
          timeoutMs: 1
        }),
      navigate.executeNavigate,
      [
        client,
        manager,
        { url: 'https://x.test', waitUntil: 'load', timeoutMs: 1 }
      ]
    ],
    ['pageInfo', () => driver.pageInfo(), pageInfo.executePageInfo, [client]],
    [
      'evaluate',
      () =>
        driver.evaluate({ expression: '1', awaitPromise: true, timeoutMs: 1 }),
      evaluate.executeEvaluate,
      [client, { expression: '1', awaitPromise: true, timeoutMs: 1 }]
    ],
    [
      'wait',
      () => driver.wait({ ms: 1, timeoutMs: 1 }),
      wait.executeWait,
      [client, manager, { ms: 1, timeoutMs: 1 }]
    ],
    [
      'screenshot',
      () => driver.screenshot({ format: 'png', quality: 80, fullPage: false }),
      screenshot.executeScreenshot,
      [client, { format: 'png', quality: 80, fullPage: false }]
    ],
    [
      'snapshot',
      () => driver.snapshot(),
      snapshot.executeSnapshot,
      [client, refs]
    ],
    [
      'find',
      () => driver.find({ role: 'button' }),
      find.executeFind,
      [client, refs, { role: 'button' }]
    ],
    [
      'styles',
      () => driver.styles({ ref: 'e1' }),
      styles.executeStyles,
      [client, refs, { ref: 'e1' }]
    ],
    [
      'click',
      () =>
        driver.click({
          ref: 'e1',
          button: 'left',
          clickCount: 1,
          timeoutMs: 1
        }),
      click.executeClick,
      [client, { ref: 'e1', button: 'left', clickCount: 1, timeoutMs: 1 }, refs]
    ],
    [
      'type',
      () => driver.type({ text: 'a', clearFirst: false, delayMs: 0 }),
      type.executeType,
      [client, { text: 'a', clearFirst: false, delayMs: 0 }, refs]
    ],
    [
      'fill',
      () => driver.fill({ ref: 'e1', value: 'v' }),
      fill.executeFill,
      [client, refs, { ref: 'e1', value: 'v' }]
    ],
    [
      'hover',
      () => driver.hover({ ref: 'e1' }),
      hover.executeHover,
      [client, refs, { ref: 'e1' }]
    ],
    [
      'pressKey',
      () => driver.pressKey({ key: 'Enter' }),
      pressKey.executePressKey,
      [client, { key: 'Enter' }]
    ],
    [
      'select',
      () => driver.select({ ref: 'e1', value: 'a' }),
      select.executeSelect,
      [client, refs, { ref: 'e1', value: 'a' }]
    ],
    [
      'check',
      () => driver.check({ ref: 'e1', checked: true }),
      check.executeCheck,
      [client, refs, { ref: 'e1', checked: true }]
    ],
    [
      'scroll',
      () => driver.scroll({ direction: 'down' }),
      scroll.executeScroll,
      [client, refs, { direction: 'down' }]
    ],
    [
      'dialog',
      () => driver.dialog({ action: 'list' }),
      dialog.executeDialog,
      [client, session.dialogQueue, { action: 'list' }]
    ],
    [
      'upload',
      () => driver.upload({ ref: 'e1', files: ['a'] }),
      upload.executeUpload,
      [client, refs, { ref: 'e1', files: ['a'] }]
    ],
    [
      'network',
      () => driver.network({ action: 'list' }),
      network.executeNetwork,
      [client, session.networkBuffer, { action: 'list' }]
    ],
    [
      'performance',
      () => driver.performance({ action: 'start' }),
      performance.executePerformance,
      [client, session.traceState, { action: 'start' }]
    ],
    ['listTabs', () => driver.listTabs(), tabs.executeListTabs, [manager]],
    [
      'newTab',
      () => driver.newTab('https://x.test'),
      tabs.executeNewTab,
      [manager, 'https://x.test']
    ],
    [
      'closeTab',
      () => driver.closeTab('t1'),
      tabs.executeCloseTab,
      [manager, 't1']
    ],
    [
      'switchTab',
      () => driver.switchTab('t1'),
      tabs.executeSwitchTab,
      [manager, 't1']
    ]
  ] as Array<[string, () => Promise<unknown>, unknown, unknown[]]>)(
    '%s calls the CDP command with the session state',
    async (_name, call, command, args) => {
      await expect(call()).resolves.toBeDefined();
      expect(command).toHaveBeenCalledWith(...args);
    }
  );
});

describe('CdpDriver.resizeViewport', () => {
  it('locks the viewport, applying it to Chrome and the manager', async () => {
    const { manager, raw } = makeManager();
    const driver = new CdpDriver(makeSession(), manager);
    const config = await driver.resizeViewport({ width: 800, height: 600 });
    expect(config).toEqual({
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
      responsive: false
    });
    expect(applyViewport).toHaveBeenCalledWith(client, config);
    expect(raw.setViewportConfig).toHaveBeenCalledWith(config);
  });

  it('keeps the current DPR, mobile mode, and mobile user agent', async () => {
    const { manager } = makeManager({
      getViewportConfig: jest.fn(() => ({
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true,
        userAgent: 'Mobile UA'
      }))
    });
    const driver = new CdpDriver(makeSession(), manager);
    await expect(
      driver.resizeViewport({ width: 400, height: 900 })
    ).resolves.toEqual({
      width: 400,
      height: 900,
      deviceScaleFactor: 3,
      mobile: true,
      responsive: false,
      userAgent: 'Mobile UA'
    });
  });

  it('drops the mobile user agent when switching to desktop', async () => {
    const { manager } = makeManager({
      getViewportConfig: jest.fn(() => ({
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true,
        userAgent: 'Mobile UA'
      }))
    });
    const driver = new CdpDriver(makeSession(), manager);
    const config = await driver.resizeViewport({
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });
    expect(config).toEqual({
      width: 1280,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false,
      responsive: false
    });
  });
});

describe('CdpDriver.create', () => {
  it('builds a driver around a new BrowserManager', async () => {
    const { loadConfig } = await import('../../../src/util/config.js');
    const driver = CdpDriver.create(loadConfig(), makeSession());
    expect(driver.isConnected()).toBe(false);
    await driver.destroy();
  });
});
