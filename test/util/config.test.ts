import { loadConfig } from '../../src/util/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.AAB_CDP_PORT;
    delete process.env.AAB_CDP_HOST;
    delete process.env.AAB_LOG_LEVEL;
    delete process.env.AAB_CDP_RETRY_MS;
    delete process.env.AAB_CDP_MAX_RETRY_MS;
    delete process.env.AAB_PROFILE_NAME;
    delete process.env.AAB_HEADLESS;
    delete process.env.AAB_VIEWPORT;
    delete process.env.AAB_RESPONSIVE;
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
    process.env.AAB_CDP_PORT = '9400';
    process.env.AAB_LOG_LEVEL = 'warn';
    const config = loadConfig();
    expect(config.cdpPort).toBe(9400);
    expect(config.logLevel).toBe('warn');
  });

  it('CLI args override env vars', () => {
    process.env.AAB_CDP_PORT = '9400';
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

  it('reads AAB_PROFILE_NAME from env', () => {
    process.env.AAB_PROFILE_NAME = 'custom-profile';
    const config = loadConfig();
    expect(config.profileName).toBe('custom-profile');
  });

  it('CLI arg profileName overrides env', () => {
    process.env.AAB_PROFILE_NAME = 'env-profile';
    const config = loadConfig({ profileName: 'cli-profile' });
    expect(config.profileName).toBe('cli-profile');
  });

  it('headless defaults to true when AAB_HEADLESS is unset', () => {
    const config = loadConfig();
    expect(config.headless).toBe(true);
  });

  it('AAB_HEADLESS=false sets headless to false', () => {
    process.env.AAB_HEADLESS = 'false';
    const config = loadConfig();
    expect(config.headless).toBe(false);
  });

  it('AAB_HEADLESS=true sets headless to true', () => {
    process.env.AAB_HEADLESS = 'true';
    const config = loadConfig();
    expect(config.headless).toBe(true);
  });

  it('viewport defaults to desktop when AAB_VIEWPORT is unset', () => {
    const config = loadConfig();
    expect(config.viewport).toBe('desktop');
  });

  it('reads AAB_VIEWPORT from env', () => {
    process.env.AAB_VIEWPORT = 'mobile';
    const config = loadConfig();
    expect(config.viewport).toBe('mobile');
  });

  it('CLI arg viewport overrides env', () => {
    process.env.AAB_VIEWPORT = 'tablet';
    const config = loadConfig({ viewport: 'mobile' });
    expect(config.viewport).toBe('mobile');
  });

  it('responsive is undefined by default', () => {
    const config = loadConfig();
    expect(config.responsive).toBeUndefined();
  });

  it('AAB_RESPONSIVE=true sets responsive to true', () => {
    process.env.AAB_RESPONSIVE = 'true';
    const config = loadConfig();
    expect(config.responsive).toBe(true);
  });

  it('AAB_RESPONSIVE=false sets responsive to false', () => {
    process.env.AAB_RESPONSIVE = 'false';
    const config = loadConfig();
    expect(config.responsive).toBe(false);
  });

  it('CLI arg responsive overrides env', () => {
    process.env.AAB_RESPONSIVE = 'true';
    const config = loadConfig({ responsive: false });
    expect(config.responsive).toBe(false);
  });
});
