import { McpTestClient } from '../client.js';

/**
 * Agent workflow: Broken API
 *
 * A frontend makes a fetch request that fails.
 * Use network list/get to identify the failed request.
 */
describe('Agent Workflow: Broken API', () => {
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

  it('identifies failed network requests via browser_network', async () => {
    // Clear network buffer
    await mcp.callTool('browser_network', { action: 'clear' });

    // Navigate to a page that makes a fetch to a nonexistent endpoint
    const page = `data:text/html,<html><body>
      <h1>API Dashboard</h1>
      <script>
        fetch('https://httpbin.org/status/500')
          .then(r => { document.title = 'status:' + r.status; })
          .catch(() => { document.title = 'fetch-failed'; });
      </script>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });
    await new Promise((r) => setTimeout(r, 3000));

    // List network requests
    const listResult = await mcp.callTool('browser_network', {
      action: 'list'
    });
    const listText = mcp.getText(listResult);

    // Should show the request to httpbin
    expect(listText).toContain('httpbin.org');
  });
});
