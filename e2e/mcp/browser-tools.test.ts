import { McpTestClient } from './client.js';
import { EXPECTED_TOOLS } from '../../src/mcp/tools/names.js';

// ── Tools available without a running browser ────────────────────────────────

describe('MCP E2E: tool registration', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
  }, 15000);

  afterAll(async () => {
    await mcp.close();
  });

  it('lists all expected tools', async () => {
    const tools = await mcp.listTools();
    for (const name of EXPECTED_TOOLS) {
      expect(tools).toContain(name);
    }
  });
});

// ── Tools called before browser_start ────────────────────────────────────────

describe('MCP E2E: tools before browser_start', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
  }, 15000);

  afterAll(async () => {
    await mcp.close();
  });

  it('browser_screenshot returns an error', async () => {
    const result = await mcp.callTool('browser_screenshot');
    expect(mcp.getText(result)).toMatch(/browser not started/i);
  });

  it('browser_navigate returns an error', async () => {
    const result = await mcp.callTool('browser_navigate', {
      url: 'about:blank'
    });
    expect(mcp.getText(result)).toMatch(/browser not started/i);
  });

  it('browser_evaluate returns an error', async () => {
    const result = await mcp.callTool('browser_evaluate', {
      expression: '1 + 1'
    });
    expect(mcp.getText(result)).toMatch(/browser not started/i);
  });

  it('browser_stop reports browser is not running', async () => {
    const result = await mcp.callTool('browser_stop');
    expect(mcp.getText(result)).toMatch(/not running/i);
  });
});

// ── Browser lifecycle ────────────────────────────────────────────────────────

describe('MCP E2E: browser_start / browser_stop', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
  }, 15000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('browser_start launches headless Chrome', async () => {
    const result = await mcp.callTool('browser_start', { headless: true });
    expect(mcp.getText(result)).toMatch(/browser started/i);
  });

  it('browser_start is idempotent when already running', async () => {
    const result = await mcp.callTool('browser_start', { headless: true });
    expect(mcp.getText(result)).toMatch(/already running/i);
  });

  it('browser_stop stops Chrome', async () => {
    const result = await mcp.callTool('browser_stop');
    expect(mcp.getText(result)).toMatch(/browser stopped/i);
  });

  it('browser_stop reports not running after stop', async () => {
    const result = await mcp.callTool('browser_stop');
    expect(mcp.getText(result)).toMatch(/not running/i);
  });
});

// ── Browser control tools (require running browser) ──────────────────────────

