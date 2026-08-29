import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import type { BrowserManager } from '../../browser/browser-manager.js';
import { executeConnect, formatConnectResult } from '../../commands/connect.js';

const connectShape = {
  host: z
    .string()
    .default('127.0.0.1')
    .describe('Chrome debugging host (default: 127.0.0.1)'),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(9222)
    .describe('Chrome debugging port (default: 9222)')
};

export function registerConnectTools(
  server: McpServer,
  context: BrowserContext,
  makeBrowserManager: () => BrowserManager
): void {
  server.tool(
    'browser_connect',
    'Connect to an existing Chrome instance with remote debugging enabled. Start Chrome with --remote-debugging-port=PORT, then use this tool to connect. Lists available tabs after connecting. Use browser_switch_tab to select a specific tab.',
    connectShape,
    async ({ host, port }) => {
      if (context.manager?.isConnected()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Already connected to a browser. Call browser_stop to disconnect first.'
            }
          ]
        };
      }

      if (context.manager) {
        await context.manager.destroy();
        context.manager = null;
      }

      const manager = makeBrowserManager();
      try {
        const result = await executeConnect(manager, { host, port });
        context.manager = manager;
        return {
          content: [
            { type: 'text' as const, text: formatConnectResult(result) }
          ]
        };
      } catch (err) {
        await manager.destroy();
        throw err;
      }
    }
  );
}
