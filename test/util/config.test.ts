import { loadConfig } from '../../src/util/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.AAB_CDP_PORT;
    delete process.env.AAB_CDP_HOST;
    delete process.env.AAB_LOG_LEVEL;
    delete process.env.AAB_CDP_RETRY_MS;
    delete process.env.AAB_CDP_MAX_RETRY_MS;
    delete process.env.AAB_PROFILE_NAME;
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
});
