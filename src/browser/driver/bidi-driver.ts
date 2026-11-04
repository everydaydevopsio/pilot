import type { ChildProcess } from 'child_process';
import { mkdirSync, statSync } from 'fs';
import { basename, resolve as resolvePath } from 'path';
import { getLogger } from '../../util/logger.js';
import type { Config } from '../../util/config.js';
import { resolveViewport, type ViewportConfig } from '../../viewport.js';
import type { ConsoleLevel, ConsoleMessage } from '../../mcp/console-buffer.js';
import {
  BidiConnection,
  BidiError,
  type BidiTransport
} from '../bidi/connection.js';
import {
  BACKSPACE_KEY,
  chordActions,
  parseKeyCombo,
  textActions
} from '../bidi/keys.js';
import { BidiNetworkMonitor } from '../bidi/network.js';
import {
  cdpTypeOf,
  deserialize,
  exceptionText,
  toLocalValue,
  type EvaluateResultMessage,
  type RemoteValue
} from '../bidi/remote-value.js';
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  findFreePort
} from '../chrome-launcher.js';
import {
  bidiUrl,
  findFirefoxExecutable,
  isFirefoxProfileLocked,
  launchFirefox,
  readFirefoxLock,
  removeFirefoxLock,
  resolveFirefoxProfileDir,
  waitForBidiReady,
  writeFirefoxLock,
  writeUserPrefs
} from '../firefox-launcher.js';
import {
  DOM_SNAPSHOT_FUNCTION,
  toElementInfo
} from '../inspect/dom-snapshot.js';
import { formatSnapshot } from '../inspect/snapshot.js';
import {
  DEFAULT_PROPERTIES,
  formatStyles,
  type StylesResult
} from '../inspect/styles.js';
import type { SnapshotResult } from '../inspect/types.js';
import { getDownloadDir } from '../interaction/downloads.js';
import { SET_FIELD_VALUE_FUNCTION } from '../interaction/events.js';
import { validateUploadFiles } from '../interaction/uploads.js';
import { stopBrowserProcess } from '../process.js';
import { checkOrigin } from '../security/origins.js';
import type { LaunchOptions, SessionInfo, TabInfo } from '../types.js';
import {
  TOGGLE_CHECK_FUNCTION,
  type CheckParams
} from '../../commands/check.js';
import type { ClickParams } from '../../commands/click.js';
import type { DialogParams, DialogResult } from '../../commands/dialog.js';
import type {
  EvaluateParams,
  EvaluateResult
} from '../../commands/evaluate.js';
import type { FillParams } from '../../commands/fill.js';
import { findInSnapshot, type FindQuery } from '../../commands/find.js';
import type { HoverParams } from '../../commands/hover.js';
import type {
  NavigateParams,
  NavigateResult
} from '../../commands/navigate.js';
import type { NetworkParams, NetworkResult } from '../../commands/network.js';
import type { PageInfoResult } from '../../commands/page_info.js';
import type { PressKeyParams } from '../../commands/press_key.js';
import type {
  ScreenshotParams,
  ScreenshotResult
} from '../../commands/screenshot.js';
import type { ScrollParams, ScrollResult } from '../../commands/scroll.js';
import {
  SELECT_OPTION_FUNCTION,
  type SelectParams
} from '../../commands/select.js';
import type { SnapshotCommandResult } from '../../commands/snapshot.js';
import type {
  StylesCommandResult,
  StylesParams
} from '../../commands/styles.js';
import type { NewTabResult } from '../../commands/tabs.js';
import type { TypeParams } from '../../commands/type.js';
import type { UploadParams, UploadResult } from '../../commands/upload.js';
import type { WaitParams, WaitResult } from '../../commands/wait.js';
import {
  CAPABILITIES,
  type BrowserDriver,
  type Capability,
  type ConnectExistingOptions,
  type DriverSession,
  type ViewportResizeParams
} from './types.js';

/**
 * Everything except performance tracing: BiDi has no tracing domain. Styles
 * are computed in the page, without CSS rule matching.
 */
export const BIDI_CAPABILITIES: ReadonlySet<Capability> = new Set(
  CAPABILITIES.filter((c) => c !== 'performanceTrace')
);

const MAX_RESPONSE_BODY_SIZE = 1024 * 1024;
const DATA_COLLECTOR_MAX_BYTES = 10 * 1024 * 1024;

const EVENTS = [
  'log.entryAdded',
  'network.beforeRequestSent',
  'network.responseCompleted',
  'network.fetchError',
  'browsingContext.userPromptOpened',
  'browsingContext.downloadWillBegin',
  'browsingContext.downloadEnd',
  'browsingContext.domContentLoaded',
  'browsingContext.contextDestroyed'
];

export interface FirefoxProcess {
  process: ChildProcess;
  transport: BidiTransport;
  port: number;
}

export interface StartFirefoxOptions {
  firefoxPath: string;
  profileDir: string;
  headless: boolean;
  windowWidth: number;
  windowHeight: number;
  startupTimeoutMs: number;
}

/** Process and socket plumbing, injectable so tests need no real Firefox. */
export interface BidiDriverDeps {
  startFirefox(opts: StartFirefoxOptions): Promise<FirefoxProcess>;
  connect(url: string): Promise<BidiTransport>;
  stopProcess(proc: ChildProcess): Promise<boolean>;
}

