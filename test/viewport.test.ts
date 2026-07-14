import type { Client } from 'chrome-remote-interface';
import {
  VIEWPORT_PRESETS,
  resolveViewport,
  applyViewport
} from '../src/viewport.js';

describe('resolveViewport', () => {
  it('returns desktop preset by default', () => {
    const config = resolveViewport();
    expect(config).toEqual(VIEWPORT_PRESETS['desktop']);
  });

  it('returns desktop preset when explicitly requested', () => {
    const config = resolveViewport({ preset: 'desktop' });
    expect(config.width).toBe(1920);
    expect(config.height).toBe(1080);
    expect(config.deviceScaleFactor).toBe(1);
    expect(config.mobile).toBe(false);
    expect(config.userAgent).toBeUndefined();
    expect(config.responsive).toBe(true);
  });

  it('returns desktop-small preset', () => {
    const config = resolveViewport({ preset: 'desktop-small' });
    expect(config.width).toBe(1366);
    expect(config.height).toBe(768);
    expect(config.mobile).toBe(false);
    expect(config.responsive).toBe(true);
  });

  it('returns tablet preset with mobile flags', () => {
    const config = resolveViewport({ preset: 'tablet' });
    expect(config.width).toBe(768);
    expect(config.height).toBe(1024);
    expect(config.deviceScaleFactor).toBe(2);
    expect(config.mobile).toBe(true);
    expect(config.userAgent).toBeDefined();
  });

  it('returns tablet-landscape preset', () => {
    const config = resolveViewport({ preset: 'tablet-landscape' });
    expect(config.width).toBe(1024);
    expect(config.height).toBe(768);
    expect(config.mobile).toBe(true);
  });

  it('returns mobile preset', () => {
    const config = resolveViewport({ preset: 'mobile' });
    expect(config.width).toBe(390);
    expect(config.height).toBe(844);
    expect(config.deviceScaleFactor).toBe(3);
    expect(config.mobile).toBe(true);
    expect(config.userAgent).toBeDefined();
  });

  it('returns mobile-landscape preset', () => {
    const config = resolveViewport({ preset: 'mobile-landscape' });
    expect(config.width).toBe(844);
    expect(config.height).toBe(390);
    expect(config.mobile).toBe(true);
  });

  it('returns mobile-small preset', () => {
    const config = resolveViewport({ preset: 'mobile-small' });
    expect(config.width).toBe(360);
    expect(config.height).toBe(800);
    expect(config.deviceScaleFactor).toBe(3);
    expect(config.mobile).toBe(true);
  });

  it('returns desktop-scaled preset', () => {
    const config = resolveViewport({ preset: 'desktop-scaled' });
    expect(config.width).toBe(1536);
    expect(config.height).toBe(864);
    expect(config.deviceScaleFactor).toBe(1.25);
    expect(config.mobile).toBe(false);
    expect(config.responsive).toBe(true);
  });

  it('returns desktop-qhd preset', () => {
    const config = resolveViewport({ preset: 'desktop-qhd' });
    expect(config.width).toBe(2560);
    expect(config.height).toBe(1440);
    expect(config.deviceScaleFactor).toBe(1);
    expect(config.mobile).toBe(false);
    expect(config.responsive).toBe(true);
  });

  it('returns mobile-pro preset', () => {
    const config = resolveViewport({ preset: 'mobile-pro' });
    expect(config.width).toBe(393);
    expect(config.height).toBe(852);
    expect(config.deviceScaleFactor).toBe(3);
    expect(config.mobile).toBe(true);
    expect(config.userAgent).toBeDefined();
  });

  it('returns mobile-large preset', () => {
    const config = resolveViewport({ preset: 'mobile-large' });
    expect(config.width).toBe(430);
    expect(config.height).toBe(932);
    expect(config.deviceScaleFactor).toBe(3);
    expect(config.mobile).toBe(true);
    expect(config.userAgent).toBeDefined();
  });

  it('returns mobile-android preset', () => {
    const config = resolveViewport({ preset: 'mobile-android' });
    expect(config.width).toBe(412);
    expect(config.height).toBe(915);
    expect(config.deviceScaleFactor).toBe(2.625);
    expect(config.mobile).toBe(true);
    expect(config.userAgent).toBeDefined();
  });

  it('throws on unknown preset name', () => {
    expect(() => resolveViewport({ preset: 'unknown' })).toThrow(
      /Unknown viewport preset "unknown"/
    );
  });

  it('custom width overrides preset', () => {
    const config = resolveViewport({ preset: 'desktop', width: 1280 });
    expect(config.width).toBe(1280);
    expect(config.height).toBe(1080);
  });

  it('custom height overrides preset', () => {
    const config = resolveViewport({ preset: 'desktop', height: 720 });
    expect(config.width).toBe(1920);
    expect(config.height).toBe(720);
  });

  it('custom deviceScaleFactor overrides preset', () => {
    const config = resolveViewport({
      preset: 'desktop',
      deviceScaleFactor: 2
    });
    expect(config.deviceScaleFactor).toBe(2);
    expect(config.mobile).toBe(false);
  });

  it('custom overrides work with mobile preset', () => {
    const config = resolveViewport({ preset: 'mobile', width: 414 });
    expect(config.width).toBe(414);
    expect(config.height).toBe(844);
    expect(config.mobile).toBe(true);
    expect(config.userAgent).toBeDefined();
  });

  it('partial custom overrides keep other preset values', () => {
    const config = resolveViewport({
      preset: 'tablet',
      width: 800
    });
    expect(config.width).toBe(800);
    expect(config.height).toBe(1024);
    expect(config.deviceScaleFactor).toBe(2);
    expect(config.mobile).toBe(true);
  });

  it('desktop presets default responsive to true', () => {
    expect(resolveViewport({ preset: 'desktop' }).responsive).toBe(true);
    expect(resolveViewport({ preset: 'desktop-small' }).responsive).toBe(true);
    expect(resolveViewport({ preset: 'desktop-scaled' }).responsive).toBe(true);
    expect(resolveViewport({ preset: 'desktop-qhd' }).responsive).toBe(true);
  });

  it('mobile/tablet presets default responsive to undefined', () => {
    expect(resolveViewport({ preset: 'mobile' }).responsive).toBeUndefined();
    expect(resolveViewport({ preset: 'tablet' }).responsive).toBeUndefined();
    expect(
      resolveViewport({ preset: 'mobile-pro' }).responsive
    ).toBeUndefined();
    expect(
      resolveViewport({ preset: 'mobile-large' }).responsive
    ).toBeUndefined();
    expect(
      resolveViewport({ preset: 'mobile-android' }).responsive
    ).toBeUndefined();
  });

  it('responsive override to false on desktop preset', () => {
    const config = resolveViewport({ preset: 'desktop', responsive: false });
    expect(config.responsive).toBe(false);
    expect(config.width).toBe(1920);
  });

  it('responsive override to true on mobile preset', () => {
    const config = resolveViewport({ preset: 'mobile', responsive: true });
    expect(config.responsive).toBe(true);
    expect(config.mobile).toBe(true);
  });
});

