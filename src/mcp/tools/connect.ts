import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext, DriverFactory } from '../server.js';
import { executeConnect, formatConnectResult } from '../../commands/connect.js';
import { BROWSER_KINDS } from '../../browser/driver/types.js';

const connectShape = {
  browser: z
    .enum(BROWSER_KINDS)
    .optional()
    .describe(
      'Browser to connect to: chrome (CDP) or firefox (WebDriver BiDi). Defaults to PILOT_BROWSER or "chrome".'
    ),
  host: z
    .string()
    .default('127.0.0.1')
    .describe('Debugging host (default: 127.0.0.1)'),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(9222)
    .describe(
      'Debugging port: the --remote-debugging-port the browser was started with (default: 9222)'
    )
};

export function registerConnectTools(
  server: McpServer,
  context: BrowserContext,
  makeDriver: DriverFactory
): void {
  server.tool(
    'browser_connect',
    'Connect to an existing Chrome or Firefox with remote debugging enabled. Start the browser with --remote-debugging-port=PORT, then use this tool to connect (pass browser: "firefox" for Firefox, which serves WebDriver BiDi on that port). Lists available tabs after connecting. Use browser_switch_tab to select a specific tab.',
    connectShape,
    async ({ browser, host, port }) => {
      if (context.driver?.isConnected()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Already connected to a browser. Call browser_stop to disconnect first.'
            }
          ]
        };
      }

      if (context.driver) {
        await context.driver.destroy();
        context.driver = null;
      }

      const driver = makeDriver(browser);
      try {
        const result = await executeConnect(driver, { host, port });
        context.driver = driver;
        return {
          content: [
            { type: 'text' as const, text: formatConnectResult(result) }
          ]
        };
      } catch (err) {
        await driver.destroy();
        throw err;
      }
    }
  );
}
