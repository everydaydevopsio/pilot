import type { Client } from 'chrome-remote-interface';

interface EmulationDomain {
  setDeviceMetricsOverride(params: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    mobile: boolean;
  }): Promise<void>;
  setTouchEmulationEnabled(params: {
    enabled: boolean;
    maxTouchPoints?: number;
  }): Promise<void>;
  setUserAgentOverride(params: { userAgent: string }): Promise<void>;
}

interface BrowserDomain {
  getWindowForTarget(params?: {
    targetId?: string;
  }): Promise<{ windowId: number }>;
  setWindowBounds(params: {
    windowId: number;
    bounds: { width?: number; height?: number };
  }): Promise<void>;
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
  userAgent?: string;
}

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

export const VIEWPORT_PRESETS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false },
  'desktop-small': {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false
  },
  tablet: {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    mobile: true,
    userAgent: MOBILE_USER_AGENT
  },
  'tablet-landscape': {
    width: 1024,
    height: 768,
    deviceScaleFactor: 2,
    mobile: true,
    userAgent: MOBILE_USER_AGENT
  },
  mobile: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent: MOBILE_USER_AGENT
  },
  'mobile-landscape': {
    width: 844,
    height: 390,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent: MOBILE_USER_AGENT
  },
  'mobile-small': {
    width: 360,
    height: 800,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent: MOBILE_USER_AGENT
  }
} satisfies Record<string, ViewportConfig>;

export type ViewportPresetName = keyof typeof VIEWPORT_PRESETS;

export interface ResolveViewportOptions {
  preset?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
}

export function resolveViewport(
  opts: ResolveViewportOptions = {}
): ViewportConfig {
  const presetName = opts.preset ?? 'desktop';
  const presets = VIEWPORT_PRESETS as Record<string, ViewportConfig>;
  const base = presets[presetName];
  if (!base) {
    const valid = Object.keys(VIEWPORT_PRESETS).join(', ');
    throw new Error(
      `Unknown viewport preset "${presetName}". Valid presets: ${valid}`
    );
  }

  return {
    ...base,
    ...(opts.width !== undefined && { width: opts.width }),
    ...(opts.height !== undefined && { height: opts.height }),
    ...(opts.deviceScaleFactor !== undefined && {
      deviceScaleFactor: opts.deviceScaleFactor
    })
  };
}

export async function applyViewport(
  client: Client,
  config: ViewportConfig
): Promise<void> {
  const emulation = client.Emulation as unknown as EmulationDomain;
  const browser = client.Browser as unknown as BrowserDomain;

  // Resize the actual browser window so it matches the viewport dimensions.
  // This is needed because --window-size is unreliable (Chrome may restore
  // a previous size from the profile) and setDeviceMetricsOverride only
  // overrides the rendering viewport, not the window itself.
  try {
    const { windowId } = await browser.getWindowForTarget();
    await browser.setWindowBounds({
      windowId,
      bounds: { width: config.width, height: config.height }
    });
  } catch {
    // Best-effort: headless Chrome or older versions may not support this.
  }

  await emulation.setDeviceMetricsOverride({
    width: config.width,
    height: config.height,
    deviceScaleFactor: config.deviceScaleFactor,
    mobile: config.mobile
  });

  if (config.mobile) {
    await emulation.setTouchEmulationEnabled({
      enabled: true,
      maxTouchPoints: 5
    });
  }

  if (config.userAgent) {
    await emulation.setUserAgentOverride({
      userAgent: config.userAgent
    });
  }
}
