import type { ChildProcess } from 'node:child_process';

export default async function globalTeardown(): Promise<void> {
  const aab = (globalThis as Record<string, unknown>).__E2E_AAB__ as
    | ChildProcess
    | undefined;
  const chrome = (globalThis as Record<string, unknown>).__E2E_CHROME__ as
    | ChildProcess
    | undefined;

  if (aab) {
    aab.kill('SIGTERM');
    await new Promise<void>((r) => setTimeout(r, 500));
  }

  if (chrome) {
    chrome.kill('SIGTERM');
    await new Promise<void>((r) => setTimeout(r, 500));
  }
}
