import { sandboxDecision, shouldDisableSandbox } from '../src/browser.js';

describe('shouldDisableSandbox', () => {
  const origPlatform = process.platform;
  const origEnv = process.env.AAB_CHROME_NO_SANDBOX;
  const origGetuid = process.getuid;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: origPlatform });
    if (origEnv === undefined) {
      delete process.env.AAB_CHROME_NO_SANDBOX;
    } else {
      process.env.AAB_CHROME_NO_SANDBOX = origEnv;
    }
    if (origGetuid) {
      process.getuid = origGetuid;
    }
  });

  it('returns true when AAB_CHROME_NO_SANDBOX=true', () => {
    process.env.AAB_CHROME_NO_SANDBOX = 'true';
    expect(shouldDisableSandbox()).toBe(true);
    expect(sandboxDecision()).toEqual({
      disable: true,
      reason: 'env_override'
    });
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

  it('returns false on macOS when env is unset', () => {
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

  it('auto-applies on Linux when running as root', () => {
    delete process.env.AAB_CHROME_NO_SANDBOX;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.getuid = () => 0;
    expect(sandboxDecision()).toEqual({ disable: true, reason: 'root_user' });
  });

  it('does not auto-apply on Linux for a non-root user', () => {
    delete process.env.AAB_CHROME_NO_SANDBOX;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.getuid = () => 1000;
    expect(shouldDisableSandbox()).toBe(false);
  });

  it('env override can disable the flag even when running as root', () => {
    process.env.AAB_CHROME_NO_SANDBOX = 'false';
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.getuid = () => 0;
    expect(shouldDisableSandbox()).toBe(false);
  });
});
