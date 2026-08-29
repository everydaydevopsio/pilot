import { McpTestClient } from '../client.js';

/**
 * Agent workflow: Dialog handling
 *
 * Trigger an alert dialog via evaluate (setTimeout to avoid blocking CDP),
 * detect it, and accept it.
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
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });

    // Trigger alert asynchronously so CDP isn't blocked
    await mcp.callTool('browser_evaluate', {
      expression: "setTimeout(() => alert('Action completed!'), 100)",
      awaitPromise: false
    });
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
