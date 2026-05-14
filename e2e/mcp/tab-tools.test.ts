import { McpTestClient } from './client.js';

describe('MCP E2E: tab management tools', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    await mcp.startBrowser();
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  // ── list tabs ──────────────────────────────────────────────────────────────

  describe('browser_list_tabs', () => {
    it('returns at least one tab after browser start', async () => {
      const result = await mcp.callTool('browser_list_tabs');
      const tabs = JSON.parse(mcp.getText(result));

      expect(Array.isArray(tabs)).toBe(true);
      expect(tabs.length).toBeGreaterThanOrEqual(1);
      expect(tabs[0]).toHaveProperty('targetId');
      expect(tabs[0]).toHaveProperty('url');
      expect(tabs[0]).toHaveProperty('title');
      expect(tabs[0]).toHaveProperty('active');
    });

    it('marks exactly one tab as active', async () => {
      const result = await mcp.callTool('browser_list_tabs');
      const tabs = JSON.parse(mcp.getText(result));
      const activeTabs = tabs.filter(
        (t: { active: boolean }) => t.active === true
      );

      expect(activeTabs).toHaveLength(1);
    });
  });

  // ── new tab ────────────────────────────────────────────────────────────────

  describe('browser_new_tab', () => {
    it('opens a new blank tab and switches to it', async () => {
      const beforeResult = await mcp.callTool('browser_list_tabs');
      const beforeTabs = JSON.parse(mcp.getText(beforeResult));

      const result = await mcp.callTool('browser_new_tab', {});
      expect(mcp.getText(result)).toMatch(/new tab opened/i);

      const afterResult = await mcp.callTool('browser_list_tabs');
      const afterTabs = JSON.parse(mcp.getText(afterResult));

      expect(afterTabs.length).toBe(beforeTabs.length + 1);

      // The new tab should be the active tab
      const newTabText = mcp.getText(result);
      const targetIdMatch = newTabText.match(/targetId: ([^,)]+)/);
      expect(targetIdMatch).not.toBeNull();
      const newTabId = targetIdMatch![1];
      const activeTab = afterTabs.find(
        (t: { active: boolean }) => t.active === true
      );
      expect(activeTab.targetId).toBe(newTabId);
    });

    it('opens a new tab with a URL and switches to it', async () => {
      const result = await mcp.callTool('browser_new_tab', {
        url: 'data:text/html,<h1>New Tab</h1>'
      });
      const text = mcp.getText(result);
      expect(text).toMatch(/new tab opened/i);
      expect(text).toMatch(/targetId/);

      // Verify the new tab is now active
      const listResult = await mcp.callTool('browser_list_tabs');
      const tabs = JSON.parse(mcp.getText(listResult));
      const activeTab = tabs.find(
        (t: { active: boolean }) => t.active === true
      );
      expect(activeTab.url).toMatch(/New Tab/);
    });
  });

  // ── switch tab ─────────────────────────────────────────────────────────────

  describe('browser_switch_tab', () => {
    it('switches to another tab', async () => {
      // Get list of tabs, find one that is not active
      const listResult = await mcp.callTool('browser_list_tabs');
      const tabs = JSON.parse(mcp.getText(listResult));
      const inactiveTab = tabs.find(
        (t: { active: boolean }) => t.active === false
      );

      // Skip if only one tab exists
      if (!inactiveTab) return;

      const result = await mcp.callTool('browser_switch_tab', {
        targetId: inactiveTab.targetId
      });
      expect(mcp.getText(result)).toMatch(/switched to tab/i);

      // Verify the switched tab is now active
      const afterList = await mcp.callTool('browser_list_tabs');
      const afterTabs = JSON.parse(mcp.getText(afterList));
      const nowActive = afterTabs.find(
        (t: { active: boolean }) => t.active === true
      );
      expect(nowActive.targetId).toBe(inactiveTab.targetId);
    });

    it('returns an error for a non-existent target', async () => {
      const result = await mcp.callTool('browser_switch_tab', {
        targetId: 'nonexistent-target-id'
      });
      expect(
        result.isError === true || mcp.getText(result).match(/no page tab/i)
      ).toBeTruthy();
    });
  });

  // ── close tab ──────────────────────────────────────────────────────────────

  describe('browser_close_tab', () => {
    it('closes an inactive tab', async () => {
      // Create a tab to close (auto-switches to it)
      const newResult = await mcp.callTool('browser_new_tab', {});
      const newText = mcp.getText(newResult);
      const targetIdMatch = newText.match(/targetId: ([^,)]+)/);
      expect(targetIdMatch).not.toBeNull();
      const newTabId = targetIdMatch![1];

      // Switch back to a different tab so the new tab becomes inactive
      const listResult = await mcp.callTool('browser_list_tabs');
      const tabs = JSON.parse(mcp.getText(listResult));
      const otherTab = tabs.find(
        (t: { targetId: string }) => t.targetId !== newTabId
      );
      expect(otherTab).toBeDefined();
      await mcp.callTool('browser_switch_tab', { targetId: otherTab.targetId });

      const beforeResult = await mcp.callTool('browser_list_tabs');
      const beforeTabs = JSON.parse(mcp.getText(beforeResult));

      const closeResult = await mcp.callTool('browser_close_tab', {
        targetId: newTabId
      });
      expect(mcp.getText(closeResult)).toMatch(/closed/i);

      const afterResult = await mcp.callTool('browser_list_tabs');
      const afterTabs = JSON.parse(mcp.getText(afterResult));
      expect(afterTabs.length).toBe(beforeTabs.length - 1);
    });

    it('returns an error when closing the active tab', async () => {
      const listResult = await mcp.callTool('browser_list_tabs');
      const tabs = JSON.parse(mcp.getText(listResult));
      const activeTab = tabs.find(
        (t: { active: boolean }) => t.active === true
      );

      const result = await mcp.callTool('browser_close_tab', {
        targetId: activeTab.targetId
      });
      expect(
        result.isError === true ||
          mcp.getText(result).match(/cannot close the active tab/i)
      ).toBeTruthy();
    });
  });

  // ── list tabs returns error before browser_start ───────────────────────────

  describe('browser_list_tabs before start', () => {
    let freshMcp: McpTestClient;

    beforeAll(async () => {
      freshMcp = new McpTestClient();
      await freshMcp.connect();
    }, 15000);

    afterAll(async () => {
      await freshMcp.close();
    });

    it('returns error when browser not started', async () => {
      const result = await freshMcp.callTool('browser_list_tabs');
      expect(freshMcp.getText(result)).toMatch(/browser not started/i);
    });
  });
});
