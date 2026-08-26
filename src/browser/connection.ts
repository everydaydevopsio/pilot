import CDP from 'chrome-remote-interface';
import type { Client } from 'chrome-remote-interface';
import { getLogger } from '../util/logger.js';
import type { Config } from '../util/config.js';
import { type ViewportConfig, applyViewport } from '../viewport.js';

export interface ConnectionInfo {
  host: string;
  port: number;
}

export async function connectToChrome(opts: {
  host: string;
  port: number;
}): Promise<{ client: Client; targetId: string; url: string }> {
  const targets = await CDP.List({ host: opts.host, port: opts.port });

  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) {
    throw new Error('No page target found in Chrome');
  }

  const client = await CDP({
    host: opts.host,
    port: opts.port,
    target: pageTarget.id
  });

  return {
    client,
    targetId: pageTarget.id,
    url: pageTarget.url
  };
}

export async function enableDomains(
  client: Client,
  viewportConfig: ViewportConfig | null
): Promise<void> {
  await Promise.all([
    client.Network.enable({}),
    client.Console.enable(),
    client.Page.enable(),
    client.Runtime.enable()
  ]);

  if (viewportConfig) {
    await applyViewport(client, viewportConfig);
  }
}

export function getConnectionInfo(
  config: Config,
  launchedCdpPort: number | null
): ConnectionInfo {
  return {
    host: launchedCdpPort ? '127.0.0.1' : config.cdpHost,
    port: launchedCdpPort ?? config.cdpPort
  };
}

export function scheduleReconnect(
  config: Config,
  state: {
    destroyed: boolean;
    retryTimer: ReturnType<typeof setTimeout> | null;
    retryMs: number;
  },
  reconnectFn: () => void
): ReturnType<typeof setTimeout> | null {
  if (state.destroyed) return null;
  if (state.retryTimer) return state.retryTimer;

  const logger = getLogger();
  logger.debug({ retryMs: state.retryMs }, 'Scheduling reconnect');

  const timer = setTimeout(() => {
    state.retryTimer = null;
    state.retryMs = Math.min(state.retryMs * 2, config.cdpMaxRetryMs);
    reconnectFn();
  }, state.retryMs);
  timer.unref();
  return timer;
}
