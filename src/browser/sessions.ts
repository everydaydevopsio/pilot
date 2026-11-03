import { execFileSync } from 'child_process';
import { existsSync, lstatSync, readdirSync, statSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';
import {
  PROFILE_NAME_RE,
  cleanupLockFiles,
  isProcessAlive,
  profileLockOwner,
  resolveUserDataDir
} from './chrome-launcher.js';

export type ProfileLockState =
  /** No lock files: the profile is free. */
  | 'unlocked'
  /** Locked by a live process on this host. */
  | 'locked'
  /** Locked by a process on this host that is no longer running. */
  | 'stale'
  /** Locked from another host; liveness cannot be checked here. */
  | 'locked_other_host'
  /** Lock files exist but name no owner Pilot can read. */
  | 'locked_unknown';

export interface ProfileStatus {
  profile: string;
  userDataDir: string;
  state: ProfileLockState;
  pid?: number;
  host?: string;
  /** True when the lock owner's command line shows Chrome using this Pilot profile. */
  pilotChrome?: boolean;
}

export function pilotDataDir(): string {
  // resolveUserDataDir validates the name; any valid name gives the parent.
  return dirname(resolveUserDataDir('profile1'));
}

/**
 * Report the lock state of every Pilot profile. Read-only: unlike
 * isProfileLocked, it never removes stale locks.
 */
export function listProfiles(): ProfileStatus[] {
  const dataDir = pilotDataDir();
  let names: string[];
  try {
    names = readdirSync(dataDir);
  } catch {
    return [];
  }

  return names
    .filter((name) => PROFILE_NAME_RE.test(name))
    .filter((name) => {
      try {
        return statSync(join(dataDir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .map((profile) => profileStatus(profile, join(dataDir, profile)));
}

function profileStatus(profile: string, userDataDir: string): ProfileStatus {
  const owner = profileLockOwner(userDataDir);
  const base = { profile, userDataDir };

  if (!owner) {
    const hasLock =
      lockPresent(join(userDataDir, 'SingletonLock')) ||
      existsSync(join(userDataDir, 'lockfile'));
    return { ...base, state: hasLock ? 'locked_unknown' : 'unlocked' };
  }
  if (owner.lockHost !== hostname()) {
    return {
      ...base,
      state: 'locked_other_host',
      pid: owner.pid,
      host: owner.lockHost
    };
  }
  if (!isProcessAlive(owner.pid)) {
    return { ...base, state: 'stale', pid: owner.pid, host: owner.lockHost };
  }
  return {
    ...base,
    state: 'locked',
    pid: owner.pid,
    host: owner.lockHost,
    pilotChrome: isPilotChrome(owner.pid, userDataDir)
  };
}

function lockPresent(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** The full command line of a process, or null when it cannot be read. */
export function readProcessCommand(pid: number): string | null {
  if (process.platform === 'win32') return null;
  try {
    return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Whether pid is a browser started with this Pilot profile directory. A pid
 * read from a lock can be reused by an unrelated process, so stop-all only
 * signals processes whose command line names the profile.
 */
export function isPilotChrome(pid: number, userDataDir: string): boolean {
  const command = readProcessCommand(pid);
  if (!command) return false;
  const flag = `--user-data-dir=${userDataDir}`;
  const at = command.indexOf(flag);
  if (at === -1) return false;
  const next = command.charAt(at + flag.length);
  return next === '' || next === ' ';
}

export interface StopResult {
  profile: string;
  pid?: number;
  outcome: 'stopped' | 'cleaned' | 'failed' | 'skipped';
  detail: string;
}

async function waitForProcessExit(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isProcessAlive(pid);
}

async function terminate(pid: number): Promise<string | null> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return null;
    return `could not signal pid ${pid} (${code})`;
  }
  if (await waitForProcessExit(pid, 5000)) return null;
  try {
    process.kill(pid, 'SIGKILL');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return null;
    return `could not SIGKILL pid ${pid} (${code})`;
  }
  return (await waitForProcessExit(pid, 2000))
    ? null
    : `pid ${pid} did not exit after SIGKILL`;
}

/**
 * Stop every Chrome on this host that holds a Pilot profile lock. Processes
 * are only signalled after their command line confirms they use that
 * profile's directory; nothing else is touched.
 */
export async function stopPilotBrowsers(): Promise<StopResult[]> {
  const results: StopResult[] = [];
  for (const status of listProfiles()) {
    const { profile, pid } = status;
    switch (status.state) {
      case 'unlocked':
        continue;
      case 'stale':
        cleanupLockFiles(status.userDataDir, pid!);
        results.push({
          profile,
          pid,
          outcome: 'cleaned',
          detail: `removed stale lock left by pid ${pid}, which is no longer running`
        });
        continue;
      case 'locked_other_host':
        results.push({
          profile,
          pid,
          outcome: 'skipped',
          detail: `locked by pid ${pid} on host "${status.host}"; Pilot can only stop browsers on this host`
        });
        continue;
      case 'locked_unknown':
        results.push({
          profile,
          outcome: 'skipped',
          detail: 'lock files name no owner; left in place'
        });
        continue;
      case 'locked':
        if (!status.pilotChrome) {
          results.push({
            profile,
            pid,
            outcome: 'skipped',
            detail: `pid ${pid} holds the lock but its command line does not show Chrome using ${status.userDataDir}; not stopped`
          });
          continue;
        }
        {
          const error = await terminate(pid!);
          if (error) {
            results.push({ profile, pid, outcome: 'failed', detail: error });
          } else {
            cleanupLockFiles(status.userDataDir, pid!);
            results.push({
              profile,
              pid,
              outcome: 'stopped',
              detail: `stopped Chrome pid ${pid}`
            });
          }
        }
    }
  }
  return results;
}
