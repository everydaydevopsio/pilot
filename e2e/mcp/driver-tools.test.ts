import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { E2E_BROWSER, McpTestClient } from './client.js';
import { dataUrl } from './agent-workflows/helpers.js';

/**
 * #62: every browser-dependent tool runs through the BrowserDriver layer.
 * These cover the tools the other E2E suites do not exercise, against the
 * real driver for E2E_BROWSER (#58: PILOT_BROWSER=firefox).
 */
describe('MCP E2E: driver-backed tools', () => {
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

  async function evaluate(expression: string): Promise<unknown> {
    const result = await mcp.callTool('browser_evaluate', { expression });
    return JSON.parse(mcp.getText(result)).value;
  }

  async function refFor(args: Record<string, unknown>): Promise<string> {
    const text = mcp.getText(await mcp.callTool('browser_find', args));
    const ref = text.match(/\[(e\d+)\]/)?.[1];
    if (!ref) throw new Error(`No ref for ${JSON.stringify(args)}: ${text}`);
    return ref;
  }

  it('browser_status reports the active driver', async () => {
    const status = JSON.parse(
      mcp.getText(await mcp.callTool('browser_status'))
    );
    expect(status.session).toMatchObject({
      browser: E2E_BROWSER,
      mode: 'launched',
      connected: true
    });
  });

  it('browser_hover moves the pointer over an element', async () => {
    await mcp.callTool('browser_navigate', {
      url: dataUrl(`<button id="b"
        onmouseover="document.title='hovered'">Hover me</button>`)
    });
    const ref = await refFor({ role: 'button', name: 'Hover me' });
    const result = await mcp.callTool('browser_hover', { ref });
    expect(mcp.getText(result)).toMatch(/^Hovered at \(\d+(\.\d+)?, \d+/);
    expect(await evaluate('document.title')).toBe('hovered');
  });

  it('browser_press_key sends keys to the focused element', async () => {
    await mcp.callTool('browser_navigate', {
      url: dataUrl(`<input id="i" autofocus
        onkeydown="if (event.key === 'Enter') document.title = 'entered'" />`)
    });
    await evaluate('document.getElementById("i").focus()');
    const result = await mcp.callTool('browser_press_key', { key: 'Enter' });
    expect(mcp.getText(result)).toBe('Pressed Enter');
    expect(await evaluate('document.title')).toBe('entered');
  });

  it('browser_scroll scrolls the page', async () => {
    await mcp.callTool('browser_navigate', {
      url: dataUrl('<div style="height:5000px">tall</div>')
    });
    const result = await mcp.callTool('browser_scroll', { y: 1200 });
    expect(mcp.getText(result)).toMatch(/^Scrolled to \(0, 1200\)/);
    expect(await evaluate('window.scrollY')).toBe(1200);
  });

  it('browser_upload sets files on a file input', async () => {
    await mcp.callTool('browser_navigate', {
      url: dataUrl('<label>Attachment <input type="file" id="f" /></label>')
    });
    const snapshot = mcp.getText(await mcp.callTool('browser_snapshot'));
    const ref = snapshot.match(/\[(e\d+)\][^\n]*Attachment/)?.[1];
    expect(ref).toBeDefined();
    const result = await mcp.callTool('browser_upload', {
      ref: ref!,
      files: ['package.json']
    });
    expect(mcp.getText(result)).toBe(`Uploaded 1 file(s) to ${ref}`);
    expect(await evaluate('document.getElementById("f").files[0].name')).toBe(
      'package.json'
    );
  });

  it('browser_downloads lists and clears the tracker', async () => {
    const list = await mcp.callTool('browser_downloads', { action: 'list' });
    expect(mcp.getText(list)).toBe('No downloads tracked.');
    const clear = await mcp.callTool('browser_downloads', { action: 'clear' });
    expect(mcp.getText(clear)).toBe('Cleared 0 download records.');
  });

  const chromeOnly = E2E_BROWSER === 'chrome' ? it : it.skip;
  const firefoxOnly = E2E_BROWSER === 'firefox' ? it : it.skip;

  // #58 AC2: unsupported tools fail with a capability error naming the browser.
  firefoxOnly('browser_performance is rejected by firefox', async () => {
    const result = await mcp.callTool('browser_performance', {
      action: 'start'
    });
    expect(result.isError).toBe(true);
    expect(mcp.getText(result)).toMatch(
      /browser_performance is not supported by firefox \(missing capabilities: performanceTrace\)/
    );
  });

  firefoxOnly('browser_styles reports computed styles only', async () => {
    await mcp.callTool('browser_navigate', {
      url: dataUrl('<button style="padding:4px">Styled</button>')
    });
    const ref = await refFor({ role: 'button', name: 'Styled' });
    const text = mcp.getText(
      await mcp.callTool('browser_styles', {
        ref,
        properties: ['padding-top', 'display']
      })
    );
    expect(text).toContain('padding-top: 4px');
    expect(text).toContain('Box Model:');
    expect(text).toMatch(/Matched Rules: not available in firefox/);
  });

  firefoxOnly('browser_network returns a response body', async () => {
    await mcp.callTool('browser_network', { action: 'clear' });
    await mcp.callTool('browser_navigate', {
      url: dataUrl('<h1>Body</h1>')
    });
    await mcp.callTool('browser_evaluate', {
      expression: `fetch('data:application/json,{"ok":true}').then(r => r.text())`
    });
    const list = mcp.getText(
      await mcp.callTool('browser_network', { action: 'list', url: 'json' })
    );
    const id = list.match(/\[([^\]]+)\] GET/)?.[1];
    expect(id).toBeDefined();
    const detail = mcp.getText(
      await mcp.callTool('browser_network', { action: 'get', requestId: id })
    );
    expect(detail).toContain('{"ok":true}');
  });

  chromeOnly('browser_performance traces a navigation', async () => {
    const start = await mcp.callTool('browser_performance', {
      action: 'start'
    });
    expect(mcp.getText(start)).toBe('Performance tracing started.');
    await mcp.callTool('browser_navigate', {
      url: dataUrl('<h1>Perf</h1>')
    });
    const stop = await mcp.callTool('browser_performance', { action: 'stop' });
    expect(mcp.getText(stop)).toMatch(/Tracing stopped\. \d+ events captured/);
    const analyze = await mcp.callTool('browser_performance', {
      action: 'analyze'
    });
    expect(analyze.isError).toBeFalsy();
    expect(mcp.getText(analyze).length).toBeGreaterThan(0);
  });

  it('browser_tabs manages tabs through one tool', async () => {
    const opened = mcp.getText(
      await mcp.callTool('browser_tabs', {
        action: 'new',
        url: 'about:blank'
      })
    );
    const targetId = opened.match(/targetId: ([^,]+),/)?.[1];
    expect(targetId).toBeDefined();

    const tabs = JSON.parse(
      mcp.getText(await mcp.callTool('browser_tabs', { action: 'list' }))
    ) as Array<{ targetId: string; active: boolean }>;
    expect(tabs.find((t) => t.targetId === targetId)?.active).toBe(true);

    const other = tabs.find((t) => t.targetId !== targetId)!;
    const selected = await mcp.callTool('browser_tabs', {
      action: 'select',
      targetId: other.targetId
    });
    expect(mcp.getText(selected)).toBe(`Switched to tab ${other.targetId}.`);

    const closed = await mcp.callTool('browser_tabs', {
      action: 'close',
      targetId
    });
    expect(mcp.getText(closed)).toBe(`Tab ${targetId} closed.`);

    const missing = await mcp.callTool('browser_tabs', { action: 'select' });
    expect(missing.isError).toBe(true);
  });

  it('browser_connect refuses while a browser is running', async () => {
    const result = await mcp.callTool('browser_connect', {});
    expect(mcp.getText(result)).toMatch(/Already connected/);
  });
});

