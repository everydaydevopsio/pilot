import {
  CAPABILITIES,
  type BrowserDriver,
  type Capability
} from '../../src/browser/driver/types.js';
import { ElementRefMap } from '../../src/browser/inspect/element-ref.js';
import { DialogQueue } from '../../src/browser/interaction/dialogs.js';
import { DownloadTracker } from '../../src/browser/interaction/downloads.js';
import { NetworkBuffer } from '../../src/browser/network/network-buffer.js';
import { createTraceState } from '../../src/browser/performance/trace.js';
import { ConsoleBuffer } from '../../src/mcp/console-buffer.js';
import { registerAllTools, type BrowserContext } from '../../src/mcp/server.js';
import { EXPECTED_TOOLS } from '../../src/mcp/tools/names.js';

type ToolResult = {
  content: Array<{ type: string; text?: string; data?: string }>;
  isError?: boolean;
};
type Handler = (args?: Record<string, unknown>) => Promise<ToolResult>;

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function fakeDriver(capabilities: readonly Capability[] = CAPABILITIES) {
  return {
    kind: 'chrome',
    capabilities: new Set(capabilities),
    launch: jest
      .fn()
      .mockResolvedValue({ headless: true, viewport: 'desktop' }),
    connectExisting: jest.fn().mockResolvedValue({
      tabs: [
        { targetId: 't1', url: 'https://a.test', title: 'A', active: true }
      ]
    }),
    destroy: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
    getSessionInfo: jest.fn().mockReturnValue({
      browser: 'chrome',
      mode: 'launched',
      connected: true,
      pid: 7,
      profile: 'p'
    }),
    listTabs: jest
      .fn()
      .mockResolvedValue([
        { targetId: 't1', url: 'https://a.test', title: 'A', active: true }
      ]),
    newTab: jest.fn().mockResolvedValue({ targetId: 't2', url: 'about:blank' }),
    closeTab: jest.fn().mockResolvedValue(undefined),
    switchTab: jest.fn().mockResolvedValue(undefined),
    navigate: jest
      .fn()
      .mockResolvedValue({ url: 'https://a.test/', status: 200 }),
    pageInfo: jest.fn().mockResolvedValue({
      url: 'https://a.test/',
      title: 'A',
      readyState: 'complete'
    }),
    evaluate: jest.fn().mockResolvedValue({ value: 2, type: 'number' }),
    wait: jest.fn().mockResolvedValue({ ok: true, elapsed: 5 }),
    screenshot: jest
      .fn()
      .mockResolvedValue({ dataUrl: PNG, width: 10, height: 10 }),
    resizeViewport: jest.fn().mockResolvedValue({
      width: 800,
      height: 600,
      deviceScaleFactor: 1,
      mobile: false,
      responsive: false
    }),
    snapshot: jest.fn().mockResolvedValue({ text: 'SNAPSHOT', snapshot: {} }),
    find: jest.fn().mockResolvedValue({ text: 'FOUND', elements: [] }),
    styles: jest.fn().mockResolvedValue({ text: 'STYLES', styles: {} }),
    click: jest.fn().mockResolvedValue({ x: 1, y: 2 }),
    type: jest.fn().mockResolvedValue({ ok: true }),
    fill: jest.fn().mockResolvedValue({ ref: 'e1', value: 'v' }),
    hover: jest.fn().mockResolvedValue({ x: 3, y: 4 }),
    pressKey: jest
      .fn()
      .mockResolvedValue({ key: 'Enter', modifiers: ['Shift'] }),
    select: jest.fn().mockResolvedValue({
      ref: 'e1',
      selectedValue: 'a',
      selectedLabel: 'A'
    }),
    check: jest.fn().mockResolvedValue({ ref: 'e1', checked: true }),
    scroll: jest.fn().mockResolvedValue({ scrollX: 0, scrollY: 100 }),
    dialog: jest.fn().mockResolvedValue({ action: 'list', dialogs: [] }),
    upload: jest.fn().mockResolvedValue({ ref: 'e1', files: ['a.txt'] }),
    network: jest.fn().mockResolvedValue({ action: 'clear', cleared: 3 }),
    performance: jest
      .fn()
      .mockResolvedValue({ action: 'start', text: 'Tracing started' })
  };
}

