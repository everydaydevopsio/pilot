import { McpTestClient } from '../client.js';

/**
 * Agent workflow: Dynamic DOM
 *
 * Snapshot → mutate DOM → verify old ref is stale → re-snapshot → use new ref.
 */
describe('Agent Workflow: Dynamic DOM', () => {
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

  it('detects stale refs after DOM replacement', async () => {
    const page = `data:text/html,<html><body>
      <div id="app">
        <button id="btn1">Original Button</button>
      </div>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });

    // Take initial snapshot
    const snap1 = await mcp.callTool('browser_snapshot');
    const snap1Text = mcp.getText(snap1);
    expect(snap1Text).toContain('Original Button');

    // Get the button ref
    const btnResult = await mcp.callTool('browser_find', {
      role: 'button',
      name: 'Original Button'
    });
    const oldRef = mcp.getText(btnResult).match(/\[(e\d+)\]/)?.[1];
    expect(oldRef).toBeDefined();

    // Replace the DOM — navigate to a new page (invalidates refs)
    const page2 = `data:text/html,<html><body>
      <div id="app">
        <button id="btn2">Replaced Button</button>
      </div>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page2 });

    // Old ref should be stale — trying to click it should error
    const clickResult = await mcp.callTool('browser_click', {
      ref: oldRef!
    });
    const clickText = mcp.getText(clickResult);
    expect(clickText).toMatch(/stale|STALE_ELEMENT_REFERENCE/i);

    // Take a new snapshot — should see the new button
    const snap2 = await mcp.callTool('browser_snapshot');
    const snap2Text = mcp.getText(snap2);
    expect(snap2Text).toContain('Replaced Button');

    // Find and use the new ref successfully
    const newBtnResult = await mcp.callTool('browser_find', {
      role: 'button',
      name: 'Replaced Button'
    });
    const newRef = mcp.getText(newBtnResult).match(/\[(e\d+)\]/)?.[1];
    expect(newRef).toBeDefined();

    // Click should succeed with the new ref
    const clickResult2 = await mcp.callTool('browser_click', {
      ref: newRef!
    });
    const clickText2 = mcp.getText(clickResult2);
    expect(clickText2).toMatch(/clicked at/i);
  });
});
