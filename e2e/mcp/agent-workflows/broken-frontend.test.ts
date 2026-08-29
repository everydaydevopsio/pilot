import { McpTestClient } from '../client.js';

/**
 * Agent workflow: Broken Frontend
 *
 * Navigate to a page that throws JavaScript errors.
 * Use snapshot + errors to identify the problem.
 */
describe('Agent Workflow: Broken Frontend', () => {
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

  it('detects JavaScript errors via browser_errors', async () => {
    // Navigate to a page that throws an error
    const page = `data:text/html,<html><body>
      <h1>Broken App</h1>
      <script>
        undefinedFunction();
      </script>
    </body></html>`;

    await mcp.callTool('browser_navigate', { url: page });

    // Wait for error to be captured
    await new Promise((r) => setTimeout(r, 500));

    // Check for errors
    const errResult = await mcp.callTool('browser_errors', { action: 'list' });
    const errText = mcp.getText(errResult);
    expect(errText).toContain('undefinedFunction');
  });

  it('captures console.error messages via browser_console', async () => {
    const page = `data:text/html,<html><body>
      <h1>App with Console Errors</h1>
      <script>
        console.error('Database connection failed');
        console.warn('Cache miss on key: user_123');
      </script>
    </body></html>`;

    // Clear previous messages
    await mcp.callTool('browser_console', { action: 'clear' });

    await mcp.callTool('browser_navigate', { url: page });
    await new Promise((r) => setTimeout(r, 500));

    const consoleResult = await mcp.callTool('browser_console', {
      action: 'list',
      level: 'error'
    });
    const consoleText = mcp.getText(consoleResult);
    expect(consoleText).toContain('Database connection failed');
  });
});
