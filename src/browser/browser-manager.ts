import type { Client } from 'chrome-remote-interface';
import type { ChildProcess } from 'child_process';
import { mkdirSync } from 'fs';
import { getLogger } from '../util/logger.js';
import type { Config } from '../util/config.js';
import type { ViewportConfig } from '../viewport.js';
import { resolveViewport } from '../viewport.js';
import type {
  BrowserEventCallback,
  BrowserState,
  LaunchOptions,
  TabInfo
} from './types.js';
import {
  findChromeExecutable,
  findFreePort,
  isProfileLocked,
  launchChrome,
  resolveUserDataDir,
  waitForChromeReady,
  cleanupLockFiles
} from './chrome-launcher.js';
import {
  connectToChrome,
  enableDomains,
  getConnectionInfo,
  type ConnectionInfo
} from './connection.js';
import { attachEventListeners } from './events.js';
import {
  listTabs as listTabsImpl,
  createTab as createTabImpl,
  closeTab as closeTabImpl,
  switchTab as switchTabImpl
} from './tabs.js';

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
  private external = false;
  private externalHost: string | null = null;
  private externalPort: number | null = null;

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

  isExternalChrome(): boolean {
    return this.external;
  }

  getViewportConfig(): ViewportConfig | null {
    return this.viewportConfig;
  }

  setViewportConfig(config: ViewportConfig): void {
    this.viewportConfig = config;
  }

  static findChromeExecutable(override?: string): string {
    return findChromeExecutable(override);
  }

  static async findFreePort(): Promise<number> {
    return findFreePort();
  }

  private getConnectionInfo(): ConnectionInfo {
    return getConnectionInfo(this.config, this.launchedCdpPort);
  }

  private makeEventListenerOpts() {
    return {
      emit: (event: string, data: unknown) => this.emit(event, data),
      onDisconnect: () => {
        if (this.intentionalClose) {
          this.intentionalClose = false;
          return;
        }
        const logger = getLogger();
        logger.warn('Chrome disconnected');
        this.client = null;
        this.targetId = null;
        this.emit('browser_disconnected', {
          reason: 'chrome_disconnected'
        });
        this.scheduleReconnect();
      },
      pendingNetworkRequests: this.pendingNetworkRequests,
      checkNetworkIdle: () => this.checkNetworkIdle(),
      onFrameNavigated: (url: string) => {
        this.currentUrl = url;
        this.emit('page_navigated', {
          url,
          timestamp: Date.now()
        });
      }
    };
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

    const port = await findFreePort();
    const chromePath = findChromeExecutable(opts.chromePath);

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
      deviceScaleFactor: opts.deviceScaleFactor,
      responsive: opts.responsive ?? this.config.responsive
    });

    const headless = opts.headless ?? this.config.headless;

    this.chromeProcess = launchChrome({
      chromePath,
      port,
      userDataDir,
      headless,
      windowWidth: this.viewportConfig.width,
      windowHeight: this.viewportConfig.height
    });

    this.launchedCdpPort = port;
    this.launchedUserDataDir = userDataDir;

    const stderrChunks: string[] = [];
    this.chromeProcess.stderr?.on('data', (data: Buffer) => {
      stderrChunks.push(data.toString());
    });

    this.chromeProcess.on('exit', (code, signal) => {
      const logger = getLogger();
      const stderr = stderrChunks.join('').trim();
      const stderrFiltered = stderr
        .split('\n')
        .filter((l) => !l.includes('dbus/bus.cc'))
        .join('\n')
        .trim();
      logger.warn(
        {
          code,
          signal,
          ...(stderrFiltered && { stderr: stderrFiltered.slice(0, 1000) }),
          ...(stderr && !stderrFiltered && { stderrRaw: stderr.slice(0, 500) })
        },
        'Chrome process exited'
      );
      this.chromeProcess = null;
      this.launchedCdpPort = null;
      this.cleanupUserDataDir();
    });

    await waitForChromeReady(port, opts.startupTimeoutMs);
    await this.connect();

    return { headless, viewport: viewportPreset };
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;
    const logger = getLogger();

    try {
      const connInfo = this.getConnectionInfo();
      const { client, targetId, url } = await connectToChrome(connInfo);

      this.client = client;
      this.targetId = targetId;
      this.currentUrl = url;
      this.retryMs = this.config.cdpRetryMs;

      await enableDomains(client, this.viewportConfig);
      attachEventListeners(client, this.makeEventListenerOpts());

      logger.info(
        { targetId: this.targetId, url: this.currentUrl },
        'Connected to Chrome'
      );

      this.emit('browser_connected', {
        targetId: this.targetId,
        url: this.currentUrl
      });
    } catch (err) {
      logger.warn(
        { err, retryMs: this.retryMs },
        'Failed to connect to Chrome, retrying...'
      );
      this.scheduleReconnect();
    }
  }

  async connectExisting(opts: {
    host?: string;
    port?: number;
  }): Promise<{ tabs: TabInfo[] }> {
    if (this.chromeProcess) {
      throw new Error(
        'Chrome was launched by Pilot. Use browser_stop first, then browser_connect.'
      );
    }
    if (this.destroyed) {
      throw new Error(
        'BrowserManager has been destroyed; create a new instance'
      );
    }

    const logger = getLogger();
    const host = opts.host ?? '127.0.0.1';
    const port = opts.port ?? 9222;

    this.external = true;
    this.externalHost = host;
    this.externalPort = port;
    this.launchedCdpPort = port;

    // Override connection info for external Chrome
    const connInfo: ConnectionInfo = { host, port };

    try {
      const { client, targetId, url } = await connectToChrome(connInfo);

      this.client = client;
      this.targetId = targetId;
      this.currentUrl = url;
      this.retryMs = this.config.cdpRetryMs;

      await enableDomains(client, this.viewportConfig);
      attachEventListeners(client, this.makeEventListenerOpts());

      logger.info(
        { host, port, targetId, url },
        'Connected to existing Chrome'
      );

      this.emit('browser_connected', { targetId, url });

      const tabs = await this.listTabs();
      return { tabs };
    } catch (cause) {
      this.external = false;
      this.externalHost = null;
      this.externalPort = null;
      this.launchedCdpPort = null;
      throw new Error(
        `Could not connect to Chrome at ${host}:${port}. ` +
          `Start Chrome with --remote-debugging-port=${port} or use browser_start to launch a new instance.`,
        { cause }
      );
    }
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

  async listTabs(): Promise<TabInfo[]> {
    return listTabsImpl(this.getConnectionInfo(), this.targetId);
  }

  async createTab(url?: string): Promise<TabInfo> {
    return createTabImpl(this.getConnectionInfo(), url);
  }

  async closeTab(targetId: string): Promise<void> {
    return closeTabImpl(this.getConnectionInfo(), targetId, this.targetId);
  }

  async switchTab(targetId: string): Promise<void> {
    if (targetId === this.targetId) return;

    // Clear any pending reconnect from a prior disconnect
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.intentionalClose = true;

    const result = await switchTabImpl(
      this.getConnectionInfo(),
      targetId,
      this.targetId,
      this.client,
      this.viewportConfig,
      this.makeEventListenerOpts()
    );

    this.client = result.client;
    this.targetId = result.targetId;
    this.currentUrl = result.url;
    this.retryMs = this.config.cdpRetryMs;
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
      cleanupLockFiles(this.launchedUserDataDir);
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
    // External Chrome: just disconnect, don't kill the process
    if (this.external) {
      this.external = false;
      this.externalHost = null;
      this.externalPort = null;
      this.launchedCdpPort = null;
      return;
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
