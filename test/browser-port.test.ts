import { formatPortBindError } from '../src/browser/chrome-launcher.js';

describe('formatPortBindError', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('adds an actionable diagnostic for Linux EPERM errors', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const error = Object.assign(new Error('not permitted'), { code: 'EPERM' });

    const result = formatPortBindError(error);

    expect(result).not.toBe(error);
    expect(result.message).toContain('127.0.0.1 (EPERM)');
    expect(result.message).toContain('sandbox or container policy');
  });

  it('preserves other socket errors', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const error = Object.assign(new Error('in use'), { code: 'EADDRINUSE' });

    expect(formatPortBindError(error)).toBe(error);
  });

  it('preserves EPERM errors outside Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const error = Object.assign(new Error('not permitted'), { code: 'EPERM' });

    expect(formatPortBindError(error)).toBe(error);
  });
});