async function startFirefoxProcess(
  opts: StartFirefoxOptions
): Promise<FirefoxProcess> {
  const port = await findFreePort();
  writeUserPrefs(opts.profileDir);
  const proc = launchFirefox({ ...opts, port });

  const stderr: string[] = [];
  let failure: Error | null = null;
  proc.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()));
  proc.on('error', (err) => {
    failure = new Error(
      `Firefox failed to start (${opts.firefoxPath}): ${err.message}`,
      { cause: err }
    );
  });
  proc.on('exit', (code, signal) => {
    failure ??= new Error(
      `Firefox exited (${signal ? `signal ${signal}` : `exit code ${code}`}) before WebDriver BiDi became ready on port ${port}.` +
        (stderr.length
          ? ` Firefox stderr: ${stderr.join('').trim().slice(-1000)}`
          : '')
    );
  });

  try {
    const transport = await waitForBidiReady(
      port,
      opts.startupTimeoutMs,
      () => failure
    );
    return { process: proc, transport, port };
  } catch (err) {
    await stopBrowserProcess(proc);
    throw err;
  }
}

const DEFAULT_DEPS: BidiDriverDeps = {
  startFirefox: startFirefoxProcess,
  connect: (url) => BidiConnection.connect(url),
  stopProcess: stopBrowserProcess
};

const BUTTONS = { left: 0, middle: 1, right: 2 } as const;

const CONSOLE_METHOD_LEVELS: Record<string, ConsoleLevel> = {
  log: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
  trace: 'debug',
  assert: 'error'
};

const CONSOLE_ENTRY_LEVELS: Record<string, ConsoleLevel> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error'
};

interface LogEntry {
  type: string;
  level?: string;
  method?: string;
  text?: string | null;
  timestamp?: number;
  stackTrace?: {
    callFrames?: Array<{
      url: string;
      functionName: string;
      lineNumber: number;
      columnNumber: number;
    }>;
  };
}

/** Turn a BiDi log entry into the console buffer's message shape. */
export function toConsoleMessage(entry: LogEntry): ConsoleMessage {
  const frames = entry.stackTrace?.callFrames ?? [];
  const top = frames[0];
  const isException = entry.type === 'javascript';
  const level: ConsoleLevel = isException
    ? 'error'
    : (CONSOLE_METHOD_LEVELS[entry.method ?? ''] ??
      CONSOLE_ENTRY_LEVELS[entry.level ?? ''] ??
      'log');
  return {
    level,
    text: entry.text ?? '',
    url: top?.url ?? '',
    lineNumber: top?.lineNumber ?? 0,
    ...(top && { columnNumber: top.columnNumber }),
    timestamp: Date.now(),
    ...(isException && {
      isException: true,
      stackFrames: frames.map((f) => ({
        url: f.url,
        functionName: f.functionName,
        lineNumber: f.lineNumber,
        columnNumber: f.columnNumber
      }))
    })
  };
}

// Scroll an element into view when it is not fully visible, then report the
// centre of its border box in viewport coordinates.
const ELEMENT_CENTER_FUNCTION = `function() {
  var r = this.getBoundingClientRect();
  if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) {
    this.scrollIntoView({ block: 'center', inline: 'center' });
    r = this.getBoundingClientRect();
  }
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}`;

