import type { Config } from '../../util/config.js';
import { BidiDriver } from './bidi-driver.js';
import { CdpDriver } from './cdp-driver.js';
import type { BrowserDriver, BrowserKind, DriverSession } from './types.js';

/** Browsers with a working driver. */
export const SUPPORTED_BROWSERS = ['chrome', 'firefox'] as const;

type PlannedBrowser = Exclude<BrowserKind, (typeof SUPPORTED_BROWSERS)[number]>;

/** Tracking issues for browsers that do not have a driver yet. */
export const PLANNED_DRIVERS: Readonly<Record<PlannedBrowser, string>> = {
  safari: 'https://github.com/everydaydevopsio/pilot/issues/60',
  webkit: 'https://github.com/everydaydevopsio/pilot/issues/61'
};

export class UnsupportedBrowserError extends Error {
  constructor(readonly browser: PlannedBrowser) {
    super(
      `Pilot does not support ${browser} yet; available browsers: ${SUPPORTED_BROWSERS.join(', ')}. ` +
        `Progress is tracked in ${PLANNED_DRIVERS[browser]}.`
    );
    this.name = 'UnsupportedBrowserError';
  }
}

export function createDriver(
  kind: BrowserKind,
  config: Config,
  session: DriverSession
): BrowserDriver {
  switch (kind) {
    case 'chrome':
      return CdpDriver.create(config, session);
    case 'firefox':
      return BidiDriver.create(config, session);
    default:
      throw new UnsupportedBrowserError(kind);
  }
}
