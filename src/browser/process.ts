import type { ChildProcess } from 'child_process';

/** Terminate a browser process, escalating to SIGKILL. Resolves true once it has exited. */
export async function stopBrowserProcess(proc: ChildProcess): Promise<boolean> {
  const hasExited = () => proc.exitCode !== null || proc.signalCode !== null;
  if (proc.pid === undefined || hasExited()) return true;

  const waitForExit = (ms: number) =>
    new Promise<boolean>((resolve) => {
      if (hasExited()) {
        resolve(true);
        return;
      }
      const timer = setTimeout(() => {
        proc.off('exit', onExit);
        resolve(hasExited());
      }, ms);
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      proc.once('exit', onExit);
    });

  try {
    proc.kill();
  } catch {
    // process may have already exited
  }
  if (await waitForExit(5000)) return true;
  try {
    proc.kill('SIGKILL');
  } catch {
    // process may have already exited
  }
  return waitForExit(2000);
}