const COMPUTED_STYLES_FUNCTION = `function(properties) {
  var cs = getComputedStyle(this);
  var computed = {};
  for (var i = 0; i < properties.length; i++) {
    var v = cs.getPropertyValue(properties[i]);
    if (v !== '') computed[properties[i]] = v;
  }
  var r = this.getBoundingClientRect();
  if (cs.display === 'none') return { computed: computed };
  function px(n) { return Math.round(parseFloat(cs.getPropertyValue(n)) || 0); }
  function edges(prefix, suffix) {
    return { top: px(prefix + 'top' + suffix), right: px(prefix + 'right' + suffix),
      bottom: px(prefix + 'bottom' + suffix), left: px(prefix + 'left' + suffix) };
  }
  var padding = edges('padding-', '');
  var border = edges('border-', '-width');
  var margin = edges('margin-', '');
  return {
    computed: computed,
    boxModel: {
      content: {
        x: Math.round(r.left + border.left + padding.left),
        y: Math.round(r.top + border.top + padding.top),
        width: Math.round(r.width - border.left - border.right - padding.left - padding.right),
        height: Math.round(r.height - border.top - border.bottom - padding.top - padding.bottom)
      },
      padding: padding, border: border, margin: margin,
      width: Math.round(r.width), height: Math.round(r.height)
    }
  };
}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function pngSize(base64: string): { width: number; height: number } {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  return { width: 0, height: 0 };
}

/**
 * Firefox driver over WebDriver BiDi. It owns the Firefox process (when it
 * launched one), the BiDi session, and the active browsing context, and
 * fills the shared session buffers from BiDi events.
 */
export class BidiDriver implements BrowserDriver {
  readonly kind = 'firefox' as const;
  readonly capabilities = BIDI_CAPABILITIES;

  private transport: BidiTransport | null = null;
  private process: ChildProcess | null = null;
  private profileDir: string | null = null;
  private port: number | null = null;
  private external: { host: string; port: number } | null = null;
  private context: string | null = null;
  private viewport: ViewportConfig | null = null;
  private collector: string | null = null;
  private destroyed = false;
  private intentionalClose = false;
  private readonly netMonitor: BidiNetworkMonitor;
  /** Browsing context of each queued dialog, in DialogQueue order. */
  private dialogContexts: string[] = [];

  constructor(
    private readonly session: DriverSession,
    private readonly config: Config,
    private readonly deps: BidiDriverDeps = DEFAULT_DEPS
  ) {
    this.netMonitor = new BidiNetworkMonitor(session.networkBuffer);
  }

  static create(config: Config, session: DriverSession): BidiDriver {
    return new BidiDriver(session, config);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async launch(
    opts: LaunchOptions = {}
  ): Promise<{ headless: boolean; viewport: string }> {
    if (this.process) throw new Error('Firefox is already launched');
    if (this.destroyed) {
      throw new Error('BidiDriver has been destroyed; create a new instance');
    }

    const firefoxPath = findFirefoxExecutable(
      opts.firefoxPath ?? this.config.firefoxPath
    );
    const profileName = opts.profileName ?? this.config.profileName;
    const profileDir = resolveFirefoxProfileDir(profileName);
    if (isFirefoxProfileLocked(profileDir)) {
      const owner = readFirefoxLock(profileDir);
      throw new Error(
        `Profile "${profileName}" is already in use by another Firefox instance` +
          (owner ? ` (pid ${owner.pid} on ${owner.lockHost})` : '') +
          `. Stop it or call browser_start with a different profileName.`
      );
    }

    const viewportPreset = opts.viewport ?? this.config.viewport;
    this.viewport = resolveViewport({
      preset: viewportPreset,
      width: opts.viewportWidth,
      height: opts.viewportHeight,
      deviceScaleFactor: opts.deviceScaleFactor,
      responsive: opts.responsive ?? this.config.responsive
    });
    const headless = opts.headless ?? this.config.headless;

    mkdirSync(profileDir, { recursive: true });
    const started = await this.deps.startFirefox({
      firefoxPath,
      profileDir,
      headless,
      windowWidth: this.viewport.width,
      windowHeight: this.viewport.height,
      startupTimeoutMs: opts.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS
    });

    const pid = started.process.pid;
    if (pid !== undefined) writeFirefoxLock(profileDir, pid);
    this.process = started.process;
    this.profileDir = profileDir;
    this.port = started.port;
    started.process.on('exit', () => {
      if (this.process === started.process) {
        this.process = null;
        this.port = null;
        if (pid !== undefined) removeFirefoxLock(profileDir, pid);
      }
    });

    try {
      await this.attach(started.transport);
    } catch (err) {
      await this.destroy();
      throw new Error(
        `Firefox started but the WebDriver BiDi session failed: ${(err as Error).message}`,
        { cause: err }
      );
    }
    return { headless, viewport: viewportPreset };
  }

  async connectExisting(
    opts: ConnectExistingOptions
  ): Promise<{ tabs: TabInfo[] }> {
    if (this.process) {
      throw new Error(
        'Firefox was launched by Pilot. Use browser_stop first, then browser_connect.'
      );
    }
    const host = opts.host ?? '127.0.0.1';
    const port = opts.port ?? 9222;
    try {
      const transport = await this.deps.connect(bidiUrl(host, port));
      this.external = { host, port };
      await this.attach(transport);
    } catch (cause) {
      await this.transport?.close();
      this.transport = null;
      this.external = null;
      throw new Error(
        `Could not connect to Firefox at ${host}:${port}. ` +
          `Start Firefox with --remote-debugging-port=${port} (and no other WebDriver session attached) or use browser_start to launch a new instance.`,
        { cause }
      );
    }
    return { tabs: await this.listTabs() };
  }

  private async attach(transport: BidiTransport): Promise<void> {
    this.transport = transport;
    transport.onClose(() => this.onTransportClosed(transport));
    this.listen(transport);

    await transport.send('session.new', {
      capabilities: {
        alwaysMatch: { unhandledPromptBehavior: { default: 'ignore' } }
      }
    });
    await transport.send('session.subscribe', { events: EVENTS });

    try {
      const { collector } = await transport.send<{ collector: string }>(
        'network.addDataCollector',
        {
          dataTypes: ['response'],
          maxEncodedDataSize: DATA_COLLECTOR_MAX_BYTES
        }
      );
      this.collector = collector;
    } catch (err) {
      getLogger().warn({ err }, 'Firefox cannot collect response bodies');
    }
    try {
      await transport.send('browser.setDownloadBehavior', {
        downloadBehavior: {
          type: 'allowed',
          destinationFolder: getDownloadDir()
        }
      });
    } catch (err) {
      getLogger().warn({ err }, 'Firefox download behavior not set');
    }

    const contexts = await this.topLevelContexts();
    if (contexts.length === 0) {
      const { context } = await transport.send<{ context: string }>(
        'browsingContext.create',
        { type: 'tab' }
      );
      this.context = context;
    } else {
      this.context = contexts[0].context;
    }
    await this.resizeWindow();
    await this.applyEmulation(this.context);
    getLogger().info({ context: this.context }, 'Connected to Firefox');
  }

  private listen(transport: BidiTransport): void {
    this.netMonitor.attach(transport);
    transport.on('log.entryAdded', (p) => {
      this.session.consoleBuffer.push(
        toConsoleMessage(p as unknown as LogEntry)
      );
    });
    transport.on('browsingContext.userPromptOpened', (p) => {
      this.session.dialogQueue.push({
        type: String(p.type),
        message: String(p.message ?? ''),
        defaultPrompt:
          typeof p.defaultValue === 'string' ? p.defaultValue : undefined,
        timestamp: Date.now()
      });
      this.dialogContexts.push(String(p.context));
    });
    transport.on('browsingContext.downloadWillBegin', (p) => {
      this.session.downloadTracker.track({
        guid: String(p.download ?? p.navigation),
        url: String(p.url),
        suggestedFilename: String(p.suggestedFilename ?? ''),
        state: 'inProgress',
        receivedBytes: 0,
        totalBytes: 0,
        timestamp: Date.now()
      });
    });
    transport.on('browsingContext.downloadEnd', (p) => {
      let bytes = 0;
      if (typeof p.filepath === 'string') {
        try {
          bytes = statSync(p.filepath).size;
        } catch {
          // file may already be gone
        }
      }
      this.session.downloadTracker.update(String(p.download ?? p.navigation), {
        state: p.status === 'complete' ? 'completed' : 'canceled',
        receivedBytes: bytes,
        totalBytes: bytes
      });
    });
    transport.on('browsingContext.domContentLoaded', (p) => {
      if (p.context === this.context) this.session.elementRefMap.invalidate();
    });
    transport.on('browsingContext.contextDestroyed', (p) => {
      if (p.context === this.context) this.context = null;
    });
  }

  private onTransportClosed(transport: BidiTransport): void {
    if (this.transport !== transport) return;
    this.transport = null;
    this.context = null;
    this.netMonitor.reset();
    this.session.dialogQueue.clear();
    this.dialogContexts = [];
    this.session.downloadTracker.clear();
    if (!this.intentionalClose) {
      getLogger().warn('Firefox WebDriver BiDi connection closed');
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.intentionalClose = true;
    const transport = this.transport;
    if (transport) {
      try {
        if (this.process) {
          await transport.send('browser.close', {}, 5000);
        } else {
          await transport.send('session.end', {}, 5000);
        }
      } catch {
        // Firefox may close the socket before answering browser.close
      }
      await transport.close();
      this.transport = null;
    }
    this.external = null;
    this.context = null;
    this.netMonitor.reset();

    const proc = this.process;
    const profileDir = this.profileDir;
    if (proc) {
      this.process = null;
      this.port = null;
      const stopped = await this.deps.stopProcess(proc);
      if (stopped && proc.pid !== undefined && profileDir) {
        removeFirefoxLock(profileDir, proc.pid);
      } else if (!stopped) {
        getLogger().warn(
          { pid: proc.pid },
          'Firefox did not exit after SIGKILL; leaving its profile lock in place'
        );
      }
    }
  }

  isConnected(): boolean {
    return this.transport !== null;
  }

  getSessionInfo(): SessionInfo {
    const connected = this.transport !== null;
    if (this.external) {
      return {
        browser: this.kind,
        mode: 'external',
        connected,
        host: this.external.host,
        bidiPort: this.external.port
      };
    }
    if (this.process) {
      return {
        browser: this.kind,
        mode: 'launched',
        connected,
        pid: this.process.pid,
        bidiPort: this.port ?? undefined,
        userDataDir: this.profileDir ?? undefined,
        profile: this.profileDir ? basename(this.profileDir) : undefined
      };
    }
    return { browser: this.kind, mode: 'none', connected: false };
  }

  // ── BiDi plumbing ───────────────────────────────────────────────────────

  private bidi(): BidiTransport {
    if (!this.transport) {
      throw new Error('Browser not started. Call browser_start first.');
    }
    return this.transport;
  }

  private activeContext(): string {
    this.bidi();
    if (!this.context) {
      throw new Error(
        'The active tab was closed. Use browser_list_tabs and browser_switch_tab to pick another.'
      );
    }
    return this.context;
  }

  private async topLevelContexts(): Promise<
    Array<{ context: string; url: string }>
  > {
    const { contexts } = await this.bidi().send<{
      contexts: Array<{ context: string; url: string }>;
    }>('browsingContext.getTree', { maxDepth: 0 });
    return contexts;
  }

  /**
   * Size the window to the viewport, as the CDP driver does: Firefox
   * restores a window size saved in a reused profile over --window-size.
   */
  private async resizeWindow(): Promise<void> {
    const vp = this.viewport;
    if (!vp || !this.transport) return;
    try {
      const { clientWindows } = await this.transport.send<{
        clientWindows: Array<{ clientWindow: string }>;
      }>('browser.getClientWindows');
      for (const { clientWindow } of clientWindows) {
        await this.transport.send('browser.setClientWindowState', {
          clientWindow,
          state: 'normal',
          width: vp.width,
          height: vp.height
        });
      }
    } catch (err) {
      getLogger().warn({ err }, 'Firefox window resize failed');
    }
  }

  private async applyEmulation(context: string): Promise<void> {
    const vp = this.viewport;
    if (!vp || !this.transport) return;
    if (!vp.responsive) {
      await this.transport.send('browsingContext.setViewport', {
        context,
        viewport: { width: vp.width, height: vp.height },
        devicePixelRatio: vp.deviceScaleFactor
      });
    }
    if (vp.userAgent) {
      try {
        await this.transport.send('emulation.setUserAgentOverride', {
          userAgent: vp.userAgent,
          contexts: [context]
        });
      } catch (err) {
        getLogger().warn({ err }, 'Firefox user agent override failed');
      }
    }
    if (vp.mobile) {
      try {
        await this.transport.send('emulation.setTouchOverride', {
          maxTouchPoints: 5,
          contexts: [context]
        });
      } catch {
        // Touch emulation is newer than BiDi itself; best effort.
      }
    }
  }

  private async evaluateRaw(
    expression: string,
    awaitPromise = true
  ): Promise<RemoteValue> {
    const result = await this.bidi().send<EvaluateResultMessage>(
      'script.evaluate',
      {
        expression,
        target: { context: this.activeContext() },
        awaitPromise,
        resultOwnership: 'none',
        userActivation: true,
        serializationOptions: { maxDomDepth: 0 }
      }
    );
    if (result.type === 'exception') {
      throw new Error(exceptionText(result.exceptionDetails));
    }
    return result.result;
  }

  private async evaluateValue<T>(expression: string): Promise<T> {
    return deserialize(await this.evaluateRaw(expression)) as T;
  }

  /** Call a function with an element ref as `this`; stale refs throw the stale-ref error. */
  private async callOnRef<T>(
    ref: string,
    functionDeclaration: string,
    args: unknown[] = []
  ): Promise<T> {
    const sharedId = this.session.elementRefMap.resolveShared(ref);
    let result: EvaluateResultMessage;
    try {
      result = await this.bidi().send<EvaluateResultMessage>(
        'script.callFunction',
        {
          functionDeclaration,
          this: { sharedId },
          arguments: args.map(toLocalValue),
          target: { context: this.activeContext() },
          awaitPromise: true,
          resultOwnership: 'none',
          userActivation: true
        }
      );
    } catch (err) {
      if (err instanceof BidiError && err.error === 'no such node') {
        throw this.session.elementRefMap.stale(ref);
      }
      throw err;
    }
    if (result.type === 'exception') {
      throw new Error(exceptionText(result.exceptionDetails));
    }
    return deserialize(result.result) as T;
  }

  private performActions(actions: unknown[]): Promise<unknown> {
    return this.bidi().send('input.performActions', {
      context: this.activeContext(),
      actions
    });
  }

  private keys(actions: unknown[]): Promise<unknown> {
    return this.performActions([{ type: 'key', id: 'keyboard', actions }]);
  }

  private pointer(actions: unknown[]): Promise<unknown> {
    return this.performActions([
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions
      }
    ]);
  }

  private refCenter(ref: string): Promise<{ x: number; y: number }> {
    return this.callOnRef(ref, ELEMENT_CENTER_FUNCTION);
  }

  private focusRef(ref: string): Promise<unknown> {
    return this.callOnRef(ref, 'function() { this.focus(); }');
  }

  private async pollSelector<T>(
    expression: string,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = await this.evaluateValue<T | null>(expression);
      if (value !== null && value !== undefined && value !== false) {
        return value;
      }
      await sleep(100);
    }
    throw new Error(message);
  }

  private async scrollPosition(): Promise<ScrollResult> {
    return this.evaluateValue<ScrollResult>(
      '({ scrollX: window.scrollX, scrollY: window.scrollY })'
    );
  }

  // ── Tabs ────────────────────────────────────────────────────────────────

  async listTabs(): Promise<TabInfo[]> {
    const contexts = await this.topLevelContexts();
    return Promise.all(
      contexts.map(async ({ context, url }) => {
        let title = '';
        try {
          const r = await this.bidi().send<EvaluateResultMessage>(
            'script.evaluate',
            {
              expression: 'document.title',
              target: { context },
              awaitPromise: false,
              resultOwnership: 'none'
            },
            5000
          );
          if (r.type === 'success') title = String(deserialize(r.result) ?? '');
        } catch {
          // a tab showing a dialog or error page may not answer
        }
        return {
          targetId: context,
          url,
          title,
          active: context === this.context
        };
      })
    );
  }

  async newTab(url?: string): Promise<NewTabResult> {
    if (url) {
      const check = checkOrigin(url);
      if (!check.allowed) {
        throw new Error(check.reason ?? 'Navigation blocked by origin policy');
      }
    }
    const { context } = await this.bidi().send<{ context: string }>(
      'browsingContext.create',
      { type: 'tab' }
    );
    if (url) {
      await this.bidi().send('browsingContext.navigate', {
        context,
        url,
        wait: 'none'
      });
    }
    await this.activate(context);
    return { targetId: context, url: url ?? 'about:blank' };
  }

  async closeTab(targetId: string): Promise<void> {
    if (targetId === this.context) {
      throw new Error(
        'Cannot close the active tab. Switch to another tab first.'
      );
    }
    const contexts = await this.topLevelContexts();
    if (!contexts.some((c) => c.context === targetId)) {
      throw new Error(`No page tab found with targetId: ${targetId}`);
    }
    await this.bidi().send('browsingContext.close', { context: targetId });
  }

  async switchTab(targetId: string): Promise<void> {
    if (targetId === this.context) return;
    const contexts = await this.topLevelContexts();
    if (!contexts.some((c) => c.context === targetId)) {
      throw new Error(`No page tab found with targetId: ${targetId}`);
    }
    await this.activate(targetId);
  }

  private async activate(targetId: string): Promise<void> {
    await this.bidi().send('browsingContext.activate', { context: targetId });
    this.context = targetId;
    this.session.elementRefMap.invalidate();
    await this.applyEmulation(targetId);
  }

  // ── Page ────────────────────────────────────────────────────────────────

  async navigate(params: NavigateParams): Promise<NavigateResult> {
    const originCheck = checkOrigin(params.url);
    if (!originCheck.allowed) {
      throw new Error(
        originCheck.reason ?? 'Navigation blocked by origin policy'
      );
    }
    const context = this.activeContext();
    // networkidle waits for the DOM, then for the network to settle.
    const wait = params.waitUntil === 'load' ? 'complete' : 'interactive';
    const started = Date.now();

    let navigation: string | null;
    try {
      ({ navigation } = await this.bidi().send<{ navigation: string | null }>(
        'browsingContext.navigate',
        { context, url: params.url, wait },
        params.timeoutMs
      ));
    } catch (err) {
      if ((err as Error).message.includes('timed out'))
        throw new Error('timeout', { cause: err });
      throw err;
    }
    this.session.elementRefMap.invalidate();
    if (params.waitUntil === 'networkidle') {
      await this.netMonitor.waitForIdle(
        Math.max(1, params.timeoutMs - (Date.now() - started))
      );
    }

    const url = String(
      (await this.evaluateValue<string>('location.href')) ?? params.url
    );
    const finalCheck = checkOrigin(url);
    if (!finalCheck.allowed) {
      await this.bidi().send('browsingContext.navigate', {
        context,
        url: 'about:blank',
        wait: 'none'
      });
      throw new Error(
        `Redirect landed on blocked origin: ${finalCheck.reason}`
      );
    }
    const status =
      (navigation && this.netMonitor.statusForNavigation(navigation)) || 200;
    return { url, status };
  }

  pageInfo(): Promise<PageInfoResult> {
    return this.evaluateValue<PageInfoResult>(
      '({ url: location.href, title: document.title, readyState: document.readyState })'
    );
  }

  async evaluate(params: EvaluateParams): Promise<EvaluateResult> {
    const result = await withTimeout(
      this.evaluateRaw(params.expression, params.awaitPromise),
      params.timeoutMs
    );
    return { value: deserialize(result), type: cdpTypeOf(result) };
  }

  async wait(params: WaitParams): Promise<WaitResult> {
    const start = Date.now();
    if (params.ms !== undefined) {
      await sleep(params.ms);
    } else if (params.selector !== undefined) {
      await this.pollSelector(
        `!!document.querySelector(${JSON.stringify(params.selector)})`,
        params.timeoutMs,
        `timeout waiting for selector: ${params.selector}`
      );
    } else if (params.selectorVisible !== undefined) {
      await this.pollSelector(
        `(function() {
          var el = document.querySelector(${JSON.stringify(params.selectorVisible)});
          if (!el) return false;
          var r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })()`,
        params.timeoutMs,
        `timeout waiting for visible selector: ${params.selectorVisible}`
      );
    } else if (params.networkIdle) {
      await this.netMonitor.waitForIdle(params.timeoutMs);
    }
    return { ok: true, elapsed: Date.now() - start };
  }

  async screenshot(params: ScreenshotParams): Promise<ScreenshotResult> {
    const mime = params.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const { data } = await this.bidi().send<{ data: string }>(
      'browsingContext.captureScreenshot',
      {
        context: this.activeContext(),
        origin: params.fullPage ? 'document' : 'viewport',
        format: {
          type: mime,
          ...(params.format === 'jpeg' && { quality: params.quality / 100 })
        }
      }
    );
    const { width, height } =
      params.format === 'png' ? pngSize(data) : { width: 0, height: 0 };
    return { dataUrl: `data:${mime};base64,${data}`, width, height };
  }

  async resizeViewport(params: ViewportResizeParams): Promise<ViewportConfig> {
    const context = this.activeContext();
    const current = this.viewport;
    const mobile = params.mobile ?? current?.mobile ?? false;
    const config: ViewportConfig = {
      width: params.width,
      height: params.height,
      deviceScaleFactor:
        params.deviceScaleFactor ?? current?.deviceScaleFactor ?? 1,
      mobile,
      responsive: false,
      ...(mobile && current?.userAgent && { userAgent: current.userAgent })
    };
    this.viewport = config;
    await this.applyEmulation(context);
    return config;
  }

  // ── Inspection ──────────────────────────────────────────────────────────

  private async buildSnapshot(): Promise<SnapshotResult> {
    const refMap = this.session.elementRefMap;
    refMap.resetRefs();
    const result = await this.bidi().send<EvaluateResultMessage>(
      'script.callFunction',
      {
        functionDeclaration: DOM_SNAPSHOT_FUNCTION,
        target: { context: this.activeContext() },
        awaitPromise: false,
        resultOwnership: 'none',
        serializationOptions: { maxDomDepth: 0, maxObjectDepth: 5 }
      }
    );
    if (result.type === 'exception') {
      throw new Error(
        `Snapshot failed: ${exceptionText(result.exceptionDetails)}`
      );
    }
    const pairs = (result.result.value ?? []) as RemoteValue[];
    const elements = pairs.flatMap((pair) => {
      const [node, info] = (pair.value ?? []) as RemoteValue[];
      if (!node?.sharedId) return [];
      const ref = refMap.nextRef();
      refMap.setShared(ref, node.sharedId);
      return [toElementInfo(ref, deserialize(info))];
    });
    const page = await this.evaluateValue<
      { url?: string; title?: string } | undefined
    >('({ url: document.URL, title: document.title })');
    return {
      url: page?.url ?? '',
      title: page?.title ?? '',
      timestamp: Date.now(),
      elements
    };
  }

  async snapshot(): Promise<SnapshotCommandResult> {
    const snapshot = await this.buildSnapshot();
    return { text: formatSnapshot(snapshot), snapshot };
  }

  async find(query: FindQuery) {
    return findInSnapshot(await this.buildSnapshot(), query);
  }

  async styles(params: StylesParams): Promise<StylesCommandResult> {
    const properties = params.properties
      ? params.properties.map((p) => p.toLowerCase())
      : [...DEFAULT_PROPERTIES];
    const result = await this.callOnRef<
      Pick<StylesResult, 'computed' | 'boxModel'>
    >(params.ref, COMPUTED_STYLES_FUNCTION, [properties]);
    const styles: StylesResult = {
      ref: params.ref,
      computed: result.computed ?? {},
      matched: [],
      ...(result.boxModel && { boxModel: result.boxModel })
    };
    const text =
      formatStyles(styles) +
      '\n\nMatched Rules: not available in firefox (WebDriver BiDi has no CSS rule matching).';
    return { text, styles };
  }

  // ── Input ───────────────────────────────────────────────────────────────

  async click(params: ClickParams) {
    let x: number;
    let y: number;
    if (params.ref !== undefined) {
      ({ x, y } = await this.refCenter(params.ref));
    } else if (params.selector !== undefined) {
      ({ x, y } = await this.pollSelector<{ x: number; y: number }>(
        `(function() {
          var el = document.querySelector(${JSON.stringify(params.selector)});
          if (!el) return null;
          var r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        })()`,
        params.timeoutMs,
        `timeout waiting for selector: ${params.selector}`
      ));
    } else {
      x = params.x!;
      y = params.y!;
    }
    const button = BUTTONS[params.button];
    const presses = Array.from({ length: params.clickCount }, () => [
      { type: 'pointerDown', button },
      { type: 'pointerUp', button }
    ]).flat();
    await this.pointer([
      { type: 'pointerMove', x: Math.round(x), y: Math.round(y) },
      ...presses
    ]);
    return { x, y };
  }

  async type(params: TypeParams) {
    if (params.ref) {
      await this.focusRef(params.ref);
    } else if (params.selector) {
      const found = await this.evaluateValue<boolean>(
        `(function() {
          var el = document.querySelector(${JSON.stringify(params.selector)});
          if (!el) return false;
          el.focus();
          return true;
        })()`
      );
      if (!found) throw new Error(`Element not found: ${params.selector}`);
    }

    if (params.clearFirst) {
      await this.evaluateRaw(
        `(function() {
          var el = document.activeElement;
          if (el && typeof el.select === 'function') el.select();
          else document.execCommand('selectAll');
        })()`
      );
      await this.keys(chordActions([BACKSPACE_KEY]));
    }

    const actions = textActions(params.text);
    if (params.delayMs > 0) {
      const paced = actions.flatMap((a, i) =>
        a.type === 'keyUp' && i < actions.length - 1
          ? [a, { type: 'pause', duration: params.delayMs }]
          : [a]
      );
      await this.keys(paced);
    } else if (actions.length > 0) {
      await this.keys(actions);
    }
    return { ok: true };
  }

  async fill(params: FillParams) {
    await this.focusRef(params.ref);
    await this.callOnRef(params.ref, SET_FIELD_VALUE_FUNCTION, [params.value]);
    return { ref: params.ref, value: params.value };
  }

  async hover(params: HoverParams) {
    let x: number;
    let y: number;
    if (params.ref) {
      ({ x, y } = await this.refCenter(params.ref));
    } else if (params.x !== undefined && params.y !== undefined) {
      x = params.x;
      y = params.y;
    } else {
      throw new Error('Either ref or x/y coordinates are required');
    }
    await this.pointer([
      { type: 'pointerMove', x: Math.round(x), y: Math.round(y) }
    ]);
    return { x, y };
  }

  async pressKey(params: PressKeyParams) {
    const combo = parseKeyCombo(params.key);
    await this.keys(chordActions(combo.values));
    return { key: combo.key, modifiers: combo.modifierNames };
  }

  async select(params: SelectParams) {
    await this.focusRef(params.ref);
    const selected = await this.callOnRef<{ value: string; label: string }>(
      params.ref,
      SELECT_OPTION_FUNCTION,
      [params.value ?? null, params.label ?? null, params.index ?? null]
    );
    return {
      ref: params.ref,
      selectedValue: selected.value,
      selectedLabel: selected.label
    };
  }

  async check(params: CheckParams) {
    const checked = await this.callOnRef<boolean>(
      params.ref,
      TOGGLE_CHECK_FUNCTION,
      [params.checked ?? null]
    );
    return { ref: params.ref, checked };
  }

  async scroll(params: ScrollParams): Promise<ScrollResult> {
    if (params.ref) {
      await this.refCenter(params.ref);
      return this.scrollPosition();
    }
    if (params.direction) {
      const amount = params.amount ?? 300;
      const deltaX =
        params.direction === 'left'
          ? -amount
          : params.direction === 'right'
            ? amount
            : 0;
      const deltaY =
        params.direction === 'up'
          ? -amount
          : params.direction === 'down'
            ? amount
            : 0;
      await this.performActions([
        {
          type: 'wheel',
          id: 'wheel',
          actions: [{ type: 'scroll', x: 0, y: 0, deltaX, deltaY }]
        }
      ]);
      await sleep(100);
    } else if (params.x !== undefined || params.y !== undefined) {
      await this.evaluateRaw(
        `window.scrollTo(${Number(params.x ?? 0)}, ${Number(params.y ?? 0)})`
      );
    }
    return this.scrollPosition();
  }

  // ── Files and dialogs ───────────────────────────────────────────────────

  async dialog(params: DialogParams): Promise<DialogResult> {
    const queue = this.session.dialogQueue;
    if (params.action === 'list') {
      return {
        action: 'list',
        dialogs: queue.list().map((d) => ({
          type: d.type,
          message: d.message,
          defaultPrompt: d.defaultPrompt
        }))
      };
    }
    const dialog = queue.shift();
    const context = this.dialogContexts.shift() ?? this.activeContext();
    if (!dialog) return { action: params.action, handled: false };
    const accept = params.action === 'accept';
    await this.bidi().send('browsingContext.handleUserPrompt', {
      context,
      accept,
      ...(accept &&
        params.promptText !== undefined && {
          userText: params.promptText
        })
    });
    return { action: params.action, handled: true };
  }

  async upload(params: UploadParams): Promise<UploadResult> {
    if (params.files.length === 0) {
      throw new Error('At least one file is required');
    }
    const sharedId = this.session.elementRefMap.resolveShared(params.ref);
    validateUploadFiles(params.files);
    try {
      await this.bidi().send('input.setFiles', {
        context: this.activeContext(),
        element: { sharedId },
        files: params.files.map((f) => resolvePath(f))
      });
    } catch (err) {
      if (err instanceof BidiError && err.error === 'no such node') {
        throw this.session.elementRefMap.stale(params.ref);
      }
      throw err;
    }
    return { ref: params.ref, files: params.files };
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────

  private async responseBody(
    recordId: string
  ): Promise<{ body: string; truncated: boolean } | null> {
    const request = this.netMonitor.bidiRequestId(recordId);
    if (!request || !this.collector) return null;
    try {
      const { bytes } = await this.bidi().send<{
        bytes: { type: 'string' | 'base64'; value: string };
      }>('network.getData', {
        dataType: 'response',
        request,
        collector: this.collector
      });
      const buf =
        bytes.type === 'base64'
          ? Buffer.from(bytes.value, 'base64')
          : Buffer.from(bytes.value, 'utf-8');
      const truncated = buf.length > MAX_RESPONSE_BODY_SIZE;
      return {
        body: (truncated
          ? buf.subarray(0, MAX_RESPONSE_BODY_SIZE)
          : buf
        ).toString('utf-8'),
        truncated
      };
    } catch {
      // Body not collected (redirect, still loading, or evicted)
      return null;
    }
  }

  async network(params: NetworkParams): Promise<NetworkResult> {
    const buffer = this.session.networkBuffer;
    switch (params.action) {
      case 'list': {
        const requests = buffer.list({
          url: params.url,
          method: params.method,
          statusMin: params.statusMin,
          statusMax: params.statusMax,
          resourceType: params.resourceType,
          failed: params.failed,
          limit: params.limit
        });
        return { action: 'list', count: requests.length, requests };
      }
      case 'get': {
        if (!params.requestId) {
          throw new Error('requestId is required for action "get"');
        }
        const record = buffer.getDetail(params.requestId);
        if (!record) {
          throw new Error(
            `No network request found with id: ${params.requestId}`
          );
        }
        const body = await this.responseBody(params.requestId);
        return {
          action: 'get',
          request: {
            ...record,
            ...(body && {
              responseBody: body.body,
              bodyTruncated: body.truncated
            })
          }
        };
      }
      case 'clear':
        return { action: 'clear', cleared: buffer.clear() };
    }
  }

  performance(): Promise<never> {
    return Promise.reject(
      new Error(
        'browser_performance is not supported by firefox (WebDriver BiDi has no tracing).'
      )
    );
  }
}
