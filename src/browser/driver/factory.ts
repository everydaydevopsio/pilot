import type { Config } from '../../util/config.js';
import { CdpDriver } from './cdp-driver.js';
import type { BrowserDriver, BrowserKind, DriverSession } from './types.js';

/** Tracking issues for browsers that do not have a driver yet. */
export const PLANNED_DRIVERS: Readonly<
  Record<Exclude<BrowserKind, 'chrome'>, string>
> = {
  firefox: 'https://github.com/everydaydevopsio/pilot/issues/58',
  safari: 'https://github.com/everydaydevopsio/pilot/issues/60',
  webkit: 'https://github.com/everydaydevopsio/pilot/issues/61'
};

export class UnsupportedBrowserError extends Error {
  constructor(readonly browser: Exclude<BrowserKind, 'chrome'>) {
    super(
      `Pilot does not support ${browser} yet; only chrome is available. ` +
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
  if (kind === 'chrome') {
    return CdpDriver.create(config, session);
  }
  throw new UnsupportedBrowserError(kind);
}
