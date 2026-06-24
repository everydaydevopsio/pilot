import { McpTestClient } from './client.js';

// Pages need a viewport meta tag for mobile emulation to report the correct
// device width via window.innerWidth (without it, Chrome defaults to 980px
// layout viewport — the same as a real mobile browser on a page without the
// tag).
const VIEWPORT_PAGE =
  'data:text/html,<meta name="viewport" content="width=device-width, initial-scale=1"><body>viewport</body>';

// Helper to read the viewport dimensions from the browser via evaluate
async function getViewportSize(
  mcp: McpTestClient
): Promise<{ width: number; height: number }> {
  const result = await mcp.callTool('browser_evaluate', {
    expression:
      'JSON.stringify({ width: window.innerWidth, height: window.innerHeight })'
  });
  const parsed = JSON.parse(mcp.getText(result));
  return JSON.parse(parsed.value);
}

// Helper to read devicePixelRatio
async function getDevicePixelRatio(mcp: McpTestClient): Promise<number> {
  const result = await mcp.callTool('browser_evaluate', {
    expression: 'window.devicePixelRatio'
  });
  const parsed = JSON.parse(mcp.getText(result));
  return parsed.value;
}

// ── Default viewport (desktop) ──────────────────────────────────────────────

describe('MCP E2E: viewport default (desktop)', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    await mcp.callTool('browser_start', { headless: true });
    await mcp.callTool('browser_navigate', {
      url: VIEWPORT_PAGE,
      waitUntil: 'load'
    });
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('browser_start reports desktop viewport', async () => {
    // Start again to check response text (browser already running returns different text)
    await mcp.stopBrowser();
    const result = await mcp.callTool('browser_start', { headless: true });
    expect(mcp.getText(result)).toMatch(/viewport: desktop/i);
    await mcp.callTool('browser_navigate', {
      url: VIEWPORT_PAGE,
      waitUntil: 'load'
    });
  });

  it('has desktop dimensions (1920x1080)', async () => {
    const size = await getViewportSize(mcp);
    expect(size.width).toBe(1920);
    expect(size.height).toBe(1080);
  });

  it('has devicePixelRatio of 1', async () => {
    const dpr = await getDevicePixelRatio(mcp);
    expect(dpr).toBe(1);
  });
});

// ── Mobile viewport ─────────────────────────────────────────────────────────

describe('MCP E2E: viewport mobile', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    const result = await mcp.callTool('browser_start', {
      headless: true,
      viewport: 'mobile'
    });
    expect(mcp.getText(result)).toMatch(/viewport: mobile/i);
    await mcp.callTool('browser_navigate', {
      url: VIEWPORT_PAGE,
      waitUntil: 'load'
    });
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('has mobile dimensions (390x844)', async () => {
    const size = await getViewportSize(mcp);
    expect(size.width).toBe(390);
    expect(size.height).toBe(844);
  });

  it('has devicePixelRatio of 3', async () => {
    const dpr = await getDevicePixelRatio(mcp);
    expect(dpr).toBe(3);
  });

  it('has a mobile user-agent', async () => {
    const result = await mcp.callTool('browser_evaluate', {
      expression: 'navigator.userAgent'
    });
    const parsed = JSON.parse(mcp.getText(result));
    expect(parsed.value).toMatch(/Mobile/);
  });
});

// ── Tablet viewport ─────────────────────────────────────────────────────────

describe('MCP E2E: viewport tablet', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    const result = await mcp.callTool('browser_start', {
      headless: true,
      viewport: 'tablet'
    });
    expect(mcp.getText(result)).toMatch(/viewport: tablet/i);
    await mcp.callTool('browser_navigate', {
      url: VIEWPORT_PAGE,
      waitUntil: 'load'
    });
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('has tablet dimensions (768x1024)', async () => {
    const size = await getViewportSize(mcp);
    expect(size.width).toBe(768);
    expect(size.height).toBe(1024);
  });

  it('has devicePixelRatio of 2', async () => {
    const dpr = await getDevicePixelRatio(mcp);
    expect(dpr).toBe(2);
  });
});

// ── Custom viewport overrides ───────────────────────────────────────────────

describe('MCP E2E: viewport custom overrides', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    await mcp.callTool('browser_start', {
      headless: true,
      viewport: 'desktop',
      viewportWidth: 1280,
      viewportHeight: 720
    });
    await mcp.callTool('browser_navigate', {
      url: VIEWPORT_PAGE,
      waitUntil: 'load'
    });
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('has custom dimensions (1280x720)', async () => {
    const size = await getViewportSize(mcp);
    expect(size.width).toBe(1280);
    expect(size.height).toBe(720);
  });
});