describe('MCP E2E: browser_connect without a browser', () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.connect();
  }, 15000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
  });

  it('reports an unreachable debugging port and stays disconnected', async () => {
    const result = await mcp.callTool('browser_connect', {
      host: '127.0.0.1',
      port: 1
    });
    expect(result.isError).toBe(true);
    const name = E2E_BROWSER === 'firefox' ? 'Firefox' : 'Chrome';
    expect(mcp.getText(result)).toMatch(
      new RegExp(`Could not connect to ${name} at 127\\.0\\.0\\.1:1`)
    );
    const status = JSON.parse(
      mcp.getText(await mcp.callTool('browser_status'))
    );
    expect(status.session).toEqual({ mode: 'none', connected: false });
  });
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port'))
      );
    });
  });
}

// #58: browser_connect attaches to a Firefox the user started themselves.
const describeFirefox = E2E_BROWSER === 'firefox' ? describe : describe.skip;

describeFirefox('MCP E2E: browser_connect to a running Firefox', () => {
  let mcp: McpTestClient;
  let firefox: ChildProcess;
  let profileDir: string;
  let port: number;

  beforeAll(async () => {
    port = await freePort();
    profileDir = mkdtempSync(join(tmpdir(), 'pilot-e2e-ff-'));
    firefox = spawn(
      process.env.PILOT_FIREFOX_PATH ??
        '/Applications/Firefox.app/Contents/MacOS/firefox',
      [
        `--remote-debugging-port=${port}`,
        '-no-remote',
        '-profile',
        profileDir,
        '--headless',
        'about:blank'
      ],
      { stdio: 'ignore' }
    );
    mcp = new McpTestClient();
    await mcp.connect();
  }, 30000);

  afterAll(async () => {
    await mcp.stopBrowser();
    await mcp.close();
    firefox.kill();
    rmSync(profileDir, { recursive: true, force: true });
  });

  it('connects, drives the page, and disconnects without stopping Firefox', async () => {
    let result = await mcp.callTool('browser_connect', {
      browser: 'firefox',
      port
    });
    for (let i = 0; i < 40 && result.isError; i++) {
      await new Promise((r) => setTimeout(r, 500));
      result = await mcp.callTool('browser_connect', {
        browser: 'firefox',
        port
      });
    }
    expect(result.isError).toBeFalsy();
    expect(mcp.getText(result)).toContain(`127.0.0.1:${port}`);

    const status = JSON.parse(
      mcp.getText(await mcp.callTool('browser_status'))
    );
    expect(status.session).toMatchObject({
      browser: 'firefox',
      mode: 'external',
      connected: true,
      bidiPort: port
    });

    await mcp.callTool('browser_navigate', {
      url: dataUrl('<title>External</title>')
    });
    const info = JSON.parse(
      mcp.getText(await mcp.callTool('browser_page_info'))
    );
    expect(info.title).toBe('External');

    await mcp.callTool('browser_stop');
    expect(firefox.exitCode).toBeNull();
  });
});
