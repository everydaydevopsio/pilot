import { lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { hostname, tmpdir } from 'os';
import { join } from 'path';
import {
  resolveUserDataDir,
  isProfileLocked,
  extractLockPid,
  isProcessAlive,
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

describe('extractLockPid', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `aab-extract-pid-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts pid and hostname from a symlink target', () => {
    const lockPath = join(tempDir, 'SingletonLock');
    symlinkSync('myhost-12345', lockPath);
    const result = extractLockPid(lockPath);
    expect(result).toEqual({ pid: 12345, lockHost: 'myhost' });
  });

  it('handles hostnames with hyphens', () => {
    const lockPath = join(tempDir, 'SingletonLock');
    symlinkSync('my-host-name-42', lockPath);
    const result = extractLockPid(lockPath);
    expect(result).toEqual({ pid: 42, lockHost: 'my-host-name' });
  });

  it('returns null for a regular file', () => {
    const lockPath = join(tempDir, 'SingletonLock');
    writeFileSync(lockPath, '');
    expect(extractLockPid(lockPath)).toBeNull();
  });

  it('returns null for a non-existent file', () => {
    expect(extractLockPid(join(tempDir, 'nofile'))).toBeNull();
  });

  it('returns null for a symlink with no hyphen', () => {
    const lockPath = join(tempDir, 'SingletonLock');
    symlinkSync('nopid', lockPath);
    expect(extractLockPid(lockPath)).toBeNull();
  });

  it('returns null for a symlink with non-numeric pid', () => {
    const lockPath = join(tempDir, 'SingletonLock');
    symlinkSync('host-abc', lockPath);
    expect(extractLockPid(lockPath)).toBeNull();
  });
});

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for a non-existent PID', () => {
    // Use a very high PID unlikely to exist
    expect(isProcessAlive(4000000)).toBe(false);
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
    // Regular file = cannot extract PID, falls back to conservative (locked)
    writeFileSync(join(tempDir, 'SingletonLock'), '');
    expect(isProfileLocked(tempDir)).toBe(true);
  });

  it('returns true when lockfile exists (no SingletonLock)', () => {
    writeFileSync(join(tempDir, 'lockfile'), '');
    expect(isProfileLocked(tempDir)).toBe(true);
  });

  it('returns false for a non-existent directory', () => {
    expect(isProfileLocked('/tmp/aab-nonexistent-dir-99999')).toBe(false);
  });

  it('cleans up stale locks when symlink PID is dead', () => {
    // Spawn a short-lived process and wait for it to exit so the PID
    // is guaranteed dead at assertion time — avoids flaky failures
    // from hardcoded PIDs that might exist on CI hosts.
    const deadPid = execSync('echo $$', { encoding: 'utf8' }).trim();
    const currentHost = hostname();
    const target = `${currentHost}-${deadPid}`;
    symlinkSync(target, join(tempDir, 'SingletonLock'));
    writeFileSync(join(tempDir, 'lockfile'), '');

    expect(isProfileLocked(tempDir)).toBe(false);

    // Lock files should have been removed — use lstatSync to detect
    // dangling symlinks that existsSync would miss.
    expect(() => lstatSync(join(tempDir, 'SingletonLock'))).toThrow();
    expect(() => lstatSync(join(tempDir, 'lockfile'))).toThrow();
  });

  it('returns true when symlink PID is alive', () => {
    const currentHost = hostname();
    // Use our own PID — guaranteed to be alive
    const target = `${currentHost}-${process.pid}`;
    symlinkSync(target, join(tempDir, 'SingletonLock'));

    expect(isProfileLocked(tempDir)).toBe(true);
  });

  it('returns true when symlink hostname does not match', () => {
    // Different hostname means lock was created on another machine
    symlinkSync('other-host-99999', join(tempDir, 'SingletonLock'));

    expect(isProfileLocked(tempDir)).toBe(true);
  });
});
