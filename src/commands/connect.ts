import type { BrowserManager } from '../browser/browser-manager.js';
import type { TabInfo } from '../browser/types.js';

export interface ConnectParams {
  host?: string;
  port?: number;
  wsUrl?: string;
}

export interface ConnectResult {
  host: string;
  port: number;
  tabs: TabInfo[];
}

export async function executeConnect(
  manager: BrowserManager,
  params: ConnectParams
): Promise<ConnectResult> {
  const host = params.host ?? '127.0.0.1';
  const port = params.port ?? 9222;

  const { tabs } = await manager.connectExisting({
    host,
    port,
    wsUrl: params.wsUrl
  });

  return { host, port, tabs };
}

export function formatConnectResult(result: ConnectResult): string {
  const lines = [
    `Connected to Chrome at ${result.host}:${result.port}`,
    '',
    `Tabs (${result.tabs.length}):`
  ];

  for (const tab of result.tabs) {
    const active = tab.active ? ' (active)' : '';
    lines.push(`  [${tab.targetId}] ${tab.title || tab.url}${active}`);
  }

  return lines.join('\n');
}
