// Issue #54: list Pilot profiles with their lock owners, and stop only the
// Chrome processes that are verifiably using a Pilot profile.
import { spawn, type ChildProcess } from 'child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs';
import { hostname, tmpdir } from 'os';
import { join } from 'path';
import {
  isPilotChrome,
  listProfiles,
  pilotDataDir,
  readProcessCommand,
  stopLockedProfile,
  stopPilotBrowsers
} from '../src/browser/sessions.js';
import { isProcessAlive } from '../src/browser/chrome-launcher.js';
import { registerBrowserTools } from '../src/mcp/tools/browser.js';

const unix = process.platform === 'win32' ? describe.skip : describe;

unix('Pilot sessions', () => {
  const origXdg = process.env.XDG_DATA_HOME;
  let workDir: string;
  const children: ChildProcess[] = [];

  // A long-lived process whose command line carries the given argument,
  // standing in for Chrome started with --user-data-dir.
  function holder(arg: string): ChildProcess {
    const child = spawn('/bin/sh', ['-c', 'sleep 30; :', 'sh', arg], {
      stdio: 'ignore'
    });
    children.push(child);
    return child;
  }

  function profileDir(name: string): string {
    const dir = join(pilotDataDir(), name);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  function lock(dir: string, target: string): string {
    const path = join(dir, 'SingletonLock');
    symlinkSync(target, path);
    return path;
  }

  function isSymlink(path: string): boolean {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  }

  // Right after spawn, ps can still show the parent's command line.
  async function waitAlive(pid: number): Promise<void> {
    for (let i = 0; i < 100; i++) {
      if (readProcessCommand(pid)?.includes('sleep 30')) return;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`process ${pid} never showed its command line`);
  }

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'pilot-sessions-test-'));
    process.env.XDG_DATA_HOME = workDir;
  });

  afterEach(() => {
    for (const child of children.splice(0)) child.kill('SIGKILL');
    if (origXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origXdg;
    }
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns no profiles when the Pilot data directory does not exist', () => {
    expect(listProfiles()).toEqual([]);
  });

  it('reports each lock state without removing stale locks', () => {
    profileDir('free');
    const staleLock = lock(profileDir('stale'), `${hostname()}-999999`);
    lock(profileDir('remote'), 'other-host-4242');
    writeFileSync(join(profileDir('unknown'), 'SingletonLock'), '');
    mkdirSync(join(pilotDataDir(), '.not-a-profile'));

    const byName = Object.fromEntries(
      listProfiles().map((p) => [p.profile, p])
    );
    expect(Object.keys(byName)).toEqual(['free', 'remote', 'stale', 'unknown']);
    expect(byName.free.state).toBe('unlocked');
    expect(byName.stale).toMatchObject({ state: 'stale', pid: 999999 });
    expect(byName.remote).toMatchObject({
      state: 'locked_other_host',
      pid: 4242,
      host: 'other-host'
    });
    expect(byName.unknown.state).toBe('locked_unknown');
    expect(isSymlink(staleLock)).toBe(true);
  });

  it('matches only the exact profile directory on the command line', async () => {
    const dir = profileDir('exact');
    const right = holder(`--user-data-dir=${dir}`);
    const prefix = holder(`--user-data-dir=${dir}2`);
    await waitAlive(right.pid!);
    await waitAlive(prefix.pid!);

    expect(isPilotChrome(right.pid!, dir)).toBe(true);
    expect(isPilotChrome(prefix.pid!, dir)).toBe(false);
  });

  it('stops verified Pilot Chrome and leaves every other lock owner alone', async () => {
    const pilotDir = profileDir('pilot');
    const pilot = holder(`--user-data-dir=${pilotDir}`);
    const pilotLock = lock(pilotDir, `${hostname()}-${pilot.pid}`);

    const impostorDir = profileDir('impostor');
    const impostor = holder('--some-other-flag');
    const impostorLock = lock(impostorDir, `${hostname()}-${impostor.pid}`);

    const staleLock = lock(profileDir('stale'), `${hostname()}-999999`);
    const remoteLock = lock(profileDir('remote'), 'other-host-4242');
    profileDir('free');
    await waitAlive(pilot.pid!);
    await waitAlive(impostor.pid!);

    const results = await stopPilotBrowsers();
    const byName = Object.fromEntries(results.map((r) => [r.profile, r]));

    expect(byName.pilot).toMatchObject({ outcome: 'stopped', pid: pilot.pid });
    expect(isProcessAlive(pilot.pid!)).toBe(false);
    expect(isSymlink(pilotLock)).toBe(false);

    expect(byName.impostor).toMatchObject({ outcome: 'skipped' });
    expect(isProcessAlive(impostor.pid!)).toBe(true);
    expect(isSymlink(impostorLock)).toBe(true);

    expect(byName.stale.outcome).toBe('cleaned');
    expect(isSymlink(staleLock)).toBe(false);

    expect(byName.remote.outcome).toBe('skipped');
    expect(isSymlink(remoteLock)).toBe(true);

    expect(byName.free).toBeUndefined();
  });

  it('re-verifies the process before signalling a cached status', async () => {
    // Simulates pid reuse: the status was verified earlier, but the pid now
    // belongs to a process that is not Chrome using this profile.
    const dir = profileDir('reused');
    const replacement = holder('--some-other-flag');
    const lockPath = lock(dir, `${hostname()}-${replacement.pid}`);
    await waitAlive(replacement.pid!);

    const result = await stopLockedProfile({
      profile: 'reused',
      userDataDir: dir,
      state: 'locked',
      pid: replacement.pid,
      host: hostname(),
      pilotChrome: true
    });

    expect(result.outcome).toBe('skipped');
    expect(isProcessAlive(replacement.pid!)).toBe(true);
    expect(isSymlink(lockPath)).toBe(true);
  });

  it('keeps the lock when the process ignores SIGTERM and stops verifying', async () => {
    // On SIGTERM this process replaces itself with one that lacks the
    // profile flag: alive, but no longer verifiable as Pilot Chrome.
    const dir = profileDir('changes');
    const child = spawn(
      '/bin/sh',
      [
        '-c',
        'trap "exec sleep 31" TERM; while :; do sleep 0.1; done',
        'sh',
        `--user-data-dir=${dir}`
      ],
      { stdio: 'ignore' }
    );
    children.push(child);
    const lockPath = lock(dir, `${hostname()}-${child.pid}`);
    for (let i = 0; i < 100; i++) {
      if (isPilotChrome(child.pid!, dir)) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const [result] = await stopPilotBrowsers();

    expect(result).toMatchObject({ profile: 'changes', outcome: 'failed' });
    expect(result.detail).toMatch(/could no longer be verified/);
    expect(isProcessAlive(child.pid!)).toBe(true);
    expect(isSymlink(lockPath)).toBe(true);
  }, 15000);

  describe('MCP tools', () => {
    function register(context: Record<string, unknown>) {
      const server = { tool: jest.fn() };
      registerBrowserTools(server as never, context as never, () => {
        throw new Error('not used');
      });
      return (name: string) =>
        server.tool.mock.calls.find(([n]) => n === name)![3] as () => Promise<{
          content: Array<{ text: string }>;
        }>;
    }

    it('browser_status reports the session and profile states', async () => {
      lock(profileDir('remote'), 'other-host-4242');
      const tool = register({
        manager: {
          getSessionInfo: () => ({
            mode: 'launched',
            connected: true,
            pid: 123,
            profile: 'profile1'
          })
        }
      });

      const result = await tool('browser_status')();
      const status = JSON.parse(result.content[0].text);
      expect(status.session).toMatchObject({ mode: 'launched', pid: 123 });
      expect(status.dataDir).toBe(pilotDataDir());
      expect(status.profiles).toEqual([
        expect.objectContaining({
          profile: 'remote',
          state: 'locked_other_host'
        })
      ]);
    });

    it('browser_stop_all stops this session and other Pilot browsers', async () => {
      const dir = profileDir('other');
      const other = holder(`--user-data-dir=${dir}`);
      lock(dir, `${hostname()}-${other.pid}`);
      await waitAlive(other.pid!);

      const destroy = jest.fn().mockResolvedValue(undefined);
      const context: Record<string, unknown> = {
        manager: {
          getSessionInfo: () => ({
            mode: 'launched',
            connected: true,
            pid: 321,
            profile: 'profile1'
          }),
          destroy
        }
      };
      const tool = register(context);

      const text = (await tool('browser_stop_all')()).content[0].text;
      expect(destroy).toHaveBeenCalled();
      expect(context.manager).toBeNull();
      expect(text).toContain(
        'this session: stopped Chrome pid 321 (profile "profile1")'
      );
      expect(text).toContain(
        `other: stopped - stopped Chrome pid ${other.pid}`
      );
      expect(isProcessAlive(other.pid!)).toBe(false);
    });

    it('browser_stop_all reports when nothing was running', async () => {
      const tool = register({ manager: null });
      const text = (await tool('browser_stop_all')()).content[0].text;
      expect(text).toBe('No Pilot-managed browsers were running.');
    });
  });
});
