// #58: Firefox driver over WebDriver BiDi, exercised against a fake transport.
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BIDI_CAPABILITIES,
  BidiDriver,
  toConsoleMessage,
  type BidiDriverDeps
} from '../../../src/browser/driver/bidi-driver.js';
import type { DriverSession } from '../../../src/browser/driver/types.js';
import {
  BidiError,
  type BidiEventHandler,
  type BidiTransport
} from '../../../src/browser/bidi/connection.js';
import type { RemoteValue } from '../../../src/browser/bidi/remote-value.js';
import {
  FIREFOX_LOCK_FILE,
  resolveFirefoxProfileDir,
  writeFirefoxLock
} from '../../../src/browser/firefox-launcher.js';
import { ElementRefMap } from '../../../src/browser/inspect/element-ref.js';
import { DialogQueue } from '../../../src/browser/interaction/dialogs.js';
import { DownloadTracker } from '../../../src/browser/interaction/downloads.js';
import { NetworkBuffer } from '../../../src/browser/network/network-buffer.js';
import { createTraceState } from '../../../src/browser/performance/trace.js';
import { ConsoleBuffer } from '../../../src/mcp/console-buffer.js';
import { loadConfig } from '../../../src/util/config.js';

type Handler = (params: Record<string, unknown>) => unknown;

class FakeTransport implements BidiTransport {
  calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  handlers: Record<string, Handler> = {};
  private events = new Map<string, BidiEventHandler[]>();
  private closeHandlers: Array<() => void> = [];
  closed = false;

  async send<T>(method: string, params: Record<string, unknown> = {}) {
    this.calls.push({ method, params });
    const handler = this.handlers[method];
    return (handler ? await handler(params) : {}) as T;
  }

  on(event: string, handler: BidiEventHandler): void {
    this.events.set(event, [...(this.events.get(event) ?? []), handler]);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  emit(event: string, params: Record<string, unknown>): void {
    for (const h of this.events.get(event) ?? []) h(params);
  }

  drop(): void {
    for (const h of this.closeHandlers) h();
  }

  methods(): string[] {
    return this.calls.map((c) => c.method);
  }

  last(method: string): Record<string, unknown> | undefined {
    return [...this.calls].reverse().find((c) => c.method === method)?.params;
  }
}

const str = (value: string): RemoteValue => ({ type: 'string', value });
const num = (value: number): RemoteValue => ({ type: 'number', value });
const obj = (entries: Record<string, RemoteValue>): RemoteValue => ({
  type: 'object',
  value: Object.entries(entries)
});
const ok = (result: RemoteValue) => ({ type: 'success', result });

function session(): DriverSession {
  return {
    consoleBuffer: new ConsoleBuffer(50),
    elementRefMap: new ElementRefMap(),
    networkBuffer: new NetworkBuffer(),
    dialogQueue: new DialogQueue(),
    downloadTracker: new DownloadTracker(),
    traceState: createTraceState()
  };
}

function fakeProcess(pid = 4321): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  Object.assign(proc, { pid, kill: jest.fn() });
  return proc;
}

