import CDP from 'chrome-remote-interface';
import type { Client } from 'chrome-remote-interface';
import { getLogger } from '../util/logger.js';
import type { TabInfo } from './types.js';
import type { ConnectionInfo } from './connection.js';
import { enableDomains } from './connection.js';
import { attachEventListeners } from './events.js';
import type { ViewportConfig } from '../viewport.js';

export async function listTabs(
  connInfo: ConnectionInfo,
  activeTargetId: string | null
): Promise<TabInfo[]> {
  const targets = await CDP.List({ host: connInfo.host, port: connInfo.port });
  return targets
    .filter((t) => t.type === 'page')
    .map((t) => ({
      targetId: t.id,
      url: t.url,
      title: t.title,
      active: t.id === activeTargetId
    }));
}

export async function createTab(
  connInfo: ConnectionInfo,
  url?: string
): Promise<TabInfo> {
  const encodedUrl = url ? encodeURI(url) : undefined;
  const target = await CDP.New({
    host: connInfo.host,
    port: connInfo.port,
    url: encodedUrl
  });
  return {
    targetId: target.id,
    url: target.url,
    title: target.title,
    active: false
  };
}

export async function closeTab(
  connInfo: ConnectionInfo,
  targetId: string,
  activeTargetId: string | null
): Promise<void> {
  if (targetId === activeTargetId) {
    throw new Error(
      'Cannot close the active tab. Switch to another tab first.'
    );
  }
  await CDP.Close({ host: connInfo.host, port: connInfo.port, id: targetId });
}

export interface SwitchTabResult {
  client: Client;
  targetId: string;
  url: string;
}

export async function switchTab(
  connInfo: ConnectionInfo,
  targetId: string,
  currentTargetId: string | null,
  currentClient: Client | null,
  viewportConfig: ViewportConfig | null,
  eventListenerOpts: Parameters<typeof attachEventListeners>[1]
): Promise<SwitchTabResult> {
  if (targetId === currentTargetId && currentClient) {
    return {
      client: currentClient,
      targetId,
      url: ''
    };
  }

  // Verify the target exists
  const targets = await CDP.List({
    host: connInfo.host,
    port: connInfo.port
  });
  const target = targets.find((t) => t.id === targetId && t.type === 'page');
  if (!target) {
    throw new Error(`No page tab found with targetId: ${targetId}`);
  }

  // Close old client connection (but not the tab)
  if (currentClient) {
    await currentClient.close();
  }

  // Connect to the new target
  const client = await CDP({
    host: connInfo.host,
    port: connInfo.port,
    target: targetId
  });

  await enableDomains(client, viewportConfig);
  attachEventListeners(client, eventListenerOpts);

  // Activate the tab in the browser UI
  await client.Target.activateTarget({ targetId });

  const logger = getLogger();
  logger.info({ targetId, url: target.url }, 'Switched to tab');

  return { client, targetId, url: target.url };
}
