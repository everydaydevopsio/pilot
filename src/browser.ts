import CDP from 'chrome-remote-interface';
import type { Client } from 'chrome-remote-interface';
import { getLogger } from './util/logger.js';
import type { Config } from './util/config.js';

export type BrowserEventCallback = (event: string, data: unknown) => void;

export interface BrowserState {
  client: Client | null;
  targetId: string | null;
  url: string | null;
  connected: boolean;
}

export class BrowserManager {
  private client: Client | null = null;
  private targetId: string | null = null;
  private currentUrl: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs: number;
  private destroyed = false;
  private eventCallback: BrowserEventCallback | null = null;
  private pendingNetworkRequests = new Set<string>();
  private networkIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private networkIdleResolvers: Array<() => void> = [];

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

  async connect(): Promise<void> {
    if (this.destroyed) return;
    const logger = getLogger();

    try {
      const targets = await CDP.List({
        host: this.config.cdpHost,
        port: this.config.cdpPort
      });

      const pageTarget = targets.find((t) => t.type === 'page');
      if (!pageTarget) {
        throw new Error('No page target found in Chrome');
      }

      const client = await CDP({
        host: this.config.cdpHost,
        port: this.config.cdpPort,
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
  }

  private attachEventListeners(client: Client): void {
    client.on('disconnect', () => {
      const logger = getLogger();
      logger.warn('Chrome disconnected');
      this.client = null;
      this.targetId = null;
      this.emit('browser_disconnected', { reason: 'chrome_disconnected' });
      this.scheduleReconnect();
    });

    // Console events
    client.Runtime.consoleAPICalled((params) => {
      const text = params.args
        .map((a) =>
          a.value !== undefined ? String(a.value) : (a.description ?? '')
        )
        .join(' ');
      this.emit('console_message', {
        level: params.type,
        text,
        url: params.stackTrace?.callFrames?.[0]?.url ?? '',
        lineNumber: params.stackTrace?.callFrames?.[0]?.lineNumber ?? 0,
        timestamp: Date.now()
      });
    });

    client.Console.messageAdded((params) => {
      this.emit('console_message', {
        level: params.message.level,
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
  }
}
