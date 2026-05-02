import { execSync, spawn, execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';

const CDP_PORT = 9333;
const AAB_PORT = 8866;

export const E2E_CONFIG = { CDP_PORT, AAB_PORT };

function waitForPort(
  port: number,
  host = '127.0.0.1',
  timeoutMs = 15000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      if (Date.now() > deadline) {
        reject(new Error(`Port ${port} did not open within ${timeoutMs}ms`));
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

function findChromeBinary(): string {
  // browser-actions/setup-chrome sets CHROME_PATH to the installed binary
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome'
  ];
  for (const bin of candidates) {
    try {
      execFileSync('which', [bin], { stdio: 'ignore' });
      return bin;
    } catch {
      // not found, try next
    }
  }
  throw new Error(
    'Chrome/Chromium not found. Install google-chrome or chromium, or run: pnpm run test:e2e:docker'
  );
}

export default async function globalSetup(): Promise<void> {
  // Start Chrome headless with remote debugging
  const chromeBin = findChromeBinary();
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
    {
      stdio: 'ignore',
      detached: false
    }
  );

  (globalThis as Record<string, unknown>).__E2E_CHROME__ = chrome;

  // Wait for Chrome CDP port
  await waitForPort(CDP_PORT);

  // Start aab
  const aab = spawn(
    'node',
    [
      '--experimental-vm-modules',
      'dist/index.js',
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

  // Wait for aab port
  await waitForPort(AAB_PORT);

  // Store config for tests
  process.env.E2E_AAB_PORT = String(AAB_PORT);
  process.env.E2E_CDP_PORT = String(CDP_PORT);
}

void execSync; // quiet unused import warning
void execFileSync;
