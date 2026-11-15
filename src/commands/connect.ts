import {
  BROWSER_NAMES,
  type BrowserDriver,
  type BrowserKind
} from '../browser/driver/types.js';
import type { TabInfo } from '../browser/types.js';

export interface ConnectParams {
  host?: string;
  port?: number;
}

export interface ConnectResult {
  /** Browser connected to; defaults to chrome when omitted. */
  browser?: BrowserKind;
  host: string;
  port: number;
  tabs: TabInfo[];
}

export async function executeConnect(
  driver: Pick<BrowserDriver, 'connectExisting'> & { kind?: BrowserKind },
  params: ConnectParams
): Promise<ConnectResult> {
  const host = params.host ?? '127.0.0.1';
  const port = params.port ?? 9222;

  const { tabs } = await driver.connectExisting({ host, port });

  return { browser: driver.kind, host, port, tabs };
}

export function formatConnectResult(result: ConnectResult): string {
  const lines = [
    `Connected to ${BROWSER_NAMES[result.browser ?? 'chrome']} at ${result.host}:${result.port}`,
    '',
    `Tabs (${result.tabs.length}):`
  ];

  for (const tab of result.tabs) {
    const active = tab.active ? ' (active)' : '';
    lines.push(`  [${tab.targetId}] ${tab.title || tab.url}${active}`);
  }

  return lines.join('\n');
}