type FakeDriver = ReturnType<typeof fakeDriver>;

function setup(opts: { driver?: FakeDriver | null; next?: FakeDriver }) {
  const handlers = new Map<string, Handler>();
  const server = {
    tool: jest.fn((name: string, ...rest: unknown[]) => {
      handlers.set(name, rest[rest.length - 1] as Handler);
    })
  };
  const context: BrowserContext = {
    driver: (opts.driver ?? null) as unknown as BrowserDriver | null,
    consoleBuffer: new ConsoleBuffer(50),
    elementRefMap: new ElementRefMap(),
    networkBuffer: new NetworkBuffer(),
    dialogQueue: new DialogQueue(),
    downloadTracker: new DownloadTracker(),
    traceState: createTraceState(),
    baseConfig: { bufferSize: 50 }
  };
  const makeDriver = jest.fn(
    () => (opts.next ?? fakeDriver()) as unknown as BrowserDriver
  );
  registerAllTools(server as never, context, makeDriver);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    handlers.get(name)!(args);
  const text = async (name: string, args?: Record<string, unknown>) =>
    (await call(name, args)).content[0].text ?? '';
  return { handlers, context, makeDriver, call, text };
}

describe('registerAllTools', () => {
  it('registers exactly the expected tools', () => {
    const { handlers } = setup({});
    expect([...handlers.keys()].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });
});

// #62 AC1/AC2: every browser tool reaches the driver, never a CDP client.
describe('tools delegate to the driver', () => {
  const cases: Array<
    [string, Record<string, unknown>, keyof FakeDriver, unknown[], RegExp]
  > = [
    [
      'browser_navigate',
      { url: 'https://a.test', waitUntil: 'load', timeoutMs: 1 },
      'navigate',
      [{ url: 'https://a.test', waitUntil: 'load', timeoutMs: 1 }],
      /Navigated to https:\/\/a.test\/ \(status: 200\)/
    ],
    ['browser_page_info', {}, 'pageInfo', [], /"readyState": "complete"/],
    [
      'browser_evaluate',
      { expression: '1+1', awaitPromise: true, timeoutMs: 5 },
      'evaluate',
      [{ expression: '1+1', awaitPromise: true, timeoutMs: 5 }],
      /"value": 2/
    ],
    [
      'browser_wait',
      { ms: 5, timeoutMs: 10 },
      'wait',
      [{ ms: 5, timeoutMs: 10 }],
      /Wait completed in 5ms/
    ],
    [
      'browser_click',
      { ref: 'e1' },
      'click',
      [{ ref: 'e1' }],
      /Clicked at \(1, 2\)/
    ],
    [
      'browser_type',
      { text: 'hi', ref: 'e1' },
      'type',
      [{ text: 'hi', ref: 'e1' }],
      /Typed "hi" into e1/
    ],
    ['browser_type', { text: 'hi' }, 'type', [{ text: 'hi' }], /^Typed "hi"$/],
    ['browser_list_tabs', {}, 'listTabs', [], /"targetId": "t1"/],
    [
      'browser_new_tab',
      { url: 'about:blank' },
      'newTab',
      ['about:blank'],
      /New tab opened \(targetId: t2/
    ],
    [
      'browser_close_tab',
      { targetId: 't1' },
      'closeTab',
      ['t1'],
      /Tab t1 closed/
    ],
    [
      'browser_switch_tab',
      { targetId: 't1' },
      'switchTab',
      ['t1'],
      /Switched to tab t1/
    ],
    [
      'browser_viewport_resize',
      { width: 800, height: 600 },
      'resizeViewport',
      [
        {
          width: 800,
          height: 600,
          deviceScaleFactor: undefined,
          mobile: undefined
        }
      ],
      /Viewport resized to 800x600 \(DPR: 1, mobile: false\)/
    ],
    ['browser_snapshot', {}, 'snapshot', [], /SNAPSHOT/],
    [
      'browser_find',
      { role: 'button' },
      'find',
      [{ role: 'button', name: undefined, text: undefined }],
      /FOUND/
    ],
    [
      'browser_styles',
      { ref: 'e1' },
      'styles',
      [{ ref: 'e1', properties: undefined }],
      /STYLES/
    ],
    [
      'browser_fill',
      { ref: 'e1', value: 'v' },
      'fill',
      [{ ref: 'e1', value: 'v' }],
      /Filled e1 with "v"/
    ],
    [
      'browser_hover',
      { ref: 'e1' },
      'hover',
      [{ ref: 'e1' }],
      /Hovered at \(3, 4\)/
    ],
    [
      'browser_press_key',
      { key: 'Enter' },
      'pressKey',
      [{ key: 'Enter' }],
      /Pressed Enter with modifiers: Shift/
    ],
    [
      'browser_select',
      { ref: 'e1', value: 'a' },
      'select',
      [{ ref: 'e1', value: 'a' }],
      /Selected "A" \(value="a"\) in e1/
    ],
    [
      'browser_check',
      { ref: 'e1', checked: true },
      'check',
      [{ ref: 'e1', checked: true }],
      /e1 is now checked/
    ],
    [
      'browser_scroll',
      { direction: 'down' },
      'scroll',
      [{ direction: 'down' }],
      /Scrolled to \(0, 100\)/
    ],
    [
      'browser_dialog',
      { action: 'list' },
      'dialog',
      [{ action: 'list', promptText: undefined }],
      /dialog/i
    ],
    [
      'browser_upload',
      { ref: 'e1', files: ['a.txt'] },
      'upload',
      [{ ref: 'e1', files: ['a.txt'] }],
      /Uploaded 1 file\(s\) to e1/
    ],
    [
      'browser_network',
      { action: 'clear' },
      'network',
      [{ action: 'clear' }],
      /Cleared 3 network records/
    ],
    [
      'browser_performance',
      { action: 'start' },
      'performance',
      [{ action: 'start' }],
      /Tracing started/
    ]
  ];

  it.each(cases)(
    '%s → driver.%s',
    async (tool, args, method, expected, out) => {
      const driver = fakeDriver();
      const { text } = setup({ driver });
      await expect(text(tool, args)).resolves.toMatch(out);
      expect(driver[method]).toHaveBeenCalledWith(...expected);
    }
  );

  it('browser_screenshot returns an image from the data URL', async () => {
    const driver = fakeDriver();
    const { call } = setup({ driver });
    const result = await call('browser_screenshot', {
      format: 'png',
      quality: 80,
      fullPage: false
    });
    expect(result.content[0]).toEqual({
      type: 'image',
      data: 'iVBORw0KGgo=',
      mimeType: 'image/png'
    });
  });

  it('browser_screenshot labels JPEG output', async () => {
    const driver = fakeDriver();
    driver.screenshot.mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,AAAA',
      width: 1,
      height: 1
    });
    const { call } = setup({ driver });
    const result = await call('browser_screenshot', { format: 'jpeg' });
    expect(result.content[0]).toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('browser_screenshot falls back to text for a non-data URL', async () => {
    const driver = fakeDriver();
    driver.screenshot.mockResolvedValue({ dataUrl: 'x', width: 3, height: 4 });
    const { text } = setup({ driver });
    await expect(text('browser_screenshot')).resolves.toBe(
      'Screenshot captured: 3x4'
    );
  });

  it('browser_downloads reads the tracker once the browser is running', async () => {
    const { text } = setup({ driver: fakeDriver() });
    await expect(
      text('browser_downloads', { action: 'list' })
    ).resolves.toMatch(/download/i);
  });
});

describe('browser_tabs', () => {
  it.each([
    [{ action: 'list' }, 'listTabs', /"targetId": "t1"/],
    [{ action: 'new', url: 'about:blank' }, 'newTab', /New tab opened/],
    [{ action: 'select', targetId: 't1' }, 'switchTab', /Switched to tab t1/],
    [{ action: 'close', targetId: 't1' }, 'closeTab', /Tab t1 closed/]
  ] as Array<[Record<string, unknown>, keyof FakeDriver, RegExp]>)(
    '%o → driver.%s',
    async (args, method, out) => {
      const driver = fakeDriver();
      const { text } = setup({ driver });
      await expect(text('browser_tabs', args)).resolves.toMatch(out);
      expect(driver[method]).toHaveBeenCalled();
    }
  );

  it.each(['select', 'close'])('%s requires a targetId', async (action) => {
    const { call } = setup({ driver: fakeDriver() });
    const result = await call('browser_tabs', { action });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      `Error: targetId is required for ${action} action`
    );
  });
});

describe('argument validation stays ahead of the driver', () => {
  it('browser_click needs a target', async () => {
    const driver = fakeDriver();
    const { call } = setup({ driver });
    const result = await call('browser_click', {});
    expect(result.isError).toBe(true);
    expect(driver.click).not.toHaveBeenCalled();
  });

  it('browser_wait needs a condition', async () => {
    const driver = fakeDriver();
    const { call } = setup({ driver });
    const result = await call('browser_wait', { timeoutMs: 10 });
    expect(result.isError).toBe(true);
    expect(driver.wait).not.toHaveBeenCalled();
  });
});

describe('tools without a running browser', () => {
  it.each([
    'browser_navigate',
    'browser_screenshot',
    'browser_snapshot',
    'browser_fill',
    'browser_network',
    'browser_styles',
    'browser_dialog',
    'browser_downloads',
    'browser_performance',
    'browser_tabs'
  ])('%s reports that the browser is not started', async (tool) => {
    const { call } = setup({});
    await expect(
      call(tool, {
        action: 'list',
        ref: 'e1',
        value: 'v',
        url: 'https://a.test'
      })
    ).rejects.toThrow('Browser not started. Call browser_start first.');
  });

  it('browser_console still reads the buffer', async () => {
    const { text } = setup({});
    await expect(text('browser_console', {})).resolves.toBeDefined();
  });
});

// #62 AC3: a driver lacking a capability never runs the tool.
describe('capability gating', () => {
  it('rejects a tool the driver cannot support without calling it', async () => {
    const driver = fakeDriver(
      CAPABILITIES.filter((c) => c !== 'performanceTrace')
    );
    driver.kind = 'firefox';
    const { call } = setup({ driver });
    await expect(
      call('browser_performance', { action: 'start' })
    ).rejects.toThrow(
      'browser_performance is not supported by firefox (missing capabilities: performanceTrace).'
    );
    expect(driver.performance).not.toHaveBeenCalled();
  });

  it('gates buffer-only tools on the console capability', async () => {
    const driver = fakeDriver(CAPABILITIES.filter((c) => c !== 'console'));
    driver.kind = 'safari';
    const { call } = setup({ driver });
    await expect(call('browser_get_errors', {})).rejects.toThrow(
      'browser_get_errors is not supported by safari'
    );
  });

  it('keeps session tools available on a driver with no capabilities', async () => {
    const driver = fakeDriver([]);
    const { text } = setup({ driver });
    await expect(text('browser_status')).resolves.toMatch(
      /"browser": "chrome"/
    );
  });
});

// #62 AC5 and lifecycle through the factory.
describe('session lifecycle', () => {
  it('browser_start launches a new driver and keeps it', async () => {
    const next = fakeDriver();
    const { context, makeDriver, text } = setup({ next });
    await expect(
      text('browser_start', { headless: true, startupTimeoutMs: 1000 })
    ).resolves.toBe('Browser started (headless), viewport: desktop.');
    expect(makeDriver).toHaveBeenCalledTimes(1);
    expect(next.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true, startupTimeoutMs: 1000 })
    );
    expect(context.driver).toBe(next);
  });

  it('browser_start reports a visible browser', async () => {
    const next = fakeDriver();
    next.launch.mockResolvedValue({ headless: false, viewport: 'mobile' });
    const { text } = setup({ next });
    await expect(text('browser_start')).resolves.toBe(
      'Browser started (visible), viewport: mobile.'
    );
  });

  it('browser_start is a no-op while connected', async () => {
    const { makeDriver, text } = setup({ driver: fakeDriver() });
    await expect(text('browser_start')).resolves.toBe(
      'Browser is already running.'
    );
    expect(makeDriver).not.toHaveBeenCalled();
  });

  it('browser_start replaces a disconnected driver', async () => {
    const stale = fakeDriver();
    stale.isConnected.mockReturnValue(false);
    const next = fakeDriver();
    const { context, text } = setup({ driver: stale, next });
    await text('browser_start');
    expect(stale.destroy).toHaveBeenCalled();
    expect(context.driver).toBe(next);
  });

  it('browser_stop destroys the driver', async () => {
    const driver = fakeDriver();
    const { context, text } = setup({ driver });
    await expect(text('browser_stop')).resolves.toBe('Browser stopped.');
    expect(driver.destroy).toHaveBeenCalled();
    expect(context.driver).toBeNull();
  });

  it('browser_stop explains when nothing is running', async () => {
    const { text } = setup({});
    await expect(text('browser_stop')).resolves.toMatch(/not running/);
  });

  it('browser_status reports the browser kind', async () => {
    const { text } = setup({ driver: fakeDriver() });
    const status = JSON.parse(await text('browser_status'));
    expect(status.session).toMatchObject({
      browser: 'chrome',
      mode: 'launched'
    });
  });

  it('browser_status reports no session', async () => {
    const { text } = setup({});
    const status = JSON.parse(await text('browser_status'));
    expect(status.session).toEqual({ mode: 'none', connected: false });
  });

  it('browser_stop_all reports a disconnected external browser', async () => {
    const driver = fakeDriver();
    driver.getSessionInfo.mockReturnValue({
      browser: 'chrome',
      mode: 'external',
      connected: true,
      host: '127.0.0.1',
      cdpPort: 9222
    });
    const { context, text } = setup({ driver });
    // Other Pilot profiles on this machine are left to the sessions tests.
    jest
      .spyOn(await import('../../src/browser/sessions.js'), 'stopPilotBrowsers')
      .mockResolvedValue([]);
    await expect(text('browser_stop_all')).resolves.toBe(
      'this session: disconnected from 127.0.0.1:9222 (not stopped; Pilot did not launch it)'
    );
    expect(context.driver).toBeNull();
  });

  it('browser_connect attaches a new driver', async () => {
    const next = fakeDriver();
    const { context, text } = setup({ next });
    await expect(
      text('browser_connect', { host: '127.0.0.1', port: 9333 })
    ).resolves.toMatch(/Connected to Chrome at 127.0.0.1:9333/);
    expect(next.connectExisting).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 9333
    });
    expect(context.driver).toBe(next);
  });

  it('browser_connect destroys the driver when connecting fails', async () => {
    const next = fakeDriver();
    next.connectExisting.mockRejectedValue(new Error('refused'));
    const { context, call } = setup({ next });
    await expect(
      call('browser_connect', { host: '127.0.0.1', port: 1 })
    ).rejects.toThrow('refused');
    expect(next.destroy).toHaveBeenCalled();
    expect(context.driver).toBeNull();
  });

  it('browser_connect refuses while connected', async () => {
    const { makeDriver, text } = setup({ driver: fakeDriver() });
    await expect(text('browser_connect', {})).resolves.toMatch(
      /Already connected/
    );
    expect(makeDriver).not.toHaveBeenCalled();
  });

  it('browser_connect replaces a disconnected driver', async () => {
    const stale = fakeDriver();
    stale.isConnected.mockReturnValue(false);
    const next = fakeDriver();
    const { context, text } = setup({ driver: stale, next });
    await text('browser_connect', { host: 'h', port: 2 });
    expect(stale.destroy).toHaveBeenCalled();
    expect(context.driver).toBe(next);
  });
});
