import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BrowserManager } from '../browser.js';
import { loadConfig } from '../util/config.js';
import { ConsoleBuffer, type ConsoleMessage } from './console-buffer.js';
import { registerBrowserTools } from './tools/browser.js';
import { registerErrorTools } from './tools/errors.js';

export interface McpConfig {
  bufferSize: number;
  cdpPort?: number;
  cdpHost?: string;
}

export interface BrowserContext {
  manager: BrowserManager | null;
  consoleBuffer: ConsoleBuffer;
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

  const context: BrowserContext = {
    manager: null,
    consoleBuffer,
    baseConfig: config
  };

  function attachConsoleBuffer(manager: BrowserManager): void {
    manager.setEventCallback((event, data) => {
      if (event === 'console_message') {
        consoleBuffer.push(data as ConsoleMessage);
      }
    });
  }

  function makeBrowserManager(): BrowserManager {
    const browserConfig = loadConfig({
      cdpPort: config.cdpPort,
      cdpHost: config.cdpHost
    });
    const manager = new BrowserManager(browserConfig);
    attachConsoleBuffer(manager);
    return manager;
  }

  registerBrowserTools(server, context, makeBrowserManager);
  registerErrorTools(server, consoleBuffer);

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
