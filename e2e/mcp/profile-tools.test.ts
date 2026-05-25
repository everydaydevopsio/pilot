import { rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpTestClient } from './client.js';

const TEST_PROFILE = `e2e-profile-${process.pid}`;

function cleanupTestProfile(): void {
  try {
    const xdgData =
      process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    rmSync(join(xdgData, 'aab', TEST_PROFILE), {
      recursive: true,
      force: true
    });
  } catch {
    // best-effort
  }
}

describe('MCP E2E: browser_start with profileName', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
  }, 15000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
    cleanupTestProfile();
  });

  it('starts the browser with a custom profile name', async () => {
    const result = await mcp.callTool('browser_start', {
      headless: true,
      profileName: TEST_PROFILE
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
      profileName: TEST_PROFILE
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
