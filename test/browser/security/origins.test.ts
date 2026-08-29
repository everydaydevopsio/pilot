import {
  checkOrigin,
  extractOrigin
} from '../../../src/browser/security/origins.js';

describe('extractOrigin', () => {
  it('extracts origin from a full URL', () => {
    expect(extractOrigin('https://example.com/path?q=1')).toBe(
      'https://example.com'
    );
  });

  it('includes port when non-default', () => {
    expect(extractOrigin('http://localhost:3000/api')).toBe(
      'http://localhost:3000'
    );
  });

  it('returns input for invalid URLs', () => {
    expect(extractOrigin('not-a-url')).toBe('not-a-url');
  });
});

describe('checkOrigin', () => {
  const origBlocked = process.env.PILOT_BLOCKED_ORIGINS;
  const origAllowed = process.env.PILOT_ALLOWED_ORIGINS;

  afterEach(() => {
    if (origBlocked === undefined) {
      delete process.env.PILOT_BLOCKED_ORIGINS;
    } else {
      process.env.PILOT_BLOCKED_ORIGINS = origBlocked;
    }
    if (origAllowed === undefined) {
      delete process.env.PILOT_ALLOWED_ORIGINS;
    } else {
      process.env.PILOT_ALLOWED_ORIGINS = origAllowed;
    }
  });

  it('allows everything when both lists are empty', () => {
    delete process.env.PILOT_BLOCKED_ORIGINS;
    delete process.env.PILOT_ALLOWED_ORIGINS;
    expect(checkOrigin('https://anything.com').allowed).toBe(true);
  });

  it('blocks origins matching PILOT_BLOCKED_ORIGINS', () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'https://evil.com';
    delete process.env.PILOT_ALLOWED_ORIGINS;
    const result = checkOrigin('https://evil.com/path');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('allows origins not in block list', () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'https://evil.com';
    delete process.env.PILOT_ALLOWED_ORIGINS;
    expect(checkOrigin('https://good.com').allowed).toBe(true);
  });

  it('supports wildcard patterns in block list', () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'https://*.evil.com';
    delete process.env.PILOT_ALLOWED_ORIGINS;
    expect(checkOrigin('https://sub.evil.com/page').allowed).toBe(false);
    expect(checkOrigin('https://evil.com').allowed).toBe(true);
  });

  it('block wins over allow', () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'https://example.com';
    process.env.PILOT_ALLOWED_ORIGINS = 'https://example.com';
    expect(checkOrigin('https://example.com').allowed).toBe(false);
  });

  it('rejects origins not in allow list', () => {
    delete process.env.PILOT_BLOCKED_ORIGINS;
    process.env.PILOT_ALLOWED_ORIGINS = 'https://allowed.com';
    const result = checkOrigin('https://other.com');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in PILOT_ALLOWED_ORIGINS');
  });

  it('allows origins in allow list', () => {
    delete process.env.PILOT_BLOCKED_ORIGINS;
    process.env.PILOT_ALLOWED_ORIGINS = 'https://allowed.com';
    expect(checkOrigin('https://allowed.com/path').allowed).toBe(true);
  });

  it('supports wildcard in allow list', () => {
    delete process.env.PILOT_BLOCKED_ORIGINS;
    process.env.PILOT_ALLOWED_ORIGINS = 'https://*.myapp.com';
    expect(checkOrigin('https://staging.myapp.com').allowed).toBe(true);
    expect(checkOrigin('https://other.com').allowed).toBe(false);
  });

  it('supports multiple comma-separated patterns', () => {
    delete process.env.PILOT_BLOCKED_ORIGINS;
    process.env.PILOT_ALLOWED_ORIGINS =
      'https://app.com, https://*.internal.com';
    expect(checkOrigin('https://app.com').allowed).toBe(true);
    expect(checkOrigin('https://dev.internal.com').allowed).toBe(true);
    expect(checkOrigin('https://external.com').allowed).toBe(false);
  });

  it('ignores empty entries in comma-separated list', () => {
    delete process.env.PILOT_BLOCKED_ORIGINS;
    process.env.PILOT_ALLOWED_ORIGINS = 'https://app.com,,, ';
    expect(checkOrigin('https://app.com').allowed).toBe(true);
    expect(checkOrigin('https://other.com').allowed).toBe(false);
  });

  it('matching is case-insensitive', () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'https://Evil.COM';
    delete process.env.PILOT_ALLOWED_ORIGINS;
    expect(checkOrigin('https://evil.com').allowed).toBe(false);
  });
});
