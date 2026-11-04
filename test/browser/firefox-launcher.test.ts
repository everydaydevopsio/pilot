// #58: Firefox discovery, profile directories, Pilot's profile lock, and
// launch plumbing.
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { hostname, tmpdir } from 'os';
import { join } from 'path';
import {
  FIREFOX_LOCK_FILE,
  bidiUrl,
  findFirefoxExecutable,
  firefoxLockPresent,
  firefoxProfilesDir,
  isFirefoxProfileLocked,
  launchFirefox,
  readFirefoxLock,
  removeFirefoxLock,
  resolveFirefoxProfileDir,
  waitForBidiReady,
  writeFirefoxLock,
  writeUserPrefs
} from '../../src/browser/firefox-launcher.js';
import type { BidiConnection } from '../../src/browser/bidi/connection.js';

describe('firefox launcher', () => {
  const origXdg = process.env.XDG_DATA_HOME;
  const origPath = process.env.PILOT_FIREFOX_PATH;
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pilot-ff-launch-'));
    process.env.XDG_DATA_HOME = workDir;
    delete process.env.PILOT_FIREFOX_PATH;
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    if (origXdg === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = origXdg;
    if (origPath === undefined) delete process.env.PILOT_FIREFOX_PATH;
    else process.env.PILOT_FIREFOX_PATH = origPath;
  });

  it('keeps Firefox profiles in a firefox/ subdirectory', () => {
    expect(firefoxProfilesDir()).toBe(join(workDir, 'pilot', 'firefox'));
    expect(resolveFirefoxProfileDir('p1')).toBe(
      join(workDir, 'pilot', 'firefox', 'p1')
    );
    expect(() => resolveFirefoxProfileDir('../x')).toThrow(
      /Invalid profile name/
    );
  });

  it('finds Firefox from an override, the environment, or the platform', () => {
    expect(findFirefoxExecutable('/opt/ff')).toBe('/opt/ff');
    process.env.PILOT_FIREFOX_PATH = '/env/ff';
    expect(findFirefoxExecutable()).toBe('/env/ff');
    delete process.env.PILOT_FIREFOX_PATH;
    try {
      expect(findFirefoxExecutable()).toMatch(/firefox/i);
    } catch (err) {
      expect((err as Error).message).toMatch(
        /Firefox not found on .*set PILOT_FIREFOX_PATH/
      );
    }
  });

  describe('profile lock', () => {
    let dir: string;
    beforeEach(() => {
      dir = join(workDir, 'profile');
      mkdirSync(dir);
    });

    it('records and releases the owning pid', () => {
      expect(firefoxLockPresent(dir)).toBe(false);
      expect(isFirefoxProfileLocked(dir)).toBe(false);
      writeFirefoxLock(dir, process.pid);
      expect(readFirefoxLock(dir)).toEqual({
        pid: process.pid,
        lockHost: hostname()
      });
      expect(isFirefoxProfileLocked(dir)).toBe(true);
      expect(removeFirefoxLock(dir, process.pid + 1)).toBe(false);
      expect(removeFirefoxLock(dir, process.pid)).toBe(true);
      expect(firefoxLockPresent(dir)).toBe(false);
      expect(removeFirefoxLock(dir, process.pid)).toBe(true);
    });

    it('clears a lock left by a dead process', () => {
      writeFirefoxLock(dir, 999999);
      expect(isFirefoxProfileLocked(dir)).toBe(false);
      expect(firefoxLockPresent(dir)).toBe(false);
    });

    it('treats foreign and unreadable locks as held', () => {
      const path = join(dir, FIREFOX_LOCK_FILE);
      writeFileSync(path, JSON.stringify({ pid: 1, host: 'elsewhere' }));
      expect(isFirefoxProfileLocked(dir)).toBe(true);
      writeFileSync(path, 'garbage');
      expect(readFirefoxLock(dir)).toBeNull();
      expect(isFirefoxProfileLocked(dir)).toBe(true);
      expect(removeFirefoxLock(dir, 1)).toBe(false);
      writeFileSync(path, JSON.stringify({ pid: -1, host: hostname() }));
      expect(readFirefoxLock(dir)).toBeNull();
    });
  });

  it('writes automation prefs to user.js', () => {
    const dir = join(workDir, 'prefs');
    writeUserPrefs(dir);
    const prefs = readFileSync(join(dir, 'user.js'), 'utf8');
    expect(prefs).toContain(
      'user_pref("browser.shell.checkDefaultBrowser", false);'
    );
    expect(prefs).toContain(
      'user_pref("browser.startup.homepage_override.mstone", "ignore");'
    );
  });

  it('launches Firefox with BiDi, profile, and window flags', async () => {
    const out = join(workDir, 'args.txt');
    const fake = join(workDir, 'firefox');
    writeFileSync(
      fake,
      `#!/bin/sh\necho "$@" > ${out}\necho "$MOZ_HEADLESS_WIDTH x $MOZ_HEADLESS_HEIGHT" >> ${out}\n`
    );
    chmodSync(fake, 0o755);
    const proc = launchFirefox({
      firefoxPath: fake,
      port: 4444,
      profileDir: '/tmp/p',
      headless: true,
      windowWidth: 800,
      windowHeight: 600
    });
    await new Promise((r) => proc.on('exit', r));
    const [args, size] = readFileSync(out, 'utf8').trim().split('\n');
    expect(args).toBe(
      '--remote-debugging-port=4444 -no-remote -profile /tmp/p --window-size=800,600 --headless about:blank'
    );
    expect(size).toBe('800 x 600');

    const visible = launchFirefox({
      firefoxPath: fake,
      port: 4445,
      profileDir: '/tmp/p',
      headless: false,
      windowWidth: 800,
      windowHeight: 600
    });
    await new Promise((r) => visible.on('exit', r));
    expect(readFileSync(out, 'utf8')).not.toContain('--headless');
  });

  it('polls until the BiDi socket opens', async () => {
    expect(bidiUrl('h', 1)).toBe('ws://h:1/session');
    const conn = {} as BidiConnection;
    const connect = jest
      .fn()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValue(conn);
    await expect(waitForBidiReady(9, 5000, undefined, connect)).resolves.toBe(
      conn
    );
    expect(connect).toHaveBeenCalledWith('ws://127.0.0.1:9/session');
  });

  it('stops polling when Firefox fails or time runs out', async () => {
    const refuse = jest.fn().mockRejectedValue(new Error('refused'));
    await expect(
      waitForBidiReady(9, 5000, () => new Error('exited'), refuse)
    ).rejects.toThrow('exited');
    await expect(waitForBidiReady(9, 1, undefined, refuse)).rejects.toThrow(
      'Firefox did not open WebDriver BiDi on port 9 within 1ms'
    );
    let calls = 0;
    await expect(
      waitForBidiReady(
        9,
        1,
        () => (++calls > 1 ? new Error('late') : null),
        refuse
      )
    ).rejects.toThrow('late');
    expect(existsSync(workDir)).toBe(true);
  });
});
