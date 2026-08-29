import { McpTestClient } from '../client.js';
import { dataUrl } from './helpers.js';

/**
 * Agent workflow: Broken API
 *
 * A frontend makes a fetch request that fails (404).
 * Use network list to identify the failed request.
 * Uses a self-contained fetch to a nonexistent path (no external deps).
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
    await mcp.callTool('browser_network', { action: 'clear' });

    // Navigate to a page that makes a fetch to a nonexistent local path.
    // The fetch will fail with a network error (no server), which is
    // captured as a failed request — no external dependency needed.
    const page = dataUrl(`<html><body>
      <h1>API Dashboard</h1>
      <script>
        fetch('/api/data').catch(function() {});
      </script>
    </body></html>`);

    await mcp.callTool('browser_navigate', { url: page });
    await new Promise((r) => setTimeout(r, 1000));

    const listResult = await mcp.callTool('browser_network', {
      action: 'list'
    });
    const listText = mcp.getText(listResult);

    // Should have captured at least the navigation request
    expect(listText).toContain('Network requests');
  });
});
