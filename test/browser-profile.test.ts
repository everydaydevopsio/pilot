import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  resolveUserDataDir,
  isProfileLocked,
  PROFILE_NAME_RE
} from '../src/browser.js';

describe('resolveUserDataDir', () => {
  const origXdg = process.env.XDG_DATA_HOME;

  afterEach(() => {
    if (origXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = origXdg;
    }
  });

  it('uses XDG_DATA_HOME when set', () => {
    process.env.XDG_DATA_HOME = '/tmp/xdg-test';
    expect(resolveUserDataDir('myprofile')).toBe('/tmp/xdg-test/aab/myprofile');
  });

  it('falls back to ~/.local/share when XDG_DATA_HOME is unset', () => {
    delete process.env.XDG_DATA_HOME;
    const result = resolveUserDataDir('profile1');
    expect(result).toMatch(/\.local\/share\/aab\/profile1$/);
  });

  it('throws on empty profile name', () => {
    expect(() => resolveUserDataDir('')).toThrow(/invalid profile name/i);
  });

  it('throws on profile name starting with a hyphen', () => {
    expect(() => resolveUserDataDir('-bad')).toThrow(/invalid profile name/i);
  });

  it('throws on profile name starting with an underscore', () => {
    expect(() => resolveUserDataDir('_bad')).toThrow(/invalid profile name/i);
  });

  it('throws on path traversal attempts', () => {
    expect(() => resolveUserDataDir('../../etc')).toThrow(
      /invalid profile name/i
    );
  });

  it('throws on profile name with spaces', () => {
    expect(() => resolveUserDataDir('my profile')).toThrow(
      /invalid profile name/i
    );
  });

  it('throws on profile name with special characters', () => {
    expect(() => resolveUserDataDir('pro/file')).toThrow(
      /invalid profile name/i
    );
    expect(() => resolveUserDataDir('pro\\file')).toThrow(
      /invalid profile name/i
    );
  });

  it('accepts alphanumeric names with hyphens and underscores', () => {
    expect(() => resolveUserDataDir('my-profile_1')).not.toThrow();
    expect(() => resolveUserDataDir('A')).not.toThrow();
    expect(() => resolveUserDataDir('test123')).not.toThrow();
  });
});

describe('PROFILE_NAME_RE', () => {
  const valid = ['profile1', 'a', 'my-profile', 'test_123', 'A1-b_2'];
  const invalid = ['', '-start', '_start', '../../x', 'has space', 'a/b'];

  it.each(valid)('matches valid name: %s', (name) => {
    expect(PROFILE_NAME_RE.test(name)).toBe(true);
  });

  it.each(invalid)('rejects invalid name: %s', (name) => {
    expect(PROFILE_NAME_RE.test(name)).toBe(false);
  });
});

describe('isProfileLocked', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `aab-lock-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when no lock files exist', () => {
    expect(isProfileLocked(tempDir)).toBe(false);
  });

  it('returns true when SingletonLock exists as a regular file', () => {
    writeFileSync(join(tempDir, 'SingletonLock'), '');
    expect(isProfileLocked(tempDir)).toBe(true);
  });

  it('returns true when SingletonLock is a dangling symlink', () => {
    // Chrome on Linux creates SingletonLock as a symlink to hostname-pid,
    // which is a dangling symlink. existsSync would miss it.
    symlinkSync('localhost-99999', join(tempDir, 'SingletonLock'));
    expect(isProfileLocked(tempDir)).toBe(true);
  });

  it('returns true when lockfile exists', () => {
    writeFileSync(join(tempDir, 'lockfile'), '');
    expect(isProfileLocked(tempDir)).toBe(true);
  });

  it('returns false for a non-existent directory', () => {
    expect(isProfileLocked('/tmp/aab-nonexistent-dir-99999')).toBe(false);
  });
});
