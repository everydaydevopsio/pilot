import { spawn, type ChildProcess } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'fs';
import { homedir, hostname } from 'os';
import { dirname, join } from 'path';
import { getLogger } from '../util/logger.js';
import { BidiConnection } from './bidi/connection.js';
import { isProcessAlive, resolveUserDataDir } from './chrome-launcher.js';

/**
 * Firefox profiles live beside the Chrome ones, under a firefox/
 * subdirectory, so a profile name can be used with both browsers.
 */
export const FIREFOX_PROFILES_DIRNAME = 'firefox';

export function firefoxProfilesDir(): string {
  return join(
    dirname(resolveUserDataDir('profile1')),
    FIREFOX_PROFILES_DIRNAME
  );
}

export function resolveFirefoxProfileDir(profileName: string): string {
  // resolveUserDataDir validates the profile name.
  resolveUserDataDir(profileName);
  return join(firefoxProfilesDir(), profileName);
}

export function findFirefoxExecutable(override?: string): string {
  if (override) return override;
  const env = process.env.PILOT_FIREFOX_PATH;
  if (env) return env;

  const platform = process.platform;
  const candidates: string[] =
    platform === 'darwin'
      ? [
          '/Applications/Firefox.app/Contents/MacOS/firefox',
          join(homedir(), 'Applications/Firefox.app/Contents/MacOS/firefox'),
          '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
          '/Applications/Firefox Nightly.app/Contents/MacOS/firefox'
        ]
      : platform === 'linux'
        ? ['/usr/bin/firefox', '/usr/bin/firefox-esr', '/snap/bin/firefox']
        : platform === 'win32'
          ? [
              'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
              'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
            ]
          : [];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Firefox not found on ${platform}. Install Firefox or set PILOT_FIREFOX_PATH.`
  );
}

/**
 * Firefox holds its profile with an fcntl lock on .parentlock, which stays on
 * disk after a clean exit, so the file alone does not say whether the profile
 * is in use. Pilot writes its own lock naming the Firefox pid and host.
 */
export const FIREFOX_LOCK_FILE = 'pilot.lock';

export interface FirefoxLockOwner {
  pid: number;
  lockHost: string;
}

export function readFirefoxLock(profileDir: string): FirefoxLockOwner | null {
  try {
    const raw = JSON.parse(
      readFileSync(join(profileDir, FIREFOX_LOCK_FILE), 'utf8')
    ) as { pid?: unknown; host?: unknown };
    const pid = Number(raw.pid);
    if (!Number.isInteger(pid) || pid <= 0 || typeof raw.host !== 'string') {
      return null;
    }
    return { pid, lockHost: raw.host };
  } catch {
    return null;
  }
}

export function firefoxLockPresent(profileDir: string): boolean {
  return existsSync(join(profileDir, FIREFOX_LOCK_FILE));
}

export function writeFirefoxLock(profileDir: string, pid: number): void {
  writeFileSync(
    join(profileDir, FIREFOX_LOCK_FILE),
    JSON.stringify({ pid, host: hostname() })
  );
}

/** Remove the lock if it still names ownerPid on this host. */
export function removeFirefoxLock(
  profileDir: string,
  ownerPid: number
): boolean {
  const owner = readFirefoxLock(profileDir);
  if (
    firefoxLockPresent(profileDir) &&
    (!owner || owner.pid !== ownerPid || owner.lockHost !== hostname())
  ) {
    return false;
  }
  try {
    unlinkSync(join(profileDir, FIREFOX_LOCK_FILE));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return false;
  }
  return true;
}

/** True when a live process (or one on another host) holds the profile. Clears stale locks. */
export function isFirefoxProfileLocked(profileDir: string): boolean {
  if (!firefoxLockPresent(profileDir)) return false;
  const owner = readFirefoxLock(profileDir);
  if (!owner || owner.lockHost !== hostname()) return true;
  if (isProcessAlive(owner.pid)) return true;
  return !removeFirefoxLock(profileDir, owner.pid);
}

// Prefs that keep first-run pages and background noise out of automation.
// Firefox's remote agent applies its own recommended automation prefs too.
const USER_PREFS: Record<string, string | number | boolean> = {
  'browser.shell.checkDefaultBrowser': false,
  'browser.aboutwelcome.enabled': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'browser.tabs.warnOnClose': false,
  'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'app.update.disabledForTesting': true
};

export function writeUserPrefs(profileDir: string): void {
  const lines = Object.entries(USER_PREFS).map(
    ([name, value]) =>
      `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`
  );
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'user.js'), lines.join('\n') + '\n');
}

export function launchFirefox(opts: {
  firefoxPath: string;
  port: number;
  profileDir: string;
  headless: boolean;
  windowWidth: number;
  windowHeight: number;
}): ChildProcess {
  const args = [
    `--remote-debugging-port=${opts.port}`,
    '-no-remote',
    '-profile',
    opts.profileDir,
    `--window-size=${opts.windowWidth},${opts.windowHeight}`
  ];
  if (opts.headless) args.push('--headless');
  args.push('about:blank');

  getLogger().info(
    {
      firefoxPath: opts.firefoxPath,
      port: opts.port,
      headless: opts.headless
    },
    'Launching Firefox'
  );

  return spawn(opts.firefoxPath, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false,
    env: {
      ...process.env,
      MOZ_CRASHREPORTER_DISABLE: '1',
      // Headless Firefox clamps windows to a 1366x768 virtual screen.
      ...(opts.headless && {
        MOZ_HEADLESS_WIDTH: String(opts.windowWidth),
        MOZ_HEADLESS_HEIGHT: String(opts.windowHeight)
      })
    }
  });
}

export function bidiUrl(host: string, port: number): string {
  return `ws://${host}:${port}/session`;
}

/** Poll until Firefox's BiDi WebSocket accepts a connection, and return it. */
export async function waitForBidiReady(
  port: number,
  timeoutMs: number,
  earlyFailure?: () => Error | null,
  connect: (url: string) => Promise<BidiConnection> = (url) =>
    BidiConnection.connect(url, 2000)
): Promise<BidiConnection> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const failure = earlyFailure?.();
    if (failure) throw failure;
    try {
      return await connect(bidiUrl('127.0.0.1', port));
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const failure = earlyFailure?.();
  if (failure) throw failure;
  throw new Error(
    `Firefox did not open WebDriver BiDi on port ${port} within ${timeoutMs}ms`
  );
}
