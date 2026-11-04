import { CdpDriver } from '../../../src/browser/driver/cdp-driver.js';
import {
  PLANNED_DRIVERS,
  UnsupportedBrowserError,
  createDriver
} from '../../../src/browser/driver/factory.js';
import type { DriverSession } from '../../../src/browser/driver/types.js';
import { ElementRefMap } from '../../../src/browser/inspect/element-ref.js';
import { DialogQueue } from '../../../src/browser/interaction/dialogs.js';
import { DownloadTracker } from '../../../src/browser/interaction/downloads.js';
import { NetworkBuffer } from '../../../src/browser/network/network-buffer.js';
import { createTraceState } from '../../../src/browser/performance/trace.js';
import { ConsoleBuffer } from '../../../src/mcp/console-buffer.js';
import { loadConfig } from '../../../src/util/config.js';

function session(): DriverSession {
  return {
    consoleBuffer: new ConsoleBuffer(10),
    elementRefMap: new ElementRefMap(),
    networkBuffer: new NetworkBuffer(),
    dialogQueue: new DialogQueue(),
    downloadTracker: new DownloadTracker(),
    traceState: createTraceState()
  };
}

// #62 AC4: chrome builds a CdpDriver; other browsers report their tracking issue.
describe('createDriver', () => {
  it('builds a disconnected CdpDriver for chrome', async () => {
    const driver = createDriver('chrome', loadConfig(), session());
    expect(driver).toBeInstanceOf(CdpDriver);
    expect(driver.kind).toBe('chrome');
    expect(driver.isConnected()).toBe(false);
    expect(driver.getSessionInfo()).toEqual({
      browser: 'chrome',
      mode: 'none',
      connected: false
    });
    await driver.destroy();
  });

  it.each(['firefox', 'safari', 'webkit'] as const)(
    'rejects %s with its tracking issue',
    (kind) => {
      expect(() => createDriver(kind, loadConfig(), session())).toThrow(
        UnsupportedBrowserError
      );
      expect(() => createDriver(kind, loadConfig(), session())).toThrow(
        `Pilot does not support ${kind} yet; only chrome is available. Progress is tracked in ${PLANNED_DRIVERS[kind]}.`
      );
    }
  );

  it('points every planned browser at a GitHub issue', () => {
    for (const url of Object.values(PLANNED_DRIVERS)) {
      expect(url).toMatch(
        /^https:\/\/github\.com\/everydaydevopsio\/pilot\/issues\/\d+$/
      );
    }
  });
});