describe('BidiDriver', () => {
  const origXdg = process.env.XDG_DATA_HOME;
  let workDir: string;
  let transport: FakeTransport;
  let sess: DriverSession;
  let deps: jest.Mocked<BidiDriverDeps>;
  let proc: ChildProcess;
  let evaluate: (expression: string, context: unknown) => unknown;
  let callFunction: Handler;

  function driver(): BidiDriver {
    return new BidiDriver(sess, loadConfig({ chromePath: undefined }), deps);
  }

  async function launched(
    opts: Parameters<BidiDriver['launch']>[0] = {}
  ): Promise<BidiDriver> {
    const d = driver();
    await d.launch({ firefoxPath: '/bin/true', headless: true, ...opts });
    transport.calls = [];
    return d;
  }

  async function withRef(d: BidiDriver, sharedId = 'node-1'): Promise<string> {
    callFunction = () =>
      ok({
        type: 'array',
        value: [
          {
            type: 'array',
            value: [
              { type: 'node', sharedId },
              obj({
                role: str('button'),
                name: str('Go'),
                tag: str('button'),
                visible: { type: 'boolean', value: true }
              })
            ]
          }
        ]
      });
    const { snapshot } = await d.snapshot();
    return snapshot.elements[0].ref;
  }

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pilot-bidi-test-'));
    process.env.XDG_DATA_HOME = workDir;
    sess = session();
    transport = new FakeTransport();
    proc = fakeProcess();
    evaluate = () => ({ type: 'undefined' });
    callFunction = () => ok({ type: 'undefined' });
    transport.handlers = {
      'network.addDataCollector': () => ({ collector: 'col-1' }),
      'browsingContext.getTree': () => ({
        contexts: [
          { context: 'ctx-1', url: 'about:blank' },
          { context: 'ctx-2', url: 'https://example.com/' }
        ]
      }),
      'browser.getClientWindows': () => ({
        clientWindows: [{ clientWindow: 'win-1' }]
      }),
      'browsingContext.create': () => ({ context: 'ctx-new' }),
      'browsingContext.navigate': () => ({ navigation: 'nav-1', url: '' }),
      'script.evaluate': (p) => {
        const value = evaluate(
          p.expression as string,
          (p.target as { context: string }).context
        );
        return value && typeof value === 'object' && 'type' in value
          ? (value as { type: string }).type === 'exception'
            ? value
            : ok(value as RemoteValue)
          : ok({ type: 'undefined' });
      },
      'script.callFunction': (p) => callFunction(p)
    };
    deps = {
      startFirefox: jest.fn<
        ReturnType<BidiDriverDeps['startFirefox']>,
        Parameters<BidiDriverDeps['startFirefox']>
      >(async () => ({ process: proc, transport, port: 5555 })),
      connect: jest.fn<Promise<BidiTransport>, [string]>(async () => transport),
      stopProcess: jest.fn().mockResolvedValue(true)
    };
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    if (origXdg === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = origXdg;
    delete process.env.PILOT_BLOCKED_ORIGINS;
  });

  it('supports everything except performance tracing', () => {
    expect(BIDI_CAPABILITIES.has('performanceTrace')).toBe(false);
    expect(BIDI_CAPABILITIES.has('accessibilitySnapshot')).toBe(true);
    expect(BIDI_CAPABILITIES.has('connectExisting')).toBe(true);
    expect(driver().capabilities).toBe(BIDI_CAPABILITIES);
  });

  describe('launch', () => {
    it('starts Firefox, opens a session, and reports it', async () => {
      const d = driver();
      const result = await d.launch({
        firefoxPath: '/bin/true',
        headless: true,
        profileName: 'ff1',
        viewport: 'mobile'
      });
      expect(result).toEqual({ headless: true, viewport: 'mobile' });
      expect(deps.startFirefox).toHaveBeenCalledWith({
        firefoxPath: '/bin/true',
        profileDir: resolveFirefoxProfileDir('ff1'),
        headless: true,
        windowWidth: 390,
        windowHeight: 844,
        startupTimeoutMs: 90000
      });
      expect(transport.methods()).toEqual([
        'session.new',
        'session.subscribe',
        'network.addDataCollector',
        'browser.setDownloadBehavior',
        'browsingContext.getTree',
        'browser.getClientWindows',
        'browser.setClientWindowState',
        'browsingContext.setViewport',
        'emulation.setUserAgentOverride',
        'emulation.setTouchOverride'
      ]);
      expect(transport.last('session.new')).toEqual({
        capabilities: {
          alwaysMatch: { unhandledPromptBehavior: { default: 'ignore' } }
        }
      });
      expect(transport.last('browsingContext.setViewport')).toEqual({
        context: 'ctx-1',
        viewport: { width: 390, height: 844 },
        devicePixelRatio: 3
      });
      expect(d.isConnected()).toBe(true);
      expect(d.getSessionInfo()).toEqual({
        browser: 'firefox',
        mode: 'launched',
        connected: true,
        pid: 4321,
        bidiPort: 5555,
        userDataDir: resolveFirefoxProfileDir('ff1'),
        profile: 'ff1'
      });
      expect(
        existsSync(join(resolveFirefoxProfileDir('ff1'), FIREFOX_LOCK_FILE))
      ).toBe(true);
    });

    it('skips the viewport override in responsive mode', async () => {
      await driver().launch({ firefoxPath: '/bin/true', viewport: 'desktop' });
      expect(transport.methods()).not.toContain('browsingContext.setViewport');
      expect(transport.last('browser.setClientWindowState')).toEqual({
        clientWindow: 'win-1',
        state: 'normal',
        width: 1920,
        height: 1080
      });
    });

    it('tolerates optional BiDi features that Firefox lacks', async () => {
      const fail = () => {
        throw new BidiError('x', 'unknown command', '');
      };
      transport.handlers['network.addDataCollector'] = fail;
      transport.handlers['browser.setDownloadBehavior'] = fail;
      transport.handlers['browser.getClientWindows'] = fail;
      transport.handlers['emulation.setUserAgentOverride'] = fail;
      transport.handlers['emulation.setTouchOverride'] = fail;
      const d = driver();
      await d.launch({ firefoxPath: '/bin/true', viewport: 'mobile' });
      expect(d.isConnected()).toBe(true);
    });

    it('creates a tab when Firefox has none', async () => {
      transport.handlers['browsingContext.getTree'] = () => ({ contexts: [] });
      const d = driver();
      await d.launch({ firefoxPath: '/bin/true' });
      expect(transport.methods()).toContain('browsingContext.create');
    });

    it('refuses a profile held by a live process', async () => {
      const dir = resolveFirefoxProfileDir('busy');
      mkdirSync(dir, { recursive: true });
      writeFirefoxLock(dir, process.pid);
      await expect(
        driver().launch({ firefoxPath: '/bin/true', profileName: 'busy' })
      ).rejects.toThrow(
        /Profile "busy" is already in use by another Firefox instance \(pid \d+/
      );
      expect(deps.startFirefox).not.toHaveBeenCalled();
    });

    it('refuses a second launch and a destroyed driver', async () => {
      const d = await launched();
      await expect(d.launch({ firefoxPath: '/bin/true' })).rejects.toThrow(
        'Firefox is already launched'
      );
      await d.destroy();
      await expect(d.launch({ firefoxPath: '/bin/true' })).rejects.toThrow(
        /destroyed/
      );
    });

    it('stops Firefox when the BiDi session cannot start', async () => {
      transport.handlers['session.new'] = () => {
        throw new BidiError('session.new', 'session not created', 'busy');
      };
      const d = driver();
      await expect(d.launch({ firefoxPath: '/bin/true' })).rejects.toThrow(
        /Firefox started but the WebDriver BiDi session failed: session.new failed: session not created \(busy\)/
      );
      expect(deps.stopProcess).toHaveBeenCalledWith(proc);
      expect(d.isConnected()).toBe(false);
    });

    it('releases the profile lock when Firefox exits on its own', async () => {
      await launched({ profileName: 'gone' });
      const lock = join(resolveFirefoxProfileDir('gone'), FIREFOX_LOCK_FILE);
      expect(existsSync(lock)).toBe(true);
      proc.emit('exit', 0, null);
      expect(existsSync(lock)).toBe(false);
    });
  });

  describe('connectExisting', () => {
    it('attaches to a running Firefox and lists its tabs', async () => {
      evaluate = () => str('Title');
      const d = driver();
      const { tabs } = await d.connectExisting({
        host: 'localhost',
        port: 7000
      });
      expect(deps.connect).toHaveBeenCalledWith('ws://localhost:7000/session');
      expect(tabs).toEqual([
        { targetId: 'ctx-1', url: 'about:blank', title: 'Title', active: true },
        {
          targetId: 'ctx-2',
          url: 'https://example.com/',
          title: 'Title',
          active: false
        }
      ]);
      expect(d.getSessionInfo()).toEqual({
        browser: 'firefox',
        mode: 'external',
        connected: true,
        host: 'localhost',
        bidiPort: 7000
      });
      // No viewport is forced on a browser Pilot did not launch.
      expect(transport.methods()).not.toContain('browsingContext.setViewport');

      await d.destroy();
      expect(transport.methods()).toContain('session.end');
      expect(transport.methods()).not.toContain('browser.close');
      expect(deps.stopProcess).not.toHaveBeenCalled();
    });

    it('reports an unreachable port with setup advice', async () => {
      deps.connect.mockRejectedValue(new Error('ECONNREFUSED'));
      const d = driver();
      await expect(d.connectExisting({ port: 1 })).rejects.toThrow(
        /Could not connect to Firefox at 127\.0\.0\.1:1\. Start Firefox with --remote-debugging-port=1/
      );
      expect(d.getSessionInfo()).toEqual({
        browser: 'firefox',
        mode: 'none',
        connected: false
      });
    });

    it('closes the socket when the session is refused', async () => {
      transport.handlers['session.new'] = () => {
        throw new BidiError('session.new', 'session not created', '');
      };
      await expect(driver().connectExisting({})).rejects.toThrow(
        /Could not connect to Firefox at 127\.0\.0\.1:9222/
      );
      expect(transport.closed).toBe(true);
    });

    it('refuses while Pilot owns a launched Firefox', async () => {
      const d = await launched();
      await expect(d.connectExisting({})).rejects.toThrow(/launched by Pilot/);
    });
  });

  describe('destroy', () => {
    it('closes the browser, stops the process, and frees the profile', async () => {
      const d = await launched({ profileName: 'stopme' });
      await d.destroy();
      expect(transport.methods()).toContain('browser.close');
      expect(transport.closed).toBe(true);
      expect(deps.stopProcess).toHaveBeenCalledWith(proc);
      expect(
        existsSync(join(resolveFirefoxProfileDir('stopme'), FIREFOX_LOCK_FILE))
      ).toBe(false);
      expect(d.isConnected()).toBe(false);
    });

    it('keeps the lock when Firefox will not die', async () => {
      deps.stopProcess.mockResolvedValue(false);
      const d = await launched({ profileName: 'stuck' });
      transport.handlers['browser.close'] = () => {
        throw new Error('socket closed');
      };
      await d.destroy();
      expect(
        existsSync(join(resolveFirefoxProfileDir('stuck'), FIREFOX_LOCK_FILE))
      ).toBe(true);
    });
  });

  describe('events', () => {
    it('fills the console buffer from log entries', async () => {
      await launched();
      transport.emit('log.entryAdded', {
        type: 'console',
        method: 'warn',
        level: 'warn',
        text: 'careful',
        stackTrace: {
          callFrames: [
            {
              url: 'https://a/x.js',
              functionName: 'f',
              lineNumber: 3,
              columnNumber: 7
            }
          ]
        }
      });
      expect(sess.consoleBuffer.getAll()).toEqual([
        expect.objectContaining({
          level: 'warn',
          text: 'careful',
          url: 'https://a/x.js',
          lineNumber: 3,
          columnNumber: 7
        })
      ]);
    });

    it('queues dialogs and handles them in their own context', async () => {
      const d = await launched();
      transport.emit('browsingContext.userPromptOpened', {
        context: 'ctx-2',
        type: 'prompt',
        message: 'Name?',
        defaultValue: 'x'
      });
      expect(await d.dialog({ action: 'list' })).toEqual({
        action: 'list',
        dialogs: [{ type: 'prompt', message: 'Name?', defaultPrompt: 'x' }]
      });
      expect(await d.dialog({ action: 'accept', promptText: 'Ann' })).toEqual({
        action: 'accept',
        handled: true
      });
      expect(transport.last('browsingContext.handleUserPrompt')).toEqual({
        context: 'ctx-2',
        accept: true,
        userText: 'Ann'
      });
      expect(await d.dialog({ action: 'dismiss' })).toEqual({
        action: 'dismiss',
        handled: false
      });

      transport.emit('browsingContext.userPromptOpened', {
        context: 'ctx-1',
        type: 'confirm',
        message: 'Sure?'
      });
      await d.dialog({ action: 'dismiss', promptText: 'ignored' });
      expect(transport.last('browsingContext.handleUserPrompt')).toEqual({
        context: 'ctx-1',
        accept: false
      });
    });

    it('tracks downloads from start to end', async () => {
      await launched();
      const file = join(workDir, 'file.bin');
      writeFileSync(file, 'hello');
      transport.emit('browsingContext.downloadWillBegin', {
        download: 'dl-1',
        url: 'https://a/file.bin',
        suggestedFilename: 'file.bin'
      });
      expect(sess.downloadTracker.get('dl-1')).toMatchObject({
        state: 'inProgress',
        suggestedFilename: 'file.bin'
      });
      transport.emit('browsingContext.downloadEnd', {
        download: 'dl-1',
        status: 'complete',
        filepath: file
      });
      expect(sess.downloadTracker.get('dl-1')).toMatchObject({
        state: 'completed',
        receivedBytes: 5,
        totalBytes: 5
      });

      transport.emit('browsingContext.downloadWillBegin', {
        download: 'dl-2',
        url: 'https://a/b'
      });
      transport.emit('browsingContext.downloadEnd', {
        download: 'dl-2',
        status: 'canceled',
        filepath: join(workDir, 'missing')
      });
      expect(sess.downloadTracker.get('dl-2')?.state).toBe('canceled');
    });

    it('invalidates refs when the active tab loads a new document', async () => {
      await launched();
      const generation = sess.elementRefMap.getGeneration();
      transport.emit('browsingContext.domContentLoaded', { context: 'ctx-2' });
      expect(sess.elementRefMap.getGeneration()).toBe(generation);
      transport.emit('browsingContext.domContentLoaded', { context: 'ctx-1' });
      expect(sess.elementRefMap.getGeneration()).toBe(generation + 1);
    });

    it('reports a closed active tab', async () => {
      const d = await launched();
      transport.emit('browsingContext.contextDestroyed', { context: 'ctx-1' });
      await expect(d.pageInfo()).rejects.toThrow(/active tab was closed/);
    });

    it('resets per-connection state when the socket drops', async () => {
      const d = await launched();
      transport.emit('browsingContext.userPromptOpened', {
        context: 'ctx-1',
        type: 'alert',
        message: 'hi'
      });
      transport.drop();
      expect(d.isConnected()).toBe(false);
      expect(sess.dialogQueue.size()).toBe(0);
      await expect(d.pageInfo()).rejects.toThrow(/Browser not started/);
    });
  });

  describe('tabs', () => {
    it('opens a tab, navigates it, and makes it active', async () => {
      const d = await launched();
      await expect(d.newTab('https://example.org/')).resolves.toEqual({
        targetId: 'ctx-new',
        url: 'https://example.org/'
      });
      transport.handlers['browsingContext.getTree'] = () => ({
        contexts: [
          { context: 'ctx-1', url: 'about:blank' },
          { context: 'ctx-new', url: 'https://example.org/' }
        ]
      });
      await d.newTab();
      expect(transport.last('browsingContext.navigate')).toMatchObject({
        context: 'ctx-new',
        url: 'https://example.org/'
      });
    });

    it('blocks new tabs on blocked origins', async () => {
      process.env.PILOT_BLOCKED_ORIGINS = 'evil.test';
      const d = await launched();
      await expect(d.newTab('https://evil.test/')).rejects.toThrow(/blocked/i);
      expect(transport.methods()).not.toContain('browsingContext.create');
    });

    it('switches tabs and re-applies emulation', async () => {
      const d = await launched({ viewport: 'tablet' });
      const generation = sess.elementRefMap.getGeneration();
      await d.switchTab('ctx-2');
      expect(transport.last('browsingContext.activate')).toEqual({
        context: 'ctx-2'
      });
      expect(transport.last('browsingContext.setViewport')).toMatchObject({
        context: 'ctx-2'
      });
      expect(sess.elementRefMap.getGeneration()).toBe(generation + 1);
      transport.calls = [];
      await d.switchTab('ctx-2');
      expect(transport.calls).toEqual([]);
      await expect(d.switchTab('nope')).rejects.toThrow(
        'No page tab found with targetId: nope'
      );
    });

    it('closes inactive tabs only', async () => {
      const d = await launched();
      await d.closeTab('ctx-2');
      expect(transport.last('browsingContext.close')).toEqual({
        context: 'ctx-2'
      });
      await expect(d.closeTab('ctx-1')).rejects.toThrow(
        'Cannot close the active tab'
      );
      await expect(d.closeTab('nope')).rejects.toThrow(/No page tab found/);
    });

    it('lists tabs with an empty title when a tab does not answer', async () => {
      const d = await launched();
      evaluate = (_e, context) => {
        if (context === 'ctx-2') throw new Error('busy');
        return { type: 'exception', exceptionDetails: { text: 'x' } };
      };
      const tabs = await d.listTabs();
      expect(tabs.map((t) => t.title)).toEqual(['', '']);
    });
  });

  describe('page', () => {
    it('navigates and reports the document status', async () => {
      const d = await launched();
      transport.handlers['browsingContext.navigate'] = () => {
        transport.emit('network.beforeRequestSent', {
          navigation: 'nav-1',
          request: { request: 'r1', url: 'https://a/', method: 'GET' }
        });
        transport.emit('network.responseCompleted', {
          navigation: 'nav-1',
          request: { request: 'r1', url: 'https://a/', method: 'GET' },
          response: { url: 'https://a/', status: 404 }
        });
        return { navigation: 'nav-1', url: 'https://a/' };
      };
      evaluate = () => str('https://a/');
      await expect(
        d.navigate({ url: 'https://a/', waitUntil: 'load', timeoutMs: 1000 })
      ).resolves.toEqual({ url: 'https://a/', status: 404 });
      expect(transport.last('browsingContext.navigate')).toEqual({
        context: 'ctx-1',
        url: 'https://a/',
        wait: 'complete'
      });
    });

    it('defaults to status 200 and maps waitUntil', async () => {
      const d = await launched();
      evaluate = () => str('data:text/html,x');
      await expect(
        d.navigate({
          url: 'data:text/html,x',
          waitUntil: 'domcontentloaded',
          timeoutMs: 1000
        })
      ).resolves.toEqual({ url: 'data:text/html,x', status: 200 });
      expect(transport.last('browsingContext.navigate')).toMatchObject({
        wait: 'interactive'
      });
      await d.navigate({
        url: 'data:text/html,x',
        waitUntil: 'networkidle',
        timeoutMs: 1000
      });
    });

    it('blocks navigation to and redirects onto blocked origins', async () => {
      process.env.PILOT_BLOCKED_ORIGINS = 'evil.test';
      const d = await launched();
      await expect(
        d.navigate({
          url: 'https://evil.test/',
          waitUntil: 'load',
          timeoutMs: 1000
        })
      ).rejects.toThrow(/blocked/i);

      evaluate = () => str('https://evil.test/landing');
      await expect(
        d.navigate({
          url: 'https://ok.test/',
          waitUntil: 'load',
          timeoutMs: 1000
        })
      ).rejects.toThrow(/Redirect landed on blocked origin/);
      expect(transport.last('browsingContext.navigate')).toMatchObject({
        url: 'about:blank'
      });
    });

    it('reports navigation timeouts as "timeout"', async () => {
      const d = await launched();
      transport.handlers['browsingContext.navigate'] = () => {
        throw new Error('browsingContext.navigate timed out after 5ms');
      };
      await expect(
        d.navigate({ url: 'https://a/', waitUntil: 'load', timeoutMs: 5 })
      ).rejects.toThrow(/^timeout$/);
      transport.handlers['browsingContext.navigate'] = () => {
        throw new BidiError('browsingContext.navigate', 'unknown error', 'DNS');
      };
      await expect(
        d.navigate({ url: 'https://a/', waitUntil: 'load', timeoutMs: 5 })
      ).rejects.toThrow(/unknown error/);
    });

    it('evaluates expressions and converts results', async () => {
      const d = await launched();
      evaluate = () =>
        obj({ a: num(1), b: { type: 'array', value: [str('x')] } });
      await expect(
        d.evaluate({ expression: 'x', awaitPromise: true, timeoutMs: 1000 })
      ).resolves.toEqual({ value: { a: 1, b: ['x'] }, type: 'object' });
      expect(transport.last('script.evaluate')).toMatchObject({
        expression: 'x',
        awaitPromise: true,
        userActivation: true
      });

      evaluate = () => ({
        type: 'exception',
        exceptionDetails: { text: 'ReferenceError: nope is not defined' }
      });
      await expect(
        d.evaluate({ expression: 'nope', awaitPromise: true, timeoutMs: 1000 })
      ).rejects.toThrow('ReferenceError: nope is not defined');

      transport.handlers['script.evaluate'] = () => new Promise(() => {});
      await expect(
        d.evaluate({ expression: 'hang', awaitPromise: true, timeoutMs: 10 })
      ).rejects.toThrow('timeout');
    });

    it('reads page info', async () => {
      const d = await launched();
      evaluate = () =>
        obj({
          url: str('https://a/'),
          title: str('A'),
          readyState: str('complete')
        });
      await expect(d.pageInfo()).resolves.toEqual({
        url: 'https://a/',
        title: 'A',
        readyState: 'complete'
      });
    });

    it('waits for delays, selectors, and network idle', async () => {
      const d = await launched();
      await expect(d.wait({ ms: 1, timeoutMs: 100 })).resolves.toMatchObject({
        ok: true
      });
      let polls = 0;
      evaluate = () => ({ type: 'boolean', value: ++polls > 1 });
      await d.wait({ selector: '#a', timeoutMs: 1000 });
      expect(polls).toBe(2);
      evaluate = () => ({ type: 'boolean', value: true });
      await d.wait({ selectorVisible: '#a', timeoutMs: 1000 });
      evaluate = () => ({ type: 'boolean', value: false });
      await expect(d.wait({ selector: '#a', timeoutMs: 50 })).rejects.toThrow(
        'timeout waiting for selector: #a'
      );
      await expect(
        d.wait({ selectorVisible: '#b', timeoutMs: 50 })
      ).rejects.toThrow('timeout waiting for visible selector: #b');
      await d.wait({ networkIdle: true, timeoutMs: 100 });
    });

    it('captures png and jpeg screenshots', async () => {
      const d = await launched();
      const png = Buffer.alloc(32);
      png.writeUInt32BE(0x89504e47, 0);
      png.writeUInt32BE(640, 16);
      png.writeUInt32BE(480, 20);
      transport.handlers['browsingContext.captureScreenshot'] = () => ({
        data: png.toString('base64')
      });
      await expect(
        d.screenshot({ format: 'png', quality: 80, fullPage: true })
      ).resolves.toMatchObject({ width: 640, height: 480 });
      expect(transport.last('browsingContext.captureScreenshot')).toEqual({
        context: 'ctx-1',
        origin: 'document',
        format: { type: 'image/png' }
      });
      const jpeg = await d.screenshot({
        format: 'jpeg',
        quality: 50,
        fullPage: false
      });
      expect(jpeg.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(transport.last('browsingContext.captureScreenshot')).toEqual({
        context: 'ctx-1',
        origin: 'viewport',
        format: { type: 'image/jpeg', quality: 0.5 }
      });
    });

    it('resizes the viewport and keeps the mobile user agent', async () => {
      const d = await launched({ viewport: 'mobile' });
      const config = await d.resizeViewport({ width: 500, height: 400 });
      expect(config).toMatchObject({
        width: 500,
        height: 400,
        deviceScaleFactor: 3,
        mobile: true,
        responsive: false
      });
      expect(config.userAgent).toMatch(/Mobile/);
      expect(transport.last('browsingContext.setViewport')).toEqual({
        context: 'ctx-1',
        viewport: { width: 500, height: 400 },
        devicePixelRatio: 3
      });
    });
  });

  describe('inspection', () => {
    it('builds a snapshot with shared-id refs', async () => {
      const d = await launched();
      evaluate = () => obj({ url: str('https://a/'), title: str('A') });
      const ref = await withRef(d);
      expect(ref).toBe('e1');
      expect(sess.elementRefMap.resolveShared('e1')).toBe('node-1');
      const result = await d.snapshot();
      expect(result.text).toContain('[e1] button "Go"');
      expect(transport.last('script.callFunction')).toMatchObject({
        serializationOptions: { maxDomDepth: 0, maxObjectDepth: 5 }
      });

      await expect(d.find({ role: 'button' })).resolves.toMatchObject({
        elements: [expect.objectContaining({ name: 'Go' })]
      });
      await expect(d.find({ role: 'link' })).resolves.toEqual({
        text: 'No elements found matching role="link".',
        elements: []
      });
    });

    it('reports a snapshot script failure', async () => {
      const d = await launched();
      callFunction = () => ({
        type: 'exception',
        exceptionDetails: { text: 'TypeError: x' }
      });
      await expect(d.snapshot()).rejects.toThrow(
        'Snapshot failed: TypeError: x'
      );
    });

    it('returns computed styles without matched rules', async () => {
      const d = await launched();
      const ref = await withRef(d);
      callFunction = () =>
        ok(
          obj({
            computed: obj({ display: str('block') }),
            boxModel: obj({
              content: obj({
                x: num(1),
                y: num(2),
                width: num(3),
                height: num(4)
              }),
              padding: obj({
                top: num(0),
                right: num(0),
                bottom: num(0),
                left: num(0)
              }),
              border: obj({
                top: num(0),
                right: num(0),
                bottom: num(0),
                left: num(0)
              }),
              margin: obj({
                top: num(0),
                right: num(0),
                bottom: num(0),
                left: num(0)
              }),
              width: num(3),
              height: num(4)
            })
          })
        );
      const result = await d.styles({ ref, properties: ['DISPLAY'] });
      expect(result.styles).toMatchObject({
        ref,
        computed: { display: 'block' },
        matched: []
      });
      expect(result.text).toContain('display: block');
      expect(result.text).toContain('Matched Rules: not available in firefox');
      const args = transport.last('script.callFunction')!
        .arguments as unknown[];
      expect(args).toEqual([
        { type: 'array', value: [{ type: 'string', value: 'display' }] }
      ]);

      callFunction = () => ok(obj({ computed: obj({}) }));
      const hidden = await d.styles({ ref });
      expect(hidden.styles.boxModel).toBeUndefined();
    });

    it('turns a missing node into the stale-ref error', async () => {
      const d = await launched();
      const ref = await withRef(d);
      callFunction = () => {
        throw new BidiError('script.callFunction', 'no such node', '');
      };
      await expect(
        d.click({ ref, button: 'left', clickCount: 1, timeoutMs: 1 })
      ).rejects.toMatchObject({ code: 'STALE_ELEMENT_REFERENCE', ref });
      callFunction = () => {
        throw new BidiError('script.callFunction', 'unknown error', '');
      };
      await expect(d.hover({ ref })).rejects.toThrow(/unknown error/);
      await expect(d.hover({ ref: 'e99' })).rejects.toThrow(/stale/);
    });
  });

  describe('input', () => {
    function pointerActions() {
      const actions = transport.last('input.performActions')!.actions as Array<{
        type: string;
        actions: unknown[];
      }>;
      return actions[0];
    }

    it('clicks refs, selectors, and coordinates', async () => {
      const d = await launched();
      const ref = await withRef(d);
      callFunction = () => ok(obj({ x: num(10.4), y: num(20.6) }));
      await expect(
        d.click({ ref, button: 'right', clickCount: 2, timeoutMs: 1 })
      ).resolves.toEqual({ x: 10.4, y: 20.6 });
      expect(pointerActions()).toEqual({
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x: 10, y: 21 },
          { type: 'pointerDown', button: 2 },
          { type: 'pointerUp', button: 2 },
          { type: 'pointerDown', button: 2 },
          { type: 'pointerUp', button: 2 }
        ]
      });

      evaluate = () => obj({ x: num(5), y: num(6) });
      await expect(
        d.click({
          selector: '#b',
          button: 'left',
          clickCount: 1,
          timeoutMs: 100
        })
      ).resolves.toEqual({ x: 5, y: 6 });

      await expect(
        d.click({ x: 1, y: 2, button: 'middle', clickCount: 1, timeoutMs: 1 })
      ).resolves.toEqual({ x: 1, y: 2 });
      expect(pointerActions().actions[1]).toEqual({
        type: 'pointerDown',
        button: 1
      });

      evaluate = () => ({ type: 'null' });
      await expect(
        d.click({
          selector: '#none',
          button: 'left',
          clickCount: 1,
          timeoutMs: 20
        })
      ).rejects.toThrow('timeout waiting for selector: #none');
    });

    it('types text into refs and selectors', async () => {
      const d = await launched();
      const ref = await withRef(d);
      await d.type({ text: 'hi\n', ref, clearFirst: true, delayMs: 0 });
      const keyActions = transport.calls
        .filter((c) => c.method === 'input.performActions')
        .map(
          (c) => (c.params.actions as Array<{ actions: unknown[] }>)[0].actions
        );
      expect(keyActions[0]).toEqual([
        { type: 'keyDown', value: '' },
        { type: 'keyUp', value: '' }
      ]);
      expect(keyActions[1]).toEqual([
        { type: 'keyDown', value: 'h' },
        { type: 'keyUp', value: 'h' },
        { type: 'keyDown', value: 'i' },
        { type: 'keyUp', value: 'i' },
        { type: 'keyDown', value: '' },
        { type: 'keyUp', value: '' }
      ]);

      evaluate = () => ({ type: 'boolean', value: true });
      await d.type({
        text: 'ab',
        selector: '#i',
        clearFirst: false,
        delayMs: 5
      });
      const paced = (
        transport.last('input.performActions')!.actions as Array<{
          actions: unknown[];
        }>
      )[0].actions;
      expect(paced).toEqual([
        { type: 'keyDown', value: 'a' },
        { type: 'keyUp', value: 'a' },
        { type: 'pause', duration: 5 },
        { type: 'keyDown', value: 'b' },
        { type: 'keyUp', value: 'b' }
      ]);

      transport.calls = [];
      await d.type({ text: '', clearFirst: false, delayMs: 0 });
      expect(transport.methods()).not.toContain('input.performActions');

      evaluate = () => ({ type: 'boolean', value: false });
      await expect(
        d.type({
          text: 'x',
          selector: '#missing',
          clearFirst: false,
          delayMs: 0
        })
      ).rejects.toThrow('Element not found: #missing');
    });

    it('fills, selects, and checks form controls', async () => {
      const d = await launched();
      const ref = await withRef(d);
      callFunction = () => ok({ type: 'undefined' });
      await expect(d.fill({ ref, value: 'v' })).resolves.toEqual({
        ref,
        value: 'v'
      });
      expect(transport.last('script.callFunction')).toMatchObject({
        this: { sharedId: 'node-1' },
        arguments: [{ type: 'string', value: 'v' }]
      });

      callFunction = (p) =>
        String(p.functionDeclaration).includes('byValue')
          ? ok(obj({ value: str('b'), label: str('Bee') }))
          : ok({ type: 'undefined' });
      await expect(d.select({ ref, index: 1 })).resolves.toEqual({
        ref,
        selectedValue: 'b',
        selectedLabel: 'Bee'
      });
      expect(transport.last('script.callFunction')!.arguments).toEqual([
        { type: 'null' },
        { type: 'null' },
        { type: 'number', value: 1 }
      ]);

      callFunction = () => ok({ type: 'boolean', value: true });
      await expect(d.check({ ref })).resolves.toEqual({ ref, checked: true });

      callFunction = () => ({
        type: 'exception',
        exceptionDetails: {
          text: 'Error: Element is not a checkbox or radio button'
        }
      });
      await expect(d.check({ ref, checked: false })).rejects.toThrow(
        'Element is not a checkbox or radio button'
      );
    });

    it('hovers and presses keys', async () => {
      const d = await launched();
      await expect(d.hover({ x: 3, y: 4 })).resolves.toEqual({ x: 3, y: 4 });
      await expect(d.hover({})).rejects.toThrow(
        'Either ref or x/y coordinates are required'
      );
      const ref = await withRef(d);
      callFunction = () => ok(obj({ x: num(7), y: num(8) }));
      await expect(d.hover({ ref })).resolves.toEqual({ x: 7, y: 8 });

      await expect(d.pressKey({ key: 'Control+Shift+a' })).resolves.toEqual({
        key: 'a',
        modifiers: ['Control', 'Shift']
      });
      expect(
        (
          transport.last('input.performActions')!.actions as Array<{
            actions: unknown[];
          }>
        )[0].actions
      ).toEqual([
        { type: 'keyDown', value: '' },
        { type: 'keyDown', value: '' },
        { type: 'keyDown', value: 'a' },
        { type: 'keyUp', value: 'a' },
        { type: 'keyUp', value: '' },
        { type: 'keyUp', value: '' }
      ]);
    });

    it('scrolls by ref, direction, and position', async () => {
      const d = await launched();
      evaluate = () => obj({ scrollX: num(0), scrollY: num(300) });
      await expect(d.scroll({ direction: 'down' })).resolves.toEqual({
        scrollX: 0,
        scrollY: 300
      });
      expect(transport.last('input.performActions')!.actions).toEqual([
        {
          type: 'wheel',
          id: 'wheel',
          actions: [{ type: 'scroll', x: 0, y: 0, deltaX: 0, deltaY: 300 }]
        }
      ]);
      await d.scroll({ direction: 'left', amount: 50 });
      expect(
        (
          transport.last('input.performActions')!.actions as Array<{
            actions: Array<{ deltaX: number }>;
          }>
        )[0].actions[0].deltaX
      ).toBe(-50);
      await d.scroll({ direction: 'up' });
      await d.scroll({ direction: 'right' });
      await d.scroll({ y: 1200 });
      expect(transport.last('script.evaluate')!.expression).toBe(
        '({ scrollX: window.scrollX, scrollY: window.scrollY })'
      );
      expect(
        transport.calls.some(
          (c) =>
            c.method === 'script.evaluate' &&
            c.params.expression === 'window.scrollTo(0, 1200)'
        )
      ).toBe(true);
      await d.scroll({});
      const ref = await withRef(d);
      callFunction = () => ok(obj({ x: num(1), y: num(1) }));
      await expect(d.scroll({ ref })).resolves.toEqual({
        scrollX: 0,
        scrollY: 300
      });
    });
  });

  describe('files and diagnostics', () => {
    it('uploads validated files to a file input', async () => {
      const d = await launched();
      const ref = await withRef(d);
      await expect(d.upload({ ref, files: ['package.json'] })).resolves.toEqual(
        {
          ref,
          files: ['package.json']
        }
      );
      expect(transport.last('input.setFiles')).toEqual({
        context: 'ctx-1',
        element: { sharedId: 'node-1' },
        files: [join(process.cwd(), 'package.json')]
      });
      await expect(d.upload({ ref, files: [] })).rejects.toThrow(
        'At least one file is required'
      );
      await expect(d.upload({ ref, files: ['nope.txt'] })).rejects.toThrow(
        /not found/
      );
      transport.handlers['input.setFiles'] = () => {
        throw new BidiError('input.setFiles', 'no such node', '');
      };
      await expect(
        d.upload({ ref, files: ['package.json'] })
      ).rejects.toMatchObject({ code: 'STALE_ELEMENT_REFERENCE' });
      transport.handlers['input.setFiles'] = () => {
        throw new BidiError('input.setFiles', 'unable to set file input', '');
      };
      await expect(d.upload({ ref, files: ['package.json'] })).rejects.toThrow(
        /unable to set file input/
      );
    });

    it('lists, inspects, and clears network requests', async () => {
      const d = await launched();
      transport.emit('network.beforeRequestSent', {
        request: {
          request: 'r9',
          url: 'https://a/api',
          method: 'GET',
          initiatorType: 'fetch'
        }
      });
      transport.emit('network.responseCompleted', {
        request: { request: 'r9', url: 'https://a/api', method: 'GET' },
        response: {
          url: 'https://a/api',
          status: 200,
          mimeType: 'application/json'
        }
      });
      const list = await d.network({ action: 'list', url: 'api' });
      expect(list).toMatchObject({
        action: 'list',
        count: 1,
        requests: [expect.objectContaining({ id: 'r9', resourceType: 'Fetch' })]
      });

      transport.handlers['network.getData'] = () => ({
        bytes: { type: 'string', value: '{"ok":true}' }
      });
      const detail = await d.network({ action: 'get', requestId: 'r9' });
      expect(detail).toMatchObject({
        action: 'get',
        request: { responseBody: '{"ok":true}', bodyTruncated: false }
      });
      expect(transport.last('network.getData')).toEqual({
        dataType: 'response',
        request: 'r9',
        collector: 'col-1'
      });

      transport.handlers['network.getData'] = () => ({
        bytes: {
          type: 'base64',
          value: Buffer.alloc(1024 * 1024 + 10, 'a').toString('base64')
        }
      });
      const big = await d.network({ action: 'get', requestId: 'r9' });
      expect(big).toMatchObject({ request: { bodyTruncated: true } });

      transport.handlers['network.getData'] = () => {
        throw new BidiError('network.getData', 'no such network data', '');
      };
      const none = await d.network({ action: 'get', requestId: 'r9' });
      expect(none).toMatchObject({ request: { id: 'r9' } });
      expect((none as { request: object }).request).not.toHaveProperty(
        'responseBody'
      );

      await expect(d.network({ action: 'get' })).rejects.toThrow(
        'requestId is required'
      );
      await expect(
        d.network({ action: 'get', requestId: 'missing' })
      ).rejects.toThrow('No network request found with id: missing');
      await expect(d.network({ action: 'clear' })).resolves.toEqual({
        action: 'clear',
        cleared: 1
      });
    });

    it('rejects performance tracing', async () => {
      const d = await launched();
      await expect(d.performance()).rejects.toThrow(/not supported by firefox/);
    });
  });

  it('fails clearly before a browser is started', async () => {
    const d = driver();
    await expect(d.pageInfo()).rejects.toThrow(
      'Browser not started. Call browser_start first.'
    );
    await d.destroy();
  });
});

