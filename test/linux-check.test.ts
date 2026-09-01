import { checkDisplay, runLinuxChecks } from '../src/cli/linux-check.js';

describe('Linux browser preflight', () => {
  const originalDisplay = process.env.DISPLAY;
  const originalWaylandDisplay = process.env.WAYLAND_DISPLAY;
  const originalPlatform = process.platform;

  afterEach(() => {
    if (originalDisplay === undefined) delete process.env.DISPLAY;
    else process.env.DISPLAY = originalDisplay;
    if (originalWaylandDisplay === undefined)
      delete process.env.WAYLAND_DISPLAY;
    else process.env.WAYLAND_DISPLAY = originalWaylandDisplay;
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

  it('is a no-op on non-Linux platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    await expect(
      runLinuxChecks({ headless: false, profileName: 'profile1' })
    ).resolves.toEqual([]);
  });
});