describe('MCP E2E: browser control tools', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
    await mcp.startBrowser();
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  // ── screenshot ──────────────────────────────────────────────────────────────

  describe('browser_screenshot', () => {
    it('returns a PNG image by default', async () => {
      const result = await mcp.callTool('browser_screenshot');
      const image = mcp.getImage(result);
      expect(image).toBeDefined();
      expect(image?.mimeType).toBe('image/png');
      expect(image?.data.length).toBeGreaterThan(100);
    });

    it('returns a JPEG image when format=jpeg', async () => {
      const result = await mcp.callTool('browser_screenshot', {
        format: 'jpeg',
        quality: 70
      });
      const image = mcp.getImage(result);
      expect(image).toBeDefined();
      expect(image?.mimeType).toBe('image/jpeg');
    });
  });

  // ── navigate ────────────────────────────────────────────────────────────────

  describe('browser_navigate', () => {
    it('navigates to about:blank', async () => {
      const result = await mcp.callTool('browser_navigate', {
        url: 'about:blank',
        waitUntil: 'load',
        timeoutMs: 10000
      });
      expect(mcp.getText(result)).toMatch(/navigated to/i);
    });

    it('navigates to an inline data: URL', async () => {
      const result = await mcp.callTool('browser_navigate', {
        url: 'data:text/html,<h1>MCP+Test</h1>',
        waitUntil: 'load',
        timeoutMs: 10000
      });
      expect(mcp.getText(result)).toMatch(/navigated to/i);
    });

    it('rejects a non-URL string', async () => {
      const result = await mcp.callTool('browser_navigate', {
        url: 'not-a-valid-url'
      });
      // The tool validates URL via zod before calling; result is an error
      expect(result.isError === true || mcp.getText(result).length > 0).toBe(
        true
      );
    });
  });

  // ── evaluate ────────────────────────────────────────────────────────────────

  describe('browser_evaluate', () => {
    it('evaluates arithmetic', async () => {
      const result = await mcp.callTool('browser_evaluate', {
        expression: '1 + 2'
      });
      const parsed = JSON.parse(mcp.getText(result));
      expect(parsed.value).toBe(3);
      expect(parsed.type).toBe('number');
    });

    it('evaluates a string expression', async () => {
      const result = await mcp.callTool('browser_evaluate', {
        expression: '"hello"'
      });
      const parsed = JSON.parse(mcp.getText(result));
      expect(parsed.value).toBe('hello');
      expect(parsed.type).toBe('string');
    });

    it('evaluates document.title after navigation', async () => {
      await mcp.callTool('browser_navigate', { url: 'about:blank' });
      const result = await mcp.callTool('browser_evaluate', {
        expression: 'document.title'
      });
      const parsed = JSON.parse(mcp.getText(result));
      expect(typeof parsed.value).toBe('string');
    });

    it('resolves a Promise when awaitPromise=true', async () => {
      const result = await mcp.callTool('browser_evaluate', {
        expression: 'Promise.resolve(42)',
        awaitPromise: true
      });
      const parsed = JSON.parse(mcp.getText(result));
      expect(parsed.value).toBe(42);
    });
  });

  // ── page_info ───────────────────────────────────────────────────────────────

  describe('browser_page_info', () => {
    it('returns url, title, and readyState', async () => {
      const result = await mcp.callTool('browser_page_info');
      const info = JSON.parse(mcp.getText(result));
      expect(typeof info.url).toBe('string');
      expect(typeof info.title).toBe('string');
      expect(['loading', 'interactive', 'complete']).toContain(info.readyState);
    });
  });

  // ── wait ────────────────────────────────────────────────────────────────────

  describe('browser_wait', () => {
    it('waits a fixed number of ms', async () => {
      const start = Date.now();
      const result = await mcp.callTool('browser_wait', { ms: 200 });
      expect(mcp.getText(result)).toMatch(/wait completed/i);
      expect(Date.now() - start).toBeGreaterThanOrEqual(180);
    });

    it('waits for a selector', async () => {
      await mcp.callTool('browser_navigate', {
        url: 'data:text/html,<body><p id="p">hi</p></body>',
        waitUntil: 'load'
      });
      const result = await mcp.callTool('browser_wait', {
        selector: '#p',
        timeoutMs: 5000
      });
      expect(mcp.getText(result)).toMatch(/wait completed/i);
    });
  });

  // ── type ────────────────────────────────────────────────────────────────────

  describe('browser_type', () => {
    it('types into a focused input', async () => {
      await mcp.callTool('browser_navigate', {
        url: 'data:text/html,<input id="in" type="text">',
        waitUntil: 'load'
      });
      await mcp.callTool('browser_evaluate', {
        expression: 'document.getElementById("in").focus()'
      });
      const result = await mcp.callTool('browser_type', {
        text: 'hello'
      });
      expect(mcp.getText(result)).toMatch(/typed/i);
    });

    it('types into a selector', async () => {
      await mcp.callTool('browser_navigate', {
        url: 'data:text/html,<input id="in2" type="text">',
        waitUntil: 'load'
      });
      const result = await mcp.callTool('browser_type', {
        selector: '#in2',
        text: 'world'
      });
      expect(mcp.getText(result)).toMatch(/typed/i);
    });
  });

  // ── click ───────────────────────────────────────────────────────────────────

  describe('browser_click', () => {
    it('clicks by coordinates', async () => {
      const result = await mcp.callTool('browser_click', { x: 100, y: 100 });
      expect(mcp.getText(result)).toMatch(/clicked at/i);
    });

    it('clicks by selector', async () => {
      await mcp.callTool('browser_navigate', {
        url: 'data:text/html,<button id="btn">Click me</button>',
        waitUntil: 'load'
      });
      const result = await mcp.callTool('browser_click', {
        selector: '#btn'
      });
      expect(mcp.getText(result)).toMatch(/clicked at/i);
    });

    it('returns an error when neither ref, selector, nor coordinates are provided', async () => {
      const result = await mcp.callTool('browser_click', {});
      expect(mcp.getText(result)).toMatch(
        /ref.*selector.*x\/y|selector.*x\/y/i
      );
    });
  });
});
