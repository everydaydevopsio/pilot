import { constants } from 'fs';
import { access, mkdir } from 'fs/promises';
import { request } from 'https';
import {
  findChromeExecutable,
  findFreePort,
  resolveUserDataDir
} from './chrome-launcher.js';

export interface LinuxCheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface LinuxCheckOptions {
  headless: boolean;
  chromePath?: string;
  profileName: string;
  checkNetwork?: boolean;
}

export function checkDisplay(headless: boolean): LinuxCheckResult {
  if (headless) {
    return {
      name: 'display',
      ok: true,
      detail: 'not required in headless mode'
    };
  }
  const display = process.env.DISPLAY || process.env.WAYLAND_DISPLAY;
  return display
    ? { name: 'display', ok: true, detail: display }
    : {
        name: 'display',
        ok: false,
        detail:
          'headless:false requires DISPLAY or WAYLAND_DISPLAY; use a desktop session, xvfb-run, or headless:true'
      };
}

export async function checkChrome(
  chromePath?: string
): Promise<LinuxCheckResult> {
  try {
    const resolved = findChromeExecutable(chromePath);
    await access(resolved, constants.X_OK);
    return { name: 'chrome', ok: true, detail: resolved };
  } catch (error) {
    return { name: 'chrome', ok: false, detail: String(error) };
  }
}

export async function checkProfile(
  profileName: string
): Promise<LinuxCheckResult> {
  let profileDir: string;
  try {
    profileDir = resolveUserDataDir(profileName);
  } catch (error) {
    return { name: 'profile', ok: false, detail: String(error) };
  }

  try {
    await mkdir(profileDir, { recursive: true });
    await access(profileDir, constants.R_OK | constants.W_OK | constants.X_OK);
    return { name: 'profile', ok: true, detail: profileDir };
  } catch (error) {
    return {
      name: 'profile',
      ok: false,
      detail: `${profileDir} is not writable: ${String(error)}; set XDG_DATA_HOME to a writable directory`
    };
  }
}

export async function checkLoopback(): Promise<LinuxCheckResult> {
  try {
    const port = await findFreePort();
    return { name: 'loopback', ok: true, detail: `127.0.0.1:${port}` };
  } catch (error) {
    return {
      name: 'loopback',
      ok: false,
      detail: `${String(error)}; Pilot requires permission to bind an ephemeral CDP port on 127.0.0.1`
    };
  }
}

export async function checkOutboundHttps(
  timeoutMs = 5000,
  requestFn: typeof request = request
): Promise<LinuxCheckResult> {
  return new Promise((resolve) => {
    const req = requestFn(
      'https://clients3.google.com/generate_204',
      { method: 'HEAD', timeout: timeoutMs },
      (response) => {
        response.resume();
        resolve({
          name: 'network',
          ok: response.statusCode === 204,
          detail: `HTTPS status ${response.statusCode ?? 'unknown'} (expected 204)`
        });
      }
    );
    req.on('timeout', () =>
      req.destroy(new Error(`timeout after ${timeoutMs}ms`))
    );
    req.on('error', (error) =>
      resolve({ name: 'network', ok: false, detail: String(error) })
    );
    req.end();
  });
}

export async function runLinuxChecks(
  options: LinuxCheckOptions
): Promise<LinuxCheckResult[]> {
  if (process.platform !== 'linux') return [];
  const checks = await Promise.all([
    checkChrome(options.chromePath),
    Promise.resolve(checkDisplay(options.headless)),
    checkProfile(options.profileName),
    checkLoopback()
  ]);
  if (options.checkNetwork !== false) checks.push(await checkOutboundHttps());
  return checks;
}

export async function assertLinuxBrowserPrerequisites(
  options: LinuxCheckOptions
): Promise<void> {
  if (process.platform !== 'linux') return;
  const checks = await runLinuxChecks({ ...options, checkNetwork: false });
  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    throw new Error(
      `Linux browser preflight failed:\n${failures
        .map((failure) => `- ${failure.name}: ${failure.detail}`)
        .join('\n')}\nRun "pilot check" for complete diagnostics.`
    );
  }
}
