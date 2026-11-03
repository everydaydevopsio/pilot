// Issue #25: browser_start must not wait out the full startup timeout when
// Chrome cannot start, and the default timeout must cover slow cold starts.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BrowserManager } from '../src/browser.js';
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  waitForChromeReady
} from '../src/browser/chrome-launcher.js';
import { loadConfig } from '../src/util/config.js';

describe('BrowserManager.launch startup failures', () => {
  const origXdg = process.env.XDG_DATA_HOME;
  let workDir: string;
  let manager: BrowserManager | null = null;

  function fakeChrome(name: string, body: string): string {
    const path = join(workDir, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
    return path;
  }

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pilot-launch-test-'));
    process.env.XDG_DATA_HOME = join(workDir, 'data');
    manager = new BrowserManager(loadConfig());
  });

  afterEach(async () => {
    await manager?.destroy();
    manager = null;
    if (origXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origXdg;
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  it('fails fast with Chrome stderr when Chrome exits before DevTools is ready', async () => {
    const chromePath = fakeChrome(
      'exits.sh',
      'echo "Missing X server or $DISPLAY" >&2\nexit 3'
    );
    const started = Date.now();

    await expect(
      manager!.launch({
        chromePath,
        headless: true,
        profileName: 'exits',
        startupTimeoutMs: 20000
      })
    ).rejects.toThrow(
      /Chrome exited \(exit code 3\) before DevTools became ready[\s\S]*Missing X server/
    );
    expect(Date.now() - started).toBeLessThan(10000);
    expect(manager!.isLaunched()).toBe(false);
  });

  it('fails fast when the Chrome executable cannot be spawned', async () => {
    // Executable, so Linux preflight passes, but spawn fails with ENOENT.
    const chromePath = join(workDir, 'missing-interpreter');
    writeFileSync(chromePath, '#!/definitely/missing/interpreter\n');
    chmodSync(chromePath, 0o755);
    const started = Date.now();

    await expect(
      manager!.launch({
        chromePath,
        headless: true,
        profileName: 'nospawn',
        startupTimeoutMs: 20000
      })
    ).rejects.toThrow(/Chrome failed to start/);
    expect(Date.now() - started).toBeLessThan(10000);
    expect(manager!.isLaunched()).toBe(false);

    // The manager can launch again after a spawn failure.
    await expect(
      manager!.launch({
        chromePath,
        headless: true,
        profileName: 'nospawn',
        startupTimeoutMs: 20000
      })
    ).rejects.toThrow(/Chrome failed to start/);
  });

  it('reports a readiness timeout when Chrome runs but never opens DevTools', async () => {
    const chromePath = fakeChrome('hangs.sh', 'exec sleep 30');

    await expect(
      manager!.launch({
        chromePath,
        headless: true,
        profileName: 'hangs',
        startupTimeoutMs: 500
      })
    ).rejects.toThrow(/did not become ready on port \d+ within 500ms/);
  });
});

describe('waitForChromeReady', () => {
  it('defaults to a timeout long enough for cold Linux starts', () => {
    expect(DEFAULT_STARTUP_TIMEOUT_MS).toBeGreaterThanOrEqual(60000);
  });

  it('throws the early failure instead of waiting for the deadline', async () => {
    const started = Date.now();
    await expect(
      waitForChromeReady(1, 20000, () => new Error('chrome died'))
    ).rejects.toThrow('chrome died');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
