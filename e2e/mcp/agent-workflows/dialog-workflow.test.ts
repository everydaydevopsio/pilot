import { McpTestClient } from '../client.js';

/**
 * Agent workflow: Dialog handling
 *
 * Navigate to a page with an alert dialog, detect it, and accept it.
 * (Replaces upload/download test since those require filesystem fixtures
 * that are hard to set up in the Docker E2E environment.)
 */
describe('Agent Workflow: Dialog Handling', () => {
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

  it('detects and accepts a dialog', async () => {
    const page = `data:text/html,<html><body>
      <h1>Dialog Test</h1>
      <button onclick="alert('Action completed!')">Trigger Alert</button>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });

    // Find and click the button to trigger the alert
    const btnResult = await mcp.callTool('browser_find', {
      role: 'button',
      name: 'Trigger Alert'
    });
    const btnRef = mcp.getText(btnResult).match(/\[(e\d+)\]/)?.[1];
    expect(btnRef).toBeDefined();

    await mcp.callTool('browser_click', { ref: btnRef! });
    await new Promise((r) => setTimeout(r, 500));

    // List pending dialogs
    const listResult = await mcp.callTool('browser_dialog', {
      action: 'list'
    });
    const listText = mcp.getText(listResult);
    expect(listText).toContain('Action completed!');

    // Accept the dialog
    const acceptResult = await mcp.callTool('browser_dialog', {
      action: 'accept'
    });
    const acceptText = mcp.getText(acceptResult);
    expect(acceptText).toContain('accepted');
  });
});
