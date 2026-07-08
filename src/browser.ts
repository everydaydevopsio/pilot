import CDP from 'chrome-remote-interface';
import type { Client } from 'chrome-remote-interface';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, lstatSync, mkdirSync, unlinkSync } from 'fs';
import * as net from 'net';
import { homedir } from 'os';
import { join } from 'path';
import { getLogger } from './util/logger.js';
import type { Config } from './util/config.js';
import {
  type ViewportConfig,
  resolveViewport,
  applyViewport
} from './viewport.js';

export type BrowserEventCallback = (event: string, data: unknown) => void;

export interface TabInfo {
  targetId: string;
  url: string;
  title: string;
  active: boolean;
}

export interface BrowserState {
  client: Client | null;
  targetId: string | null;
  url: string | null;
  connected: boolean;
}

export interface LaunchOptions {
  headless?: boolean;
  chromePath?: string;
  profileName?: string;
  viewport?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
}

export type SandboxDecision =
  | { disable: false }
  | { disable: true; reason: 'env_override' | 'root_user' };

export function sandboxDecision(): SandboxDecision {
  const envOverride = process.env.AAB_CHROME_NO_SANDBOX;
  if (envOverride !== undefined) {
    const truthy = envOverride === 'true' || envOverride === '1';
    return truthy
      ? { disable: true, reason: 'env_override' }
      : { disable: false };
  }
  // --no-sandbox is relevant on Linux and (in theory) Windows.
  // macOS uses a different sandboxing model and Chrome ignores the flag.
  if (process.platform !== 'linux' && process.platform !== 'win32') {
    return { disable: false };
  }
  // Auto-apply only when running as root. Chrome's user-namespace sandbox
  // typically fails as root in containers, and root is the most reliable
  // signal that the sandbox cannot work. Non-root processes (including
  // non-root in containers) usually have a working sandbox — set
  // AAB_CHROME_NO_SANDBOX=true to opt in if a specific environment
  // genuinely requires it.
  if (process.getuid?.() === 0) {
    return { disable: true, reason: 'root_user' };
  }
  return { disable: false };
}

export function shouldDisableSandbox(): boolean {
  return sandboxDecision().disable;
}

export const PROFILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function resolveUserDataDir(profileName: string): string {
  if (!PROFILE_NAME_RE.test(profileName)) {
    throw new Error(
      `Invalid profile name "${profileName}". Use only letters, digits, hyphens, and underscores.`
    );
  }
  const xdgData =
    process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(xdgData, 'aab', profileName);
}

function fileOrSymlinkExists(filePath: string): boolean {
  try {
    lstatSync(filePath);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    // Permission errors (EACCES) or other unexpected failures — treat as
    // "exists" so callers don't silently ignore an inaccessible lock file.
    return true;
  }
}

export function isProfileLocked(userDataDir: string): boolean {
  // Chrome writes SingletonLock as a symlink on Linux (target: hostname-pid).
  // The symlink is dangling, so existsSync (which follows symlinks) returns
  // false. Use lstatSync to detect the symlink itself.
  return (
    fileOrSymlinkExists(join(userDataDir, 'SingletonLock')) ||
    existsSync(join(userDataDir, 'lockfile'))
  );
}

export class BrowserManager {
  private client: Client | null = null;
  private targetId: string | null = null;
  private currentUrl: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs: number;
  private destroyed = false;
  private intentionalClose = false;
  private eventCallback: BrowserEventCallback | null = null;
  private pendingNetworkRequests = new Set<string>();
  private networkIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private networkIdleResolvers: Array<() => void> = [];
  private chromeProcess: ChildProcess | null = null;
  private launchedCdpPort: number | null = null;
  private viewportConfig: ViewportConfig | null = null;
  private launchedUserDataDir: string | null = null;

  constructor(private readonly config: Config) {
    this.retryMs = config.cdpRetryMs;
  }

  setEventCallback(cb: BrowserEventCallback): void {
    this.eventCallback = cb;
  }

  private emit(event: string, data: unknown): void {
    this.eventCallback?.(event, data);
  }

  getState(): BrowserState {
    return {
      client: this.client,
      targetId: this.targetId,
      url: this.currentUrl,
      connected: this.client !== null
    };
  }

