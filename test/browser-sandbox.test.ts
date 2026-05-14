import { shouldDisableSandbox } from '../src/browser.js';

describe('shouldDisableSandbox', () => {
  const origPlatform = process.platform;
  const origEnv = process.env.AAB_CHROME_NO_SANDBOX;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
    if (origEnv === undefined) {
      delete process.env.AAB_CHROME_NO_SANDBOX;
    } else {
      process.env.AAB_CHROME_NO_SANDBOX = origEnv;
    }
  });

  it('returns true when AAB_CHROME_NO_SANDBOX=true', () => {
    process.env.AAB_CHROME_NO_SANDBOX = 'true';
    expect(shouldDisableSandbox()).toBe(true);
  });

  it('returns true when AAB_CHROME_NO_SANDBOX=1', () => {
    process.env.AAB_CHROME_NO_SANDBOX = '1';
    expect(shouldDisableSandbox()).toBe(true);
  });

  it('returns false when AAB_CHROME_NO_SANDBOX=false', () => {
    process.env.AAB_CHROME_NO_SANDBOX = 'false';
    expect(shouldDisableSandbox()).toBe(false);
  });

  it('returns false when AAB_CHROME_NO_SANDBOX is empty string', () => {
    process.env.AAB_CHROME_NO_SANDBOX = '';
    expect(shouldDisableSandbox()).toBe(false);
  });

  it('returns false on macOS regardless of env', () => {
    delete process.env.AAB_CHROME_NO_SANDBOX;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(shouldDisableSandbox()).toBe(false);
  });

  it('env override takes precedence over platform check', () => {
    // Even on macOS, the explicit env var should win
    process.env.AAB_CHROME_NO_SANDBOX = 'true';
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(shouldDisableSandbox()).toBe(true);
  });
});
