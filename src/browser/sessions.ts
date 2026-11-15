import { execFileSync } from 'child_process';
import { existsSync, lstatSync, readdirSync, statSync } from 'fs';
import { hostname } from 'os';
import { basename, dirname, join } from 'path';
import {
  PROFILE_NAME_RE,
  cleanupLockFiles,
  isProcessAlive,
  profileLockOwner,
  resolveUserDataDir
} from './chrome-launcher.js';
import {
  FIREFOX_PROFILES_DIRNAME,
  firefoxLockPresent,
  firefoxProfilesDir,
  readFirefoxLock,
  removeFirefoxLock
} from './firefox-launcher.js';

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
  /** Browser that uses this profile directory. */
  browser: 'chrome' | 'firefox';
  profile: string;
  userDataDir: string;
  state: ProfileLockState;
  pid?: number;
  host?: string;
  /** True when the lock owner's command line shows Chrome using this Pilot profile. */
  pilotChrome?: boolean;
  /** True when the lock owner's command line shows Firefox using this Pilot profile. */
  pilotFirefox?: boolean;
}

export function pilotDataDir(): string {
  // resolveUserDataDir validates the name; any valid name gives the parent.
  return dirname(resolveUserDataDir('profile1'));
}

function profileDirs(dataDir: string): string[] {
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
    .sort();
}

/**
 * Report the lock state of every Pilot profile, Chrome first, then Firefox.
 * Read-only: unlike isProfileLocked, it never removes stale locks.
 */
export function listProfiles(): ProfileStatus[] {
  const dataDir = pilotDataDir();
  const chrome = profileDirs(dataDir)
    .filter((name) => name !== FIREFOX_PROFILES_DIRNAME)
    .map((profile) => profileStatus(profile, join(dataDir, profile)));
  const ffDir = firefoxProfilesDir();
  const firefox = profileDirs(ffDir).map((profile) =>
    firefoxProfileStatus(profile, join(ffDir, profile))
  );
  return [...chrome, ...firefox];
}

function firefoxProfileStatus(
  profile: string,
  userDataDir: string
): ProfileStatus {
  const base = { browser: 'firefox' as const, profile, userDataDir };
  if (!firefoxLockPresent(userDataDir)) return { ...base, state: 'unlocked' };
  const owner = readFirefoxLock(userDataDir);
  if (!owner) return { ...base, state: 'locked_unknown' };
  const lock = { pid: owner.pid, host: owner.lockHost };
  if (owner.lockHost !== hostname()) {
    return { ...base, ...lock, state: 'locked_other_host' };
  }
  if (!isProcessAlive(owner.pid)) return { ...base, ...lock, state: 'stale' };
  return {
    ...base,
    ...lock,
    state: 'locked',
    pilotFirefox: isPilotFirefox(owner.pid, userDataDir)
  };
}

