import { spawn, type ChildProcess } from 'child_process';
import { existsSync, lstatSync, readlinkSync, unlinkSync } from 'fs';
import * as net from 'net';
import { homedir, hostname } from 'os';
import { join } from 'path';
import CDP from 'chrome-remote-interface';
import { getLogger } from '../util/logger.js';
import type { SandboxDecision } from './types.js';

export const PROFILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export function sandboxDecision(): SandboxDecision {
  const envOverride = process.env.PILOT_CHROME_NO_SANDBOX;
  if (envOverride !== undefined) {
    const truthy = envOverride === 'true' || envOverride === '1';
    return truthy
      ? { disable: true, reason: 'env_override' }
      : { disable: false };
  }
  if (process.platform !== 'linux' && process.platform !== 'win32') {
    return { disable: false };
  }
  if (process.getuid?.() === 0) {
    return { disable: true, reason: 'root_user' };
  }
  return { disable: false };
}

export function shouldDisableSandbox(): boolean {
  return sandboxDecision().disable;
}

export function resolveUserDataDir(profileName: string): string {
  if (!PROFILE_NAME_RE.test(profileName)) {
    throw new Error(
      `Invalid profile name "${profileName}". Use only letters, digits, hyphens, and underscores.`
    );
  }
  const xdgData =
    process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(xdgData, 'pilot', profileName);
}

function fileOrSymlinkExists(filePath: string): boolean {
  try {
    lstatSync(filePath);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    return true;
  }
}

export function extractLockPid(
  lockPath: string
): { pid: number; lockHost: string } | null {
  try {
    const stat = lstatSync(lockPath);
    if (!stat.isSymbolicLink()) return null;
    const target = readlinkSync(lockPath);
    const lastDash = target.lastIndexOf('-');
    if (lastDash === -1) return null;
    const lockHost = target.slice(0, lastDash);
    const pid = parseInt(target.slice(lastDash + 1), 10);
    if (isNaN(pid) || pid <= 0) return null;
    return { pid, lockHost };
  } catch {
    return null;
  }
}

export function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code !== 'ESRCH';
  }
}

function removeStaleLocks(userDataDir: string): void {
  for (const lockName of ['SingletonLock', 'lockfile']) {
    try {
      unlinkSync(join(userDataDir, lockName));
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
  const logger = getLogger();
  logger.warn(
    { userDataDir },
    'Cleaned up stale Chrome lock files from a previous crash'
  );
}

export function isProfileLocked(userDataDir: string): boolean {
  const singletonPath = join(userDataDir, 'SingletonLock');
  const lockfilePath = join(userDataDir, 'lockfile');

  const hasSingleton = fileOrSymlinkExists(singletonPath);
  const hasLockfile = existsSync(lockfilePath);

  if (!hasSingleton && !hasLockfile) return false;

  const lockInfo = hasSingleton ? extractLockPid(singletonPath) : null;

  if (!lockInfo) {
    return true;
  }

  const currentHost = hostname();
  if (lockInfo.lockHost !== currentHost) {
    return true;
  }

  if (isProcessAlive(lockInfo.pid)) {
    return true;
  }

  try {
    removeStaleLocks(userDataDir);
    return false;
  } catch {
    return true;
  }
}

export function findChromeExecutable(override?: string): string {
  if (override) return override;
  const env = process.env.PILOT_CHROME_PATH;
  if (env) return env;

  const platform = process.platform;
  const candidates: string[] =
    platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ]
      : platform === 'linux'
        ? [
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium'
          ]
        : platform === 'win32'
          ? [
              'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
              'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
            ]
          : [];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Chrome not found on ${platform}. Install Google Chrome or set PILOT_CHROME_PATH.`
  );
}

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

export async function waitForChromeReady(
  port: number,
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await CDP.List({ host: '127.0.0.1', port });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(
    `Chrome did not become ready on port ${port} within ${timeoutMs}ms`
  );
}

export interface ChromeLaunchResult {
  process: ChildProcess;
  port: number;
  userDataDir: string;
}

export function launchChrome(opts: {
  chromePath: string;
  port: number;
  userDataDir: string;
  headless: boolean;
  windowWidth: number;
  windowHeight: number;
}): ChildProcess {
  const logger = getLogger();

  const args = [
    `--remote-debugging-port=${opts.port}`,
    `--user-data-dir=${opts.userDataDir}`,
    `--window-size=${opts.windowWidth},${opts.windowHeight}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-extensions'
  ];

  if (opts.headless) {
    args.push('--headless', '--disable-gpu');
  }

  if (process.platform === 'linux') {
    args.push(
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-breakpad',
      '--password-store=basic',
      '--use-mock-keychain'
    );
  }

  const sandbox = sandboxDecision();
  if (sandbox.disable) {
    args.push('--no-sandbox');
    logger.warn(
      { reason: sandbox.reason },
      'Chrome will run with --no-sandbox. The renderer sandbox is disabled; any page the agent visits runs with the same privileges as this process. Set PILOT_CHROME_NO_SANDBOX=false to override, or run as a non-root user to keep the sandbox enabled.'
    );
  }

  logger.info(
    {
      chromePath: opts.chromePath,
      port: opts.port,
      headless: opts.headless,
      sandbox: sandbox.disable ? 'disabled' : 'enabled'
    },
    'Launching Chrome'
  );

  return spawn(opts.chromePath, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: false
  });
}

export function cleanupLockFiles(userDataDir: string): void {
  for (const lockName of ['SingletonLock', 'lockfile']) {
    try {
      unlinkSync(join(userDataDir, lockName));
    } catch {
      // lock file may not exist — that's fine
    }
  }
}