describe('toConsoleMessage', () => {
  it('maps console methods to buffer levels', () => {
    expect(
      toConsoleMessage({
        type: 'console',
        method: 'log',
        level: 'info',
        text: 'a'
      })
    ).toMatchObject({ level: 'log', text: 'a', url: '', lineNumber: 0 });
    expect(
      toConsoleMessage({ type: 'console', method: 'trace', text: 'b' }).level
    ).toBe('debug');
    expect(
      toConsoleMessage({
        type: 'console',
        method: 'table',
        level: 'warn',
        text: null
      })
    ).toMatchObject({ level: 'warn', text: '' });
    expect(toConsoleMessage({ type: 'console' }).level).toBe('log');
  });

  it('records uncaught exceptions as errors with stack frames', () => {
    const msg = toConsoleMessage({
      type: 'javascript',
      level: 'error',
      text: 'Error: boom',
      stackTrace: {
        callFrames: [
          {
            url: 'https://a/x.js',
            functionName: '',
            lineNumber: 1,
            columnNumber: 2
          }
        ]
      }
    });
    expect(msg).toMatchObject({
      level: 'error',
      text: 'Error: boom',
      isException: true,
      url: 'https://a/x.js',
      stackFrames: [
        {
          url: 'https://a/x.js',
          functionName: '',
          lineNumber: 1,
          columnNumber: 2
        }
      ]
    });
  });
});
