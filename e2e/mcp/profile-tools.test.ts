import { McpTestClient } from './client.js';

describe('MCP E2E: browser_start with profileName', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
  }, 15000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('starts the browser with a custom profile name', async () => {
    const result = await mcp.callTool('browser_start', {
      headless: true,
      profileName: 'e2e-test-profile'
    });
    expect(mcp.getText(result)).toMatch(/browser started/i);
  });

  it('stops the browser with the custom profile', async () => {
    const result = await mcp.callTool('browser_stop');
    expect(mcp.getText(result)).toMatch(/browser stopped/i);
  });

  it('can restart with the same profile', async () => {
    const result = await mcp.callTool('browser_start', {
      headless: true,
      profileName: 'e2e-test-profile'
    });
    expect(mcp.getText(result)).toMatch(/browser started/i);
  });

  it('rejects an invalid profile name', async () => {
    // Stop the currently running browser first
    await mcp.callTool('browser_stop');

    const result = await mcp.callTool('browser_start', {
      headless: true,
      profileName: '../../bad-name'
    });
    // Should get an error about invalid profile name
    const text = mcp.getText(result);
    expect(text).toMatch(/invalid profile name/i);
  });
});
