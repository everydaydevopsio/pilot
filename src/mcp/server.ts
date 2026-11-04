import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createDriver } from '../browser/driver/factory.js';
import type {
  BrowserDriver,
  BrowserKind,
  DriverSession
} from '../browser/driver/types.js';
import { ElementRefMap } from '../browser/inspect/element-ref.js';
import { DialogQueue } from '../browser/interaction/dialogs.js';
import { DownloadTracker } from '../browser/interaction/downloads.js';
import { NetworkBuffer } from '../browser/network/network-buffer.js';
import { loadConfig } from '../util/config.js';
import { ConsoleBuffer } from './console-buffer.js';
import { registerBrowserTools } from './tools/browser.js';
import { registerErrorTools } from './tools/errors.js';
import { registerSnapshotTools } from './tools/snapshot.js';
import { registerInteractionTools } from './tools/interaction.js';
import { registerNetworkTools } from './tools/network.js';
import { registerRuntimeTools } from './tools/runtime.js';
import { registerStylesTools } from './tools/styles.js';
import { registerFilesTools } from './tools/files.js';
import { createTraceState } from '../browser/performance/trace.js';
import { registerPerformanceTools } from './tools/performance.js';
import { registerConnectTools } from './tools/connect.js';
import { withCapabilityGate } from './tools/driver-context.js';

export interface McpConfig {
  bufferSize: number;
  cdpPort?: number;
  cdpHost?: string;
}

export interface BrowserContext extends DriverSession {
  driver: BrowserDriver | null;
  baseConfig: McpConfig;
}

/** Build a driver; without a kind, uses PILOT_BROWSER (default chrome). */
export type DriverFactory = (kind?: BrowserKind) => BrowserDriver;

/**
 * Register every Pilot tool behind the capability gate, so a tool the active
 * driver cannot support fails before its handler runs.
 */
export function registerAllTools(
  server: McpServer,
  context: BrowserContext,
  makeDriver: DriverFactory
): void {
  const gated = withCapabilityGate(server, () => context.driver);
  registerBrowserTools(gated, context, makeDriver);
  registerErrorTools(gated, context.consoleBuffer);
  registerSnapshotTools(gated, context);
  registerInteractionTools(gated, context);
  registerNetworkTools(gated, context);
  registerRuntimeTools(gated, context.consoleBuffer);
  registerStylesTools(gated, context);
  registerFilesTools(gated, context);
  registerPerformanceTools(gated, context);
  registerConnectTools(gated, context, makeDriver);
}

export async function createMcpServer(config: McpConfig): Promise<{
  server: McpServer;
  cleanup: () => Promise<void>;
}> {
  const server = new McpServer({
    name: 'pilot',
    version: '0.1.0'
  });

  const context: BrowserContext = {
    driver: null,
    consoleBuffer: new ConsoleBuffer(config.bufferSize),
    elementRefMap: new ElementRefMap(),
    networkBuffer: new NetworkBuffer(),
    dialogQueue: new DialogQueue(),
    downloadTracker: new DownloadTracker(),
    traceState: createTraceState(),
    baseConfig: config
  };

  const makeDriver: DriverFactory = (kind) => {
    const driverConfig = loadConfig({
      cdpPort: config.cdpPort,
      cdpHost: config.cdpHost
    });
    return createDriver(kind ?? driverConfig.browser, driverConfig, context);
  };

  registerAllTools(server, context, makeDriver);

  return {
    server,
    cleanup: async () => {
      if (context.driver) {
        await context.driver.destroy();
        context.driver = null;
      }
    }
  };
}
