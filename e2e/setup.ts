import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';

const AAB_PORT = 8866;

export const E2E_CONFIG = { AAB_PORT };

function waitForPort(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 15000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      if (Date.now() > deadline) {
        reject(
          new Error(
            `Port ${port} on ${host} did not open within ${timeoutMs}ms`
          )
        );
        return;
      }
      const sock = createConnection({ port, host });
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        setTimeout(attempt, 300);
      });
    }
    attempt();
  });
}

/**
 * Find a local Chrome binary. Returns null when Chrome cannot be found or
 * when the environment is not suitable for running Chrome locally (e.g. a
 * headless Linux CI runner without a display — use Docker instead).
 */
function findChromeBinary(): string | null {
  // Explicit override — docker-compose and any manual setup can set this.
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const platform = process.platform;

  if (platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? '';
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      local ? `${local}\\Google\\Chrome\\Application\\chrome.exe` : ''
    ];
    return candidates.find((p) => p && existsSync(p)) ?? null;
  }

  if (platform === 'linux') {
    // Only run locally when a display server is available.
    // Headless Linux (CI, SSH) should use Docker: pnpm run test:e2e:docker
    const hasDisplay = process.env.DISPLAY ?? process.env.WAYLAND_DISPLAY;
    if (!hasDisplay) return null;

    const candidates = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    ];
    return candidates.find((p) => existsSync(p)) ?? null;
  }

  return null;
}

export default async function globalSetup(): Promise<void> {
  const dockerCdpHost = process.env.E2E_CDP_HOST;
  const dockerCdpPort = process.env.E2E_CDP_PORT
    ? parseInt(process.env.E2E_CDP_PORT, 10)
    : null;

  if (dockerCdpHost && dockerCdpPort) {
    // ── Docker mode ────────────────────────────────────────────────────────
    // Chrome is already running as a separate container (healthcheck passed).
    // Start aab pointing at it; no need to spawn or wait for Chrome.
    const aab = spawn(
      'node',
      [
        'dist/index.js',
        '--no-launch',
        '--port',
        String(AAB_PORT),
        '--cdp-port',
        String(dockerCdpPort),
        '--cdp-host',
        dockerCdpHost,
        '--log-level',
        'error'
      ],
      {
        stdio: 'ignore',
        env: { ...process.env, NODE_ENV: 'production' }
      }
    );

    (globalThis as Record<string, unknown>).__E2E_AAB__ = aab;
    await waitForPort(AAB_PORT);
    process.env.E2E_AAB_PORT = String(AAB_PORT);
    return;
  }

  // ── Bare-metal mode ──────────────────────────────────────────────────────
  // Find Chrome on the local OS. Skip gracefully if unavailable.
  const chromeBin = findChromeBinary();
  if (!chromeBin) {
    process.env.E2E_SKIP =
      'Chrome not available — install Chrome or run via Docker: pnpm run test:e2e:docker';
    return;
  }

  const CDP_PORT = 9333;

  const chrome = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${CDP_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      'about:blank'
    ],
    { stdio: 'ignore', detached: false }
  );

  (globalThis as Record<string, unknown>).__E2E_CHROME__ = chrome;
  await waitForPort(CDP_PORT);

  const aab = spawn(
    'node',
    [
      '--experimental-vm-modules',
      'dist/index.js',
      '--no-launch',
      '--port',
      String(AAB_PORT),
      '--cdp-port',
      String(CDP_PORT),
      '--log-level',
      'error'
    ],
    {
      stdio: 'ignore',
      env: { ...process.env, NODE_ENV: 'production' }
    }
  );

  (globalThis as Record<string, unknown>).__E2E_AAB__ = aab;
  await waitForPort(AAB_PORT);
  process.env.E2E_AAB_PORT = String(AAB_PORT);
}
