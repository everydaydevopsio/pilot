import type { BrowserManager, TabInfo } from '../browser.js';

export async function executeListTabs(
  manager: BrowserManager
): Promise<TabInfo[]> {
  return manager.listTabs();
}

export interface NewTabResult {
  targetId: string;
  url: string;
}

export async function executeNewTab(
  manager: BrowserManager,
  url?: string
): Promise<NewTabResult> {
  const tab = await manager.createTab(url);
  await manager.switchTab(tab.targetId);
  return { targetId: tab.targetId, url: tab.url };
}

export async function executeCloseTab(
  manager: BrowserManager,
  targetId: string
): Promise<void> {
  await manager.closeTab(targetId);
}

export async function executeSwitchTab(
  manager: BrowserManager,
  targetId: string
): Promise<void> {
  await manager.switchTab(targetId);
}
