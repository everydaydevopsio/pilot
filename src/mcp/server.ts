import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser.js';
import { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resetCssState } from '../browser/inspect/styles.js';
import { DialogQueue } from '../browser/interaction/dialogs.js';
import { attachDialogHandler } from '../browser/interaction/dialogs.js';
import {
  DownloadTracker,
  enableDownloads,
  attachDownloadHandler
} from '../browser/interaction/downloads.js';
import { NetworkBuffer } from '../browser/network/network-buffer.js';
import { attachNetworkMonitor } from '../browser/network/network-monitor.js';
import { loadConfig } from '../util/config.js';
import { ConsoleBuffer, type ConsoleMessage } from './console-buffer.js';
import { registerBrowserTools } from './tools/browser.js';
import { registerErrorTools } from './tools/errors.js';
import { registerSnapshotTools } from './tools/snapshot.js';
import { registerInteractionTools } from './tools/interaction.js';
import { registerNetworkTools } from './tools/network.js';
import { registerRuntimeTools } from './tools/runtime.js';
import { registerStylesTools } from './tools/styles.js';
import { registerFilesTools } from './tools/files.js';

export interface McpConfig {
  bufferSize: number;
  cdpPort?: number;
  cdpHost?: string;
}

export interface BrowserContext {
  manager: BrowserManager | null;
  consoleBuffer: ConsoleBuffer;
  elementRefMap: ElementRefMap;
  networkBuffer: NetworkBuffer;
  dialogQueue: DialogQueue;
  downloadTracker: DownloadTracker;
  baseConfig: McpConfig;
}

export async function createMcpServer(config: McpConfig): Promise<{
  server: McpServer;
  cleanup: () => Promise<void>;
}> {
  const server = new McpServer({
    name: 'pilot',
    version: '0.1.0'
  });

  const consoleBuffer = new ConsoleBuffer(config.bufferSize);
  const elementRefMap = new ElementRefMap();
  const networkBuffer = new NetworkBuffer();
  const dialogQueue = new DialogQueue();
  const downloadTracker = new DownloadTracker();

  const context: BrowserContext = {
    manager: null,
    consoleBuffer,
    elementRefMap,
    networkBuffer,
    dialogQueue,
    downloadTracker,
    baseConfig: config
  };

  function attachEventHandlers(manager: BrowserManager): void {
    let monitoredClient: unknown = null;

    function ensureMonitors(): void {
      const client = manager.getClient();
      if (client && client !== monitoredClient) {
        attachNetworkMonitor(client, networkBuffer);
        attachDialogHandler(client, dialogQueue);
        attachDownloadHandler(client, downloadTracker);
        void enableDownloads(client).catch(() => {
          // Download behavior setup may fail in some environments
        });
        monitoredClient = client;
      }
    }

    manager.setEventCallback((event, data) => {
      if (event === 'console_message') {
        consoleBuffer.push(data as ConsoleMessage);
      }
      if (event === 'page_navigated') {
        elementRefMap.invalidate();
      }
      if (event === 'browser_connected') {
        ensureMonitors();
      }
      if (event === 'browser_disconnected') {
        monitoredClient = null;
        resetCssState();
      }
      // Reattach after tab switch (new client, no connect event)
      ensureMonitors();
    });
  }

  function makeBrowserManager(): BrowserManager {
    const browserConfig = loadConfig({
      cdpPort: config.cdpPort,
      cdpHost: config.cdpHost
    });
    const manager = new BrowserManager(browserConfig);
    attachEventHandlers(manager);
    return manager;
  }

  registerBrowserTools(server, context, makeBrowserManager);
  registerErrorTools(server, consoleBuffer);
  registerSnapshotTools(server, context);
  registerInteractionTools(server, context);
  registerNetworkTools(server, context);
  registerRuntimeTools(server, consoleBuffer);
  registerStylesTools(server, context);
  registerFilesTools(server, context);

  return {
    server,
    cleanup: async () => {
      if (context.manager) {
        await context.manager.destroy();
        context.manager = null;
      }
    }
  };
}
