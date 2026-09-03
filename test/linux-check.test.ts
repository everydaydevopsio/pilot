import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { request } from 'node:https';
import {
  assertLinuxBrowserPrerequisites,
  checkChrome,
  checkDisplay,
  checkOutboundHttps,
  checkProfile,
  runLinuxChecks
} from '../src/browser/preflight.js';

describe('Linux browser preflight', () => {
  const originalDisplay = process.env.DISPLAY;
  const originalWaylandDisplay = process.env.WAYLAND_DISPLAY;
  const originalXdgDataHome = process.env.XDG_DATA_HOME;
  const originalPlatform = process.platform;

  afterEach(() => {
    if (originalDisplay === undefined) delete process.env.DISPLAY;
    else process.env.DISPLAY = originalDisplay;
    if (originalWaylandDisplay === undefined)
      delete process.env.WAYLAND_DISPLAY;
    else process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
    if (originalXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = originalXdgDataHome;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('does not require a display in headless mode', () => {
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    expect(checkDisplay(true)).toEqual({
      name: 'display',
      ok: true,
      detail: 'not required in headless mode'
    });
  });

  it('reports an actionable failure for visible mode without a display', () => {
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;
    const result = checkDisplay(false);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('DISPLAY or WAYLAND_DISPLAY');
    expect(result.detail).toContain('xvfb-run');
  });

  it('accepts DISPLAY for visible mode', () => {
    process.env.DISPLAY = ':1';
    expect(checkDisplay(false)).toEqual({
      name: 'display',
      ok: true,
      detail: ':1'
    });
  });

  it('falls back to WAYLAND_DISPLAY for visible mode', () => {
    delete process.env.DISPLAY;
    process.env.WAYLAND_DISPLAY = 'wayland-1';
    expect(checkDisplay(false)).toEqual({
      name: 'display',
      ok: true,
      detail: 'wayland-1'
    });
  });

  it('checks executable Chrome paths', async () => {
    await expect(checkChrome('/bin/sh')).resolves.toEqual({
      name: 'chrome',
      ok: true,
      detail: '/bin/sh'
    });

    const failure = await checkChrome('/definitely/missing/pilot-chrome');
    expect(failure).toMatchObject({ name: 'chrome', ok: false });
    expect(failure.detail).toContain('ENOENT');
  });

  it('creates and verifies a writable profile directory', async () => {
    const dataHome = await mkdtemp(join(tmpdir(), 'pilot-check-'));
    process.env.XDG_DATA_HOME = dataHome;

    await expect(checkProfile('coverage')).resolves.toEqual({
      name: 'profile',
      ok: true,
      detail: join(dataHome, 'pilot', 'coverage')
    });
    await rm(dataHome, { recursive: true, force: true });
  });

  it('reports invalid profile names as actionable failures', async () => {
    const result = await checkProfile('../invalid');
    expect(result).toMatchObject({ name: 'profile', ok: false });
    expect(result.detail).toContain('Invalid profile name');
    expect(result.detail).not.toContain('not writable');
  });

  it('reports successful outbound HTTPS checks', async () => {
    const response = Object.assign(new EventEmitter(), {
      statusCode: 204,
      resume: jest.fn()
    });
    const req = Object.assign(new EventEmitter(), {
      end: jest.fn(),
      destroy: jest.fn()
    });
    const requestFn = jest.fn((_url, _options, callback) => {
      callback?.(response as unknown as IncomingMessage);
      return req as unknown as ClientRequest;
    }) as unknown as typeof request;

    await expect(checkOutboundHttps(100, requestFn)).resolves.toEqual({
      name: 'network',
      ok: true,
      detail: 'HTTPS status 204 (expected 204)'
    });
    expect(response.resume).toHaveBeenCalled();
    expect(req.end).toHaveBeenCalled();
  });

  it.each([302, 401, 500, undefined])(
    'rejects unexpected outbound HTTPS status %s',
    async (statusCode) => {
      const response = Object.assign(new EventEmitter(), {
        statusCode,
        resume: jest.fn()
      });
      const req = Object.assign(new EventEmitter(), {
        end: jest.fn(),
        destroy: jest.fn()
      });
      const requestFn = jest.fn((_url, _options, callback) => {
        callback?.(response as unknown as IncomingMessage);
        return req as unknown as ClientRequest;
      }) as unknown as typeof request;

      const result = await checkOutboundHttps(100, requestFn);
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('expected 204');
    }
  );

  it('reports outbound HTTPS errors', async () => {
    const req = Object.assign(new EventEmitter(), {
      end: jest.fn(),
      destroy: jest.fn()
    });
    const requestFn = jest.fn(
      () => req as unknown as ClientRequest
    ) as unknown as typeof request;
    const resultPromise = checkOutboundHttps(100, requestFn);
    req.emit('error', new Error('offline'));

    await expect(resultPromise).resolves.toEqual({
      name: 'network',
      ok: false,
      detail: 'Error: offline'
    });
  });

  it('destroys timed-out outbound HTTPS requests', async () => {
    const req = new EventEmitter() as EventEmitter & {
      end: jest.Mock;
      destroy: jest.Mock;
    };
    req.end = jest.fn();
    req.destroy = jest.fn((error: Error) => req.emit('error', error));
    const requestFn = jest.fn(
      () => req as unknown as ClientRequest
    ) as unknown as typeof request;
    const resultPromise = checkOutboundHttps(25, requestFn);
    req.emit('timeout');

    await expect(resultPromise).resolves.toMatchObject({
      name: 'network',
      ok: false,
      detail: expect.stringContaining('timeout after 25ms')
    });
    expect(req.destroy).toHaveBeenCalled();
  });

  it('aggregates Linux preflight checks without the network check', async () => {
    const dataHome = await mkdtemp(join(tmpdir(), 'pilot-check-'));
    process.env.XDG_DATA_HOME = dataHome;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    const results = await runLinuxChecks({
      headless: true,
      chromePath: '/bin/sh',
      profileName: 'coverage',
      checkNetwork: false
    });
    expect(results.map((result) => result.name)).toEqual([
      'chrome',
      'display',
      'profile',
      'loopback'
    ]);
    expect(results.slice(0, 3).every((result) => result.ok)).toBe(true);
    expect(results[3].detail).toContain('127.0.0.1');
    await rm(dataHome, { recursive: true, force: true });
  });

  it('throws a combined diagnostic when a Linux prerequisite fails', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    await expect(
      assertLinuxBrowserPrerequisites({
        headless: true,
        chromePath: '/definitely/missing/pilot-chrome',
        profileName: 'coverage'
      })
    ).rejects.toThrow(
      /Linux browser preflight failed:[\s\S]*chrome:[\s\S]*pilot check/
    );
  });

  it('is a no-op on non-Linux platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await expect(
      runLinuxChecks({ headless: false, profileName: 'profile1' })
    ).resolves.toEqual([]);
  });
});
