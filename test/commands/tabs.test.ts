import {
  executeListTabs,
  executeNewTab,
  executeCloseTab,
  executeSwitchTab
} from '../../src/commands/tabs.js';
import type { BrowserManager } from '../../src/browser.js';

function mockManager(overrides: Partial<BrowserManager> = {}): BrowserManager {
  return {
    listTabs: jest.fn().mockResolvedValue([
      {
        targetId: 'tab-1',
        url: 'https://example.com',
        title: 'Example',
        active: true
      },
      {
        targetId: 'tab-2',
        url: 'about:blank',
        title: '',
        active: false
      }
    ]),
    createTab: jest.fn().mockResolvedValue({
      targetId: 'tab-3',
      url: 'https://new.com',
      title: '',
      active: false
    }),
    closeTab: jest.fn().mockResolvedValue(undefined),
    switchTab: jest.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as BrowserManager;
}

describe('executeListTabs', () => {
  it('returns list of open tabs', async () => {
    const manager = mockManager();
    const tabs = await executeListTabs(manager);

    expect(tabs).toHaveLength(2);
    expect(tabs[0].targetId).toBe('tab-1');
    expect(tabs[0].active).toBe(true);
    expect(tabs[1].targetId).toBe('tab-2');
    expect(tabs[1].active).toBe(false);
    expect(manager.listTabs).toHaveBeenCalled();
  });
});

describe('executeNewTab', () => {
  it('creates a new tab with a URL and switches to it', async () => {
    const manager = mockManager();
    const result = await executeNewTab(manager, 'https://new.com');

    expect(result.targetId).toBe('tab-3');
    expect(result.url).toBe('https://new.com');
    expect(manager.createTab).toHaveBeenCalledWith('https://new.com');
    expect(manager.switchTab).toHaveBeenCalledWith('tab-3');
  });

  it('creates a new tab without a URL and switches to it', async () => {
    const manager = mockManager();
    await executeNewTab(manager);

    expect(manager.createTab).toHaveBeenCalledWith(undefined);
    expect(manager.switchTab).toHaveBeenCalledWith('tab-3');
  });
});

describe('executeCloseTab', () => {
  it('closes a tab by target ID', async () => {
    const manager = mockManager();
    await executeCloseTab(manager, 'tab-2');

    expect(manager.closeTab).toHaveBeenCalledWith('tab-2');
  });
});

describe('executeSwitchTab', () => {
  it('switches to a tab by target ID', async () => {
    const manager = mockManager();
    await executeSwitchTab(manager, 'tab-2');

    expect(manager.switchTab).toHaveBeenCalledWith('tab-2');
  });
});
