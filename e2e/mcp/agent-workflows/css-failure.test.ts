import { McpTestClient } from '../client.js';

/**
 * Agent workflow: CSS Failure
 *
 * A page has a hidden element. Use snapshot + styles to diagnose why
 * it's not visible.
 */
describe('Agent Workflow: CSS Failure', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    await mcp.startBrowser(true);
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('diagnoses a hidden element via browser_styles', async () => {
    const page = `data:text/html,<html><body>
      <h1>Dashboard</h1>
      <button id="visible-btn">Save</button>
      <button id="hidden-btn" style="display: none;">Delete</button>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });

    // Snapshot — the hidden button may appear but marked as not visible
    const snapResult = await mcp.callTool('browser_snapshot');
    const snapText = mcp.getText(snapResult);
    expect(snapText).toContain('Save');

    // Find the visible Save button and inspect its styles
    const saveResult = await mcp.callTool('browser_find', {
      role: 'button',
      name: 'Save'
    });
    const saveRef = mcp.getText(saveResult).match(/\[(e\d+)\]/)?.[1];
    expect(saveRef).toBeDefined();

    const saveStyles = await mcp.callTool('browser_styles', {
      ref: saveRef!,
      properties: ['display', 'visibility', 'opacity']
    });
    const saveStylesText = mcp.getText(saveStyles);
    // Save button should be visible
    expect(saveStylesText).not.toContain('display: none');
  });
});
