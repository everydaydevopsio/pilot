// Issue #25: browser_start must not wait out the full startup timeout when
// Chrome cannot start, and the default timeout must cover slow cold starts.
// Issue #32: a failed launch must not leave Chrome holding the profile, and
// errors must say what was cleaned up and how to recover.
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs';
import { hostname, tmpdir } from 'os';
import { join } from 'path';
import { BrowserManager } from '../src/browser.js';
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  cleanupLockFiles,
  isProcessAlive,
  isProfileLocked,
  resolveUserDataDir,
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

  // Mimics Chrome holding its profile: takes the SingletonLock like Chrome
  // does, records its pid, then never opens DevTools.
  function lockingChrome(): string {
    return fakeChrome(
      'locks.sh',
      [
        'for arg in "$@"; do',
        '  case "$arg" in --user-data-dir=*) dir="${arg#--user-data-dir=}" ;; esac',
        'done',
        `ln -s "${hostname()}-$$" "$dir/SingletonLock"`,
        `echo $$ > "${workDir}/chrome.pid"`,
        'exec sleep 30'
      ].join('\n')
    );
  }

  it('stops Chrome and releases the profile after a readiness timeout', async () => {
    const chromePath = lockingChrome();
    let error: Error | undefined;
    try {
      await manager!.launch({
        chromePath,
        headless: true,
        profileName: 'timeout',
        startupTimeoutMs: 1000
      });
    } catch (err) {
      error = err as Error;
    }

    const pid = Number(readFileSync(join(workDir, 'chrome.pid'), 'utf8'));
    expect(error?.message).toMatch(/did not become ready/);
    expect(error?.message).toContain(
      `Pilot stopped the Chrome process it launched (pid ${pid}); profile "timeout" is free to reuse.`
    );
    expect(error?.message).toMatch(/larger startupTimeoutMs/);
    expect(error?.message).toMatch(/mode=headless/);
    expect(isProcessAlive(pid)).toBe(false);
    expect(isProfileLocked(resolveUserDataDir('timeout'))).toBe(false);
    expect(manager!.isLaunched()).toBe(false);

    // The retry no longer reports the profile as in use.
    await expect(
      manager!.launch({
        chromePath,
        headless: true,
        profileName: 'timeout',
        startupTimeoutMs: 1000
      })
    ).rejects.toThrow(/did not become ready/);
  });

  it('names the live owner when the profile is locked on this host', async () => {
    const userDataDir = resolveUserDataDir('busy');
    mkdirSync(userDataDir, { recursive: true });
    symlinkSync(
      `${hostname()}-${process.pid}`,
      join(userDataDir, 'SingletonLock')
    );

    await expect(
      manager!.launch({
        chromePath: fakeChrome('unused.sh', 'exit 0'),
        headless: true,
        profileName: 'busy'
      })
    ).rejects.toThrow(
      new RegExp(
        `already in use[\\s\\S]*Chrome pid ${process.pid} on this host[\\s\\S]*browser_stop will not stop it[\\s\\S]*different profileName`
      )
    );
    // A live owner's lock is never removed.
    expect(lstatSync(join(userDataDir, 'SingletonLock')).isSymbolicLink()).toBe(
      true
    );
  });

  it('explains a lock created on another host', async () => {
    const userDataDir = resolveUserDataDir('remote');
    mkdirSync(userDataDir, { recursive: true });
    symlinkSync('other-host-4242', join(userDataDir, 'SingletonLock'));

    await expect(
      manager!.launch({
        chromePath: fakeChrome('unused.sh', 'exit 0'),
        headless: true,
        profileName: 'remote'
      })
    ).rejects.toThrow(/pid 4242 on host "other-host"[\s\S]*delete the lock/);
  });
});

describe('cleanupLockFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pilot-lock-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes a lock owned by the given pid', () => {
    symlinkSync(`${hostname()}-1234`, join(dir, 'SingletonLock'));
    cleanupLockFiles(dir, 1234);
    expect(existsSync(join(dir, 'SingletonLock'))).toBe(false);
  });

  it('leaves a lock that belongs to another browser', () => {
    symlinkSync(`${hostname()}-5678`, join(dir, 'SingletonLock'));
    cleanupLockFiles(dir, 1234);
    expect(lstatSync(join(dir, 'SingletonLock')).isSymbolicLink()).toBe(true);
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
