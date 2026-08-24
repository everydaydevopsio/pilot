import { loadConfig } from '../../src/util/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.PILOT_CDP_PORT;
    delete process.env.PILOT_CDP_HOST;
    delete process.env.PILOT_LOG_LEVEL;
    delete process.env.PILOT_CDP_RETRY_MS;
    delete process.env.PILOT_CDP_MAX_RETRY_MS;
    delete process.env.PILOT_PROFILE_NAME;
    delete process.env.PILOT_HEADLESS;
    delete process.env.PILOT_VIEWPORT;
    delete process.env.PILOT_RESPONSIVE;
  });

  it('returns defaults when no args or env vars', () => {
    const config = loadConfig();
    expect(config.cdpPort).toBe(9222);
    expect(config.cdpHost).toBe('127.0.0.1');
    expect(config.cdpRetryMs).toBe(2000);
    expect(config.cdpMaxRetryMs).toBe(30000);
    expect(config.logLevel).toBe('info');
  });

  it('CLI args override defaults', () => {
    const config = loadConfig({
      cdpPort: 9333,
      cdpHost: '0.0.0.0',
      logLevel: 'debug'
    });
    expect(config.cdpPort).toBe(9333);
    expect(config.cdpHost).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  it('env vars are used when no CLI args', () => {
    process.env.PILOT_CDP_PORT = '9400';
    process.env.PILOT_LOG_LEVEL = 'warn';
    const config = loadConfig();
    expect(config.cdpPort).toBe(9400);
    expect(config.logLevel).toBe('warn');
  });

  it('CLI args override env vars', () => {
    process.env.PILOT_CDP_PORT = '9400';
    const config = loadConfig({ cdpPort: 9500 });
    expect(config.cdpPort).toBe(9500);
  });

  it('throws on invalid log level', () => {
    expect(() => loadConfig({ logLevel: 'superverbose' })).toThrow();
  });

  it('defaults profileName to profile1', () => {
    const config = loadConfig();
    expect(config.profileName).toBe('profile1');
  });

  it('reads PILOT_PROFILE_NAME from env', () => {
    process.env.PILOT_PROFILE_NAME = 'custom-profile';
    const config = loadConfig();
    expect(config.profileName).toBe('custom-profile');
  });

  it('CLI arg profileName overrides env', () => {
    process.env.PILOT_PROFILE_NAME = 'env-profile';
    const config = loadConfig({ profileName: 'cli-profile' });
    expect(config.profileName).toBe('cli-profile');
  });

  it('headless defaults to false when PILOT_HEADLESS is unset', () => {
    const config = loadConfig();
    expect(config.headless).toBe(false);
  });

  it('PILOT_HEADLESS=false sets headless to false', () => {
    process.env.PILOT_HEADLESS = 'false';
    const config = loadConfig();
    expect(config.headless).toBe(false);
  });

  it('PILOT_HEADLESS=true sets headless to true', () => {
    process.env.PILOT_HEADLESS = 'true';
    const config = loadConfig();
    expect(config.headless).toBe(true);
  });

  it('PILOT_HEADLESS=1 sets headless to true', () => {
    process.env.PILOT_HEADLESS = '1';
    const config = loadConfig();
    expect(config.headless).toBe(true);
  });

  it('PILOT_HEADLESS=0 sets headless to false', () => {
    process.env.PILOT_HEADLESS = '0';
    const config = loadConfig();
    expect(config.headless).toBe(false);
  });

  it('viewport defaults to desktop when PILOT_VIEWPORT is unset', () => {
    const config = loadConfig();
    expect(config.viewport).toBe('desktop');
  });

  it('reads PILOT_VIEWPORT from env', () => {
    process.env.PILOT_VIEWPORT = 'mobile';
    const config = loadConfig();
    expect(config.viewport).toBe('mobile');
  });

  it('CLI arg viewport overrides env', () => {
    process.env.PILOT_VIEWPORT = 'tablet';
    const config = loadConfig({ viewport: 'mobile' });
    expect(config.viewport).toBe('mobile');
  });

  it('responsive is undefined by default', () => {
    const config = loadConfig();
    expect(config.responsive).toBeUndefined();
  });

  it('PILOT_RESPONSIVE=true sets responsive to true', () => {
    process.env.PILOT_RESPONSIVE = 'true';
    const config = loadConfig();
    expect(config.responsive).toBe(true);
  });

  it('PILOT_RESPONSIVE=false sets responsive to false', () => {
    process.env.PILOT_RESPONSIVE = 'false';
    const config = loadConfig();
    expect(config.responsive).toBe(false);
  });

  it('CLI arg responsive overrides env', () => {
    process.env.PILOT_RESPONSIVE = 'true';
    const config = loadConfig({ responsive: false });
    expect(config.responsive).toBe(false);
  });
});
