import { runLinuxChecks } from '../browser/preflight.js';

export async function runCheck(): Promise<void> {
  if (process.platform !== 'linux') {
    console.log(
      'pilot check: Linux preflight is not required on this platform.'
    );
    return;
  }
  const { loadConfig } = await import('../util/config.js');
  const config = loadConfig();
  const checks = await runLinuxChecks({
    headless: config.headless,
    chromePath: config.chromePath,
    profileName: config.profileName
  });
  for (const check of checks) {
    console.log(
      `[${check.ok ? 'PASS' : 'FAIL'}] ${check.name}: ${check.detail}`
    );
  }
  if (checks.some((check) => !check.ok)) process.exitCode = 1;
}