function profileStatus(profile: string, userDataDir: string): ProfileStatus {
  const owner = profileLockOwner(userDataDir);
  const base = { browser: 'chrome' as const, profile, userDataDir };

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

function ps(pid: number, field: 'args' | 'comm'): string | null {
  if (process.platform === 'win32') return null;
  try {
    const out = execFileSync('ps', ['-o', `${field}=`, '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** The full command line of a process, or null when it cannot be read. */
export function readProcessCommand(pid: number): string | null {
  return ps(pid, 'args');
}

// Chrome's main executable: "chrome" or "chromium-browser" on Linux (comm is
// truncated to 15 characters), "Google Chrome" or "Chromium" on macOS.
const CHROME_EXECUTABLE_RE = /chrom(e|ium)/i;

/**
 * Whether pid is a Chrome or Chromium browser started with exactly this Pilot
 * profile directory. A pid read from a lock can be reused by an unrelated
 * process, so stop-all only signals processes that pass this check.
 */
export function isPilotChrome(pid: number, userDataDir: string): boolean {
  return commandUsesProfile(
    pid,
    CHROME_EXECUTABLE_RE,
    ` --user-data-dir=${userDataDir}`
  );
}

/** Whether pid is Firefox started with exactly this Pilot profile directory. */
export function isPilotFirefox(pid: number, profileDir: string): boolean {
  return commandUsesProfile(pid, /firefox/i, ` -profile ${profileDir}`);
}

function commandUsesProfile(
  pid: number,
  executableRe: RegExp,
  flag: string
): boolean {
  const executable = ps(pid, 'comm');
  if (!executable || !executableRe.test(basename(executable))) {
    return false;
  }
  const command = readProcessCommand(pid);
  if (!command) return false;
  let at = command.indexOf(flag);
  while (at !== -1) {
    const next = command.charAt(at + flag.length);
    if (next === '' || next === ' ') return true;
    at = command.indexOf(flag, at + 1);
  }
  return false;
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

type TerminateResult =
  | { outcome: 'stopped' }
  | { outcome: 'not_pilot' }
  | { outcome: 'failed'; detail: string };

interface BrowserTraits {
  name: string;
  verify(pid: number, userDataDir: string): boolean;
  removeLock(userDataDir: string, pid: number): boolean;
}

const BROWSER_TRAITS: Record<ProfileStatus['browser'], BrowserTraits> = {
  chrome: {
    name: 'Chrome',
    verify: isPilotChrome,
    removeLock: cleanupLockFiles
  },
  firefox: {
    name: 'Firefox',
    verify: isPilotFirefox,
    removeLock: removeFirefoxLock
  }
};

/** Profile label in stop results; Firefox profiles are prefixed to tell them apart. */
function profileLabel(status: ProfileStatus): string {
  return status.browser === 'firefox'
    ? `${FIREFOX_PROFILES_DIRNAME}/${status.profile}`
    : status.profile;
}

/**
 * SIGTERM, then SIGKILL. The pid's identity is re-checked right before each
 * signal: a process seen earlier can exit and its pid be reused while
 * other browsers are being stopped.
 */
async function terminate(
  pid: number,
  userDataDir: string,
  browser: BrowserTraits
): Promise<TerminateResult> {
  const signal = (sig: NodeJS.Signals): 'sent' | 'gone' | { error: string } => {
    if (!browser.verify(pid, userDataDir)) return 'gone';
    try {
      process.kill(pid, sig);
      return 'sent';
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') return 'gone';
      return { error: `could not send ${sig} to pid ${pid} (${code})` };
    }
  };

  const term = signal('SIGTERM');
  if (term === 'gone') {
    return isProcessAlive(pid)
      ? { outcome: 'not_pilot' }
      : { outcome: 'stopped' };
  }
  if (typeof term === 'object')
    return { outcome: 'failed', detail: term.error };
  if (await waitForProcessExit(pid, 5000)) return { outcome: 'stopped' };

  const kill = signal('SIGKILL');
  if (kill === 'gone') {
    // Only a confirmed exit counts as stopped. A live pid that no longer
    // verifies (ps failed, or the process changed) is left alone.
    return isProcessAlive(pid)
      ? {
          outcome: 'failed',
          detail: `pid ${pid} did not exit after SIGTERM and could no longer be verified as ${browser.name} using ${userDataDir}; not killed, lock kept`
        }
      : { outcome: 'stopped' };
  }
  if (typeof kill === 'object')
    return { outcome: 'failed', detail: kill.error };
  return (await waitForProcessExit(pid, 2000))
    ? { outcome: 'stopped' }
    : { outcome: 'failed', detail: `pid ${pid} did not exit after SIGKILL` };
}

/**
 * Stop every Chrome or Firefox on this host that holds a Pilot profile lock. Processes
 * are only signalled after their command line confirms they use that
 * profile's directory; nothing else is touched.
 */
export async function stopPilotBrowsers(): Promise<StopResult[]> {
  const results: StopResult[] = [];
  for (const status of listProfiles()) {
    const { pid } = status;
    const profile = profileLabel(status);
    switch (status.state) {
      case 'unlocked':
        continue;
      case 'stale': {
        const removed = BROWSER_TRAITS[status.browser].removeLock(
          status.userDataDir,
          pid!
        );
        results.push(
          removed
            ? {
                profile,
                pid,
                outcome: 'cleaned',
                detail: `removed stale lock left by pid ${pid}, which is no longer running`
              }
            : {
                profile,
                pid,
                outcome: 'failed',
                detail: `stale lock left by pid ${pid} could not be removed (the lock changed owner or is not writable)`
              }
        );
        continue;
      }
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
        results.push(await stopLockedProfile(status));
    }
  }
  return results;
}

/** Stop the browser holding a profile lock, if it is verifiably Pilot's. */
export async function stopLockedProfile(
  status: ProfileStatus
): Promise<StopResult> {
  const { pid, userDataDir } = status;
  const profile = profileLabel(status);
  const browser = BROWSER_TRAITS[status.browser];
  const verified =
    status.browser === 'firefox' ? status.pilotFirefox : status.pilotChrome;
  const notPilot: StopResult = {
    profile,
    pid,
    outcome: 'skipped',
    detail: `pid ${pid} holds the lock but its command line does not show ${browser.name} using ${userDataDir}; not stopped`
  };
  if (pid === undefined || !verified) return notPilot;

  const result = await terminate(pid, userDataDir, browser);
  if (result.outcome === 'not_pilot') return notPilot;
  if (result.outcome === 'failed') {
    return { profile, pid, outcome: 'failed', detail: result.detail };
  }
  const removed = browser.removeLock(userDataDir, pid);
  return {
    profile,
    pid,
    outcome: 'stopped',
    detail: removed
      ? `stopped ${browser.name} pid ${pid}`
      : `stopped ${browser.name} pid ${pid}, but its lock could not be removed`
  };
}
