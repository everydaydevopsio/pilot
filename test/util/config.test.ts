import { loadConfig } from '../../src/util/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    delete process.env.AAB_PORT;
    delete process.env.AAB_HOST;
    delete process.env.AAB_CDP_PORT;
    delete process.env.AAB_CDP_HOST;
    delete process.env.AAB_LOG_LEVEL;
    delete process.env.AAB_CDP_RETRY_MS;
    delete process.env.AAB_CDP_MAX_RETRY_MS;
  });

  it('returns defaults when no args or env vars', () => {
    const config = loadConfig();
    expect(config.port).toBe(8765);
    expect(config.host).toBe('127.0.0.1');
    expect(config.cdpPort).toBe(9222);
    expect(config.cdpHost).toBe('127.0.0.1');
    expect(config.cdpRetryMs).toBe(2000);
    expect(config.cdpMaxRetryMs).toBe(30000);
    expect(config.logLevel).toBe('info');
  });

  it('CLI args override defaults', () => {
    const config = loadConfig({
      port: 9000,
      host: '0.0.0.0',
      logLevel: 'debug'
    });
    expect(config.port).toBe(9000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('debug');
  });

  it('env vars are used when no CLI args', () => {
    process.env.AAB_PORT = '7000';
    process.env.AAB_LOG_LEVEL = 'warn';
    const config = loadConfig();
    expect(config.port).toBe(7000);
    expect(config.logLevel).toBe('warn');
  });

  it('CLI args override env vars', () => {
    process.env.AAB_PORT = '7000';
    const config = loadConfig({ port: 8000 });
    expect(config.port).toBe(8000);
  });

  it('throws on invalid log level', () => {
    expect(() => loadConfig({ logLevel: 'superverbose' })).toThrow();
  });
});