interface MockEmulation {
  setDeviceMetricsOverride: jest.Mock;
  setTouchEmulationEnabled: jest.Mock;
  setUserAgentOverride: jest.Mock;
}

function makeMockEmulationClient(): {
  client: Client;
  emulation: MockEmulation;
} {
  const emulation: MockEmulation = {
    setDeviceMetricsOverride: jest.fn().mockResolvedValue(undefined),
    setTouchEmulationEnabled: jest.fn().mockResolvedValue(undefined),
    setUserAgentOverride: jest.fn().mockResolvedValue(undefined)
  };
  const browser = {
    getWindowForTarget: jest.fn().mockResolvedValue({ windowId: 1 }),
    setWindowBounds: jest.fn().mockResolvedValue(undefined)
  };
  const client = {
    Emulation: emulation,
    Browser: browser
  } as unknown as Client;
  return { client, emulation };
}

describe('applyViewport', () => {
  it('skips setDeviceMetricsOverride for desktop (responsive by default)', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'desktop' });

    await applyViewport(client, config);

    // Desktop presets default to responsive mode, so setDeviceMetricsOverride
    // is not called — the page uses real window dimensions instead.
    expect(emulation.setDeviceMetricsOverride).not.toHaveBeenCalled();
  });

  it('does not call touch or user-agent override for desktop', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'desktop' });

    await applyViewport(client, config);

    expect(emulation.setTouchEmulationEnabled).not.toHaveBeenCalled();
    expect(emulation.setUserAgentOverride).not.toHaveBeenCalled();
  });

  it('enables touch emulation for mobile presets', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'mobile' });

    await applyViewport(client, config);

    expect(emulation.setTouchEmulationEnabled).toHaveBeenCalledWith({
      enabled: true,
      maxTouchPoints: 5
    });
  });

  it('sets mobile user-agent for mobile presets', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'mobile' });

    await applyViewport(client, config);

    expect(emulation.setUserAgentOverride).toHaveBeenCalledWith({
      userAgent: expect.stringContaining('Mobile')
    });
  });

  it('enables touch and user-agent for tablet presets', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'tablet' });

    await applyViewport(client, config);

    expect(emulation.setTouchEmulationEnabled).toHaveBeenCalledWith({
      enabled: true,
      maxTouchPoints: 5
    });
    expect(emulation.setUserAgentOverride).toHaveBeenCalledWith({
      userAgent: expect.stringContaining('Mobile')
    });
  });

  it('calls setDeviceMetricsOverride with correct mobile params', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'mobile' });

    await applyViewport(client, config);

    expect(emulation.setDeviceMetricsOverride).toHaveBeenCalledWith({
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true
    });
  });

  it('skips setDeviceMetricsOverride when responsive is true', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'desktop' });
    // desktop defaults to responsive: true
    expect(config.responsive).toBe(true);

    await applyViewport(client, config);

    expect(emulation.setDeviceMetricsOverride).not.toHaveBeenCalled();
  });

  it('calls setDeviceMetricsOverride when responsive is explicitly false on desktop', async () => {
    const { client, emulation } = makeMockEmulationClient();
    const config = resolveViewport({ preset: 'desktop', responsive: false });

    await applyViewport(client, config);

    expect(emulation.setDeviceMetricsOverride).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });
  });

  it('still sets window bounds in responsive mode', async () => {
    const { client } = makeMockEmulationClient();
    const browser = (
      client as unknown as { Browser: { setWindowBounds: jest.Mock } }
    ).Browser;
    const config = resolveViewport({ preset: 'desktop' });

    await applyViewport(client, config);

    expect(browser.setWindowBounds).toHaveBeenCalledWith({
      windowId: 1,
      bounds: { width: 1920, height: 1080 }
    });
  });
});