  getClient(): Client | null {
    return this.client;
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  isLaunched(): boolean {
    return this.chromeProcess !== null;
  }

  static findChromeExecutable(override?: string): string {
    if (override) return override;
    const env = process.env.AAB_CHROME_PATH;
    if (env) return env;

    const platform = process.platform;
    const candidates: string[] =
      platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
          ]
        : platform === 'linux'
          ? [
              '/usr/bin/google-chrome-stable',
              '/usr/bin/google-chrome',
              '/usr/bin/chromium-browser',
              '/usr/bin/chromium',
              '/snap/bin/chromium'
            ]
          : platform === 'win32'
            ? [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
              ]
            : [];

    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    throw new Error(
      `Chrome not found on ${platform}. Install Google Chrome or set AAB_CHROME_PATH.`
    );
  }

  static async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
      server.on('error', reject);
    });
  }

  async launch(
    opts: LaunchOptions = {}
  ): Promise<{ headless: boolean; viewport: string }> {
    if (this.chromeProcess) {
      throw new Error('Chrome is already launched');
    }
    if (this.destroyed) {
      throw new Error(
        'BrowserManager has been destroyed; create a new instance'
      );
    }

    const logger = getLogger();
    const port = await BrowserManager.findFreePort();
    const chromePath = BrowserManager.findChromeExecutable(opts.chromePath);

    const profileName = opts.profileName ?? this.config.profileName;
    const userDataDir = resolveUserDataDir(profileName);

    if (isProfileLocked(userDataDir)) {
      throw new Error(
        `Profile "${profileName}" is already in use by another browser instance.`
      );
    }

    mkdirSync(userDataDir, { recursive: true });

    const viewportPreset = opts.viewport ?? this.config.viewport;
    this.viewportConfig = resolveViewport({
      preset: viewportPreset,
      width: opts.viewportWidth,
      height: opts.viewportHeight,
      deviceScaleFactor: opts.deviceScaleFactor
    });

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      `--window-size=${this.viewportConfig.width},${this.viewportConfig.height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-extensions'
    ];

    const headless = opts.headless ?? this.config.headless;
    if (headless) {
      args.push('--headless=new', '--disable-gpu');
    }

    if (process.platform === 'linux') {
      args.push(
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-breakpad'
      );
    }

    const sandbox = sandboxDecision();
    if (sandbox.disable) {
      args.push('--no-sandbox');
      logger.warn(
        { reason: sandbox.reason },
        'Chrome will run with --no-sandbox. The renderer sandbox is disabled; any page the agent visits runs with the same privileges as this process. Set AAB_CHROME_NO_SANDBOX=false to override, or run as a non-root user to keep the sandbox enabled.'
      );
    }

    logger.info(
      {
        chromePath,
        port,
        headless,
        viewport: viewportPreset,
        sandbox: sandbox.disable ? 'disabled' : 'enabled'
      },
      'Launching Chrome'
    );

    this.chromeProcess = spawn(chromePath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: false
    });

    this.launchedCdpPort = port;
    this.launchedUserDataDir = userDataDir;

    const stderrChunks: string[] = [];
    this.chromeProcess.stderr?.on('data', (data: Buffer) => {
      stderrChunks.push(data.toString());
    });

    this.chromeProcess.on('exit', (code, signal) => {
      const stderr = stderrChunks.join('').trim();
      logger.warn(
        { code, signal, ...(stderr && { stderr: stderr.slice(0, 500) }) },
        'Chrome process exited'
      );
      this.chromeProcess = null;
      this.launchedCdpPort = null;
      this.cleanupUserDataDir();
    });

    await this.waitForChromeReady(port);
    await this.connect();

    return { headless, viewport: viewportPreset };
  }

  private async waitForChromeReady(
    port: number,
    timeoutMs = 10000
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await CDP.List({ host: '127.0.0.1', port });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(
      `Chrome did not become ready on port ${port} within ${timeoutMs}ms`
    );
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;
    const logger = getLogger();

    try {
      const cdpHost = this.launchedCdpPort ? '127.0.0.1' : this.config.cdpHost;
      const cdpPort = this.launchedCdpPort ?? this.config.cdpPort;

      const targets = await CDP.List({ host: cdpHost, port: cdpPort });

      const pageTarget = targets.find((t) => t.type === 'page');
      if (!pageTarget) {
        throw new Error('No page target found in Chrome');
      }

      const client = await CDP({
        host: cdpHost,
        port: cdpPort,
        target: pageTarget.id
      });

      this.client = client;
      this.targetId = pageTarget.id;
      this.currentUrl = pageTarget.url;
      this.retryMs = this.config.cdpRetryMs;

      await this.enableDomains(client);
      this.attachEventListeners(client);

      logger.info(
        { targetId: this.targetId, url: this.currentUrl },
        'Connected to Chrome'
      );

      this.emit('browser_connected', {
        targetId: this.targetId,
        url: this.currentUrl
      });
    } catch (err) {
      const logger = getLogger();
      logger.warn(
        { err, retryMs: this.retryMs },
        'Failed to connect to Chrome, retrying...'
      );
      this.scheduleReconnect();
    }
  }

  private async enableDomains(client: Client): Promise<void> {
    await Promise.all([
      client.Network.enable({}),
      client.Console.enable(),
      client.Page.enable(),
      client.Runtime.enable()
    ]);

    if (this.viewportConfig) {
      await applyViewport(client, this.viewportConfig);
    }
  }

  private attachEventListeners(client: Client): void {
    client.on('disconnect', () => {
      if (this.intentionalClose) {
        this.intentionalClose = false;
        return;
      }
      const logger = getLogger();
      logger.warn('Chrome disconnected');
      this.client = null;
      this.targetId = null;
      this.emit('browser_disconnected', { reason: 'chrome_disconnected' });
      this.scheduleReconnect();
    });

    // Console events
    // CDP uses "warning" for console.warn; normalize to "warn" to match ConsoleLevel.
    const normLevel = (raw: string): string =>
      raw === 'warning' ? 'warn' : raw;

    client.Runtime.consoleAPICalled((params) => {
      const text = params.args
        .map((a) =>
          a.value !== undefined ? String(a.value) : (a.description ?? '')
        )
        .join(' ');
      this.emit('console_message', {
        level: normLevel(params.type),
        text,
        url: params.stackTrace?.callFrames?.[0]?.url ?? '',
        lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber ?? 0,
        timestamp: Date.now()
      });
    });

    client.Console.messageAdded((params) => {
      this.emit('console_message', {
        level: normLevel(params.message.level),
        text: params.message.text,
        url: params.message.url ?? '',
        lineNumber: params.message.line ?? 0,
        timestamp: Date.now()
      });
    });

    // Network events
    client.Network.requestWillBeSent((params) => {
      this.pendingNetworkRequests.add(params.requestId);
      this.emit('network_request', {
        requestId: params.requestId,
        url: params.request.url,
        method: params.request.method,
        timestamp: Date.now()
      });
    });

    client.Network.responseReceived((params) => {
      this.pendingNetworkRequests.delete(params.requestId);
      this.checkNetworkIdle();
      this.emit('network_response', {
        requestId: params.requestId,
        url: params.response.url,
        status: params.response.status,
        mimeType: params.response.mimeType,
        fromCache: params.response.fromDiskCache ?? false,
        timestamp: Date.now()
      });
    });

    client.Network.loadingFailed((params) => {
      this.pendingNetworkRequests.delete(params.requestId);
      this.checkNetworkIdle();
      this.emit('network_failed', {
        requestId: params.requestId,
        url: '',
        errorText: params.errorText,
        timestamp: Date.now()
      });
    });

    client.Network.loadingFinished((params) => {
      this.pendingNetworkRequests.delete(params.requestId);
      this.checkNetworkIdle();
    });

    // Page navigation
    client.Page.frameNavigated((params) => {
      if (params.frame.parentId === undefined) {
        this.currentUrl = params.frame.url;
        this.emit('page_navigated', {
          url: params.frame.url,
          timestamp: Date.now()
        });
      }
    });
  }

  private checkNetworkIdle(): void {
    if (this.pendingNetworkRequests.size === 0) {
      if (this.networkIdleTimer) clearTimeout(this.networkIdleTimer);
      this.networkIdleTimer = setTimeout(() => {
        const resolvers = this.networkIdleResolvers.splice(0);
        resolvers.forEach((r) => r());
      }, 500);
      this.networkIdleTimer.unref();
    }
  }

  waitForNetworkIdle(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pendingNetworkRequests.size === 0) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        const idx = this.networkIdleResolvers.indexOf(resolve);
        if (idx !== -1) this.networkIdleResolvers.splice(idx, 1);
        reject(new Error('timeout waiting for network idle'));
      }, timeoutMs);

      this.networkIdleResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private getCdpConnectionInfo(): { host: string; port: number } {
    return {
      host: this.launchedCdpPort ? '127.0.0.1' : this.config.cdpHost,
      port: this.launchedCdpPort ?? this.config.cdpPort
    };
  }

  async listTabs(): Promise<TabInfo[]> {
    const { host, port } = this.getCdpConnectionInfo();
    const targets = await CDP.List({ host, port });
    return targets
      .filter((t) => t.type === 'page')
      .map((t) => ({
        targetId: t.id,
        url: t.url,
        title: t.title,
        active: t.id === this.targetId
      }));
  }

  async createTab(url?: string): Promise<TabInfo> {
    const { host, port } = this.getCdpConnectionInfo();
    // chrome-remote-interface appends the url to the HTTP request path
    // without encoding, so we must encode it ourselves to avoid
    // ERR_UNESCAPED_CHARACTERS on URLs with special characters.
    const encodedUrl = url ? encodeURI(url) : undefined;
    const target = await CDP.New({ host, port, url: encodedUrl });
    return {
      targetId: target.id,
      url: target.url,
      title: target.title,
      active: false
    };
  }

  async closeTab(targetId: string): Promise<void> {
    if (targetId === this.targetId) {
      throw new Error(
        'Cannot close the active tab. Switch to another tab first.'
      );
    }
    const { host, port } = this.getCdpConnectionInfo();
    await CDP.Close({ host, port, id: targetId });
  }

  async switchTab(targetId: string): Promise<void> {
    if (targetId === this.targetId) return;

    const { host, port } = this.getCdpConnectionInfo();

    // Verify the target exists
    const targets = await CDP.List({ host, port });
    const target = targets.find((t) => t.id === targetId && t.type === 'page');
    if (!target) {
      throw new Error(`No page tab found with targetId: ${targetId}`);
    }

    // Close old client connection (but not the tab)
    if (this.client) {
      this.intentionalClose = true;
      await this.client.close();
      this.client = null;
    }

    // Clear any pending reconnect from a prior disconnect
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Connect to the new target
    const client = await CDP({ host, port, target: targetId });
    this.client = client;
    this.targetId = targetId;
    this.currentUrl = target.url;
    this.retryMs = this.config.cdpRetryMs;

    await this.enableDomains(client);
    this.attachEventListeners(client);

    // Activate the tab in the browser UI
    await client.Target.activateTarget({ targetId });

    const logger = getLogger();
    logger.info({ targetId, url: target.url }, 'Switched to tab');
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.retryTimer) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryMs = Math.min(this.retryMs * 2, this.config.cdpMaxRetryMs);
      void this.connect();
    }, this.retryMs);
    this.retryTimer.unref();
  }

  private cleanupUserDataDir(): void {
    if (this.launchedUserDataDir) {
      // Remove stale lock files left behind after Chrome exits so the
      // profile can be reused without a false "already in use" error.
      for (const lockName of ['SingletonLock', 'lockfile']) {
        try {
          unlinkSync(join(this.launchedUserDataDir, lockName));
        } catch {
          // lock file may not exist — that's fine
        }
      }
    }
    this.launchedUserDataDir = null;
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.networkIdleTimer) {
      clearTimeout(this.networkIdleTimer);
    }
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.chromeProcess) {
      const proc = this.chromeProcess;
      this.chromeProcess = null;
      this.launchedCdpPort = null;
      try {
        proc.kill();
      } catch {
        // process may have already exited
      }
      // Wait for Chrome to fully exit before removing lock files so a
      // concurrent launch cannot race against a still-running process.
      // `proc.killed` only confirms a signal was delivered, not that the
      // process is gone — only `exitCode !== null` or the `exit` event do.
      await new Promise<void>((resolve) => {
        if (proc.exitCode !== null) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // process may have already exited
          }
          resolve();
        }, 5000);
        proc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.cleanupUserDataDir();
    }
  }
}
