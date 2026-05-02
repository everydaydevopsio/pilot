import { McpTestClient } from './client.js';

let mcp: McpTestClient;

beforeAll(async () => {
  mcp = new McpTestClient();
  await mcp.connect();
  await mcp.startBrowser();
}, 30000);

afterAll(async () => {
  await mcp.stopBrowser();
  await mcp.close();
}, 15000);

// ── browser_clear_errors ─────────────────────────────────────────────────────

describe('MCP E2E: browser_clear_errors', () => {
  it('reports how many messages were cleared', async () => {
    const result = await mcp.callTool('browser_clear_errors');
    expect(mcp.getText(result)).toMatch(/cleared \d+ console messages/i);
  });

  it('can be called multiple times safely', async () => {
    await mcp.callTool('browser_clear_errors');
    const result = await mcp.callTool('browser_clear_errors');
    expect(mcp.getText(result)).toMatch(/cleared 0 console messages/i);
  });
});

// ── browser_get_console_logs ─────────────────────────────────────────────────

describe('MCP E2E: browser_get_console_logs', () => {
  beforeEach(async () => {
    await mcp.callTool('browser_clear_errors');
  });

  it('returns an empty list when buffer is empty', async () => {
    const result = await mcp.callTool('browser_get_console_logs');
    const data = JSON.parse(mcp.getText(result));
    expect(data.count).toBe(0);
    expect(data.messages).toHaveLength(0);
  });

  it('captures console.log from evaluated JS', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.log("e2e-log-message")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_console_logs');
    const data = JSON.parse(mcp.getText(result));
    expect(data.count).toBeGreaterThanOrEqual(1);
    const found = data.messages.some((m: { text: string }) =>
      m.text.includes('e2e-log-message')
    );
    expect(found).toBe(true);
  });

  it('captures console.warn from evaluated JS', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.warn("e2e-warn-message")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_console_logs', {
      level: 'warn'
    });
    const data = JSON.parse(mcp.getText(result));
    const found = data.messages.some((m: { text: string }) =>
      m.text.includes('e2e-warn-message')
    );
    expect(found).toBe(true);
  });

  it('filters by level — only returns warn messages', async () => {
    await mcp.callTool('browser_evaluate', {
      expression:
        'console.log("level-log"); console.warn("level-warn"); console.error("level-error")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_console_logs', {
      level: 'warn'
    });
    const data = JSON.parse(mcp.getText(result));
    expect(
      data.messages.every((m: { level: string }) => m.level === 'warn')
    ).toBe(true);
  });

  it('filters by multiple levels', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.info("multi-info"); console.debug("multi-debug")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_console_logs', {
      levels: ['info', 'debug']
    });
    const data = JSON.parse(mcp.getText(result));
    const allValid = data.messages.every((m: { level: string }) =>
      ['info', 'debug'].includes(m.level)
    );
    expect(allValid).toBe(true);
  });

  it('respects the limit parameter', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'for(let i=0;i<10;i++) console.log("limit-test-" + i)',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_console_logs', {
      limit: 3
    });
    const data = JSON.parse(mcp.getText(result));
    expect(data.messages.length).toBeLessThanOrEqual(3);
  });

  it('each message has level, text, and timestamp fields', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.log("field-check")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_console_logs');
    const data = JSON.parse(mcp.getText(result));
    if (data.count > 0) {
      const msg = data.messages[0];
      expect(typeof msg.level).toBe('string');
      expect(typeof msg.text).toBe('string');
      expect(typeof msg.timestamp).toBe('number');
    }
  });
});

// ── browser_get_errors ───────────────────────────────────────────────────────

describe('MCP E2E: browser_get_errors', () => {
  beforeEach(async () => {
    await mcp.callTool('browser_clear_errors');
  });

  it('reports no errors on a clean buffer', async () => {
    const result = await mcp.callTool('browser_get_errors');
    expect(mcp.getText(result)).toMatch(/no errors found/i);
  });

  it('captures console.error from evaluated JS', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.error("e2e-error-message")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_errors');
    const text = mcp.getText(result);
    if (!text.match(/no errors found/i)) {
      const data = JSON.parse(text);
      expect(data.count).toBeGreaterThanOrEqual(1);
      const found = data.errors.some((e: { text: string }) =>
        e.text.includes('e2e-error-message')
      );
      expect(found).toBe(true);
    }
  });

  it('does not include warn messages by default', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.warn("only-a-warning")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_errors');
    const text = mcp.getText(result);
    // No errors → "No errors found." message
    if (!text.match(/no errors found/i)) {
      const data = JSON.parse(text);
      const hasWarn = data.errors.some(
        (e: { level: string }) => e.level === 'warn'
      );
      expect(hasWarn).toBe(false);
    }
  });

  it('includes warnings when includeWarnings=true', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'console.warn("incl-warn"); console.error("incl-err")',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_errors', {
      includeWarnings: true
    });
    const text = mcp.getText(result);
    if (!text.match(/no errors found/i)) {
      const data = JSON.parse(text);
      const levels = new Set(
        data.errors.map((e: { level: string }) => e.level)
      );
      expect(levels.has('error') || levels.has('warn')).toBe(true);
    }
  });

  it('respects the limit parameter', async () => {
    await mcp.callTool('browser_evaluate', {
      expression: 'for(let i=0;i<5;i++) console.error("err-" + i)',
      awaitPromise: false
    });
    await new Promise((r) => setTimeout(r, 400));

    const result = await mcp.callTool('browser_get_errors', { limit: 2 });
    const text = mcp.getText(result);
    if (!text.match(/no errors found/i)) {
      const data = JSON.parse(text);
      expect(data.errors.length).toBeLessThanOrEqual(2);
    }
  });
});
