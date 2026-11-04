import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  TOOL_CAPABILITIES,
  assertToolSupported
} from '../../browser/driver/capabilities.js';
import type { BrowserDriver } from '../../browser/driver/types.js';
import type { ToolName } from './names.js';

/** Return the connected driver or fail with the standard "not started" error. */
export function requireDriver(context: {
  driver: BrowserDriver | null;
}): BrowserDriver {
  const driver = context.driver;
  if (!driver || !driver.isConnected()) {
    throw new Error('Browser not started. Call browser_start first.');
  }
  return driver;
}

function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_CAPABILITIES, name);
}

/**
 * Wrap an McpServer so every registered tool first checks that the active
 * driver (if any) has the capabilities the tool declares in TOOL_CAPABILITIES.
 * Registering a tool without a capability declaration throws, so new tools
 * cannot skip the check.
 */
export function withCapabilityGate(
  server: McpServer,
  getDriver: () => BrowserDriver | null
): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== 'tool') return Reflect.get(target, prop, receiver);
      return (name: string, ...rest: unknown[]) => {
        if (!isToolName(name)) {
          throw new Error(
            `Tool ${name} has no entry in TOOL_CAPABILITIES; declare the driver capabilities it needs.`
          );
        }
        const last = rest.length - 1;
        const handler = rest[last];
        if (typeof handler === 'function') {
          rest[last] = async (...args: unknown[]) => {
            const driver = getDriver();
            if (driver) assertToolSupported(name, driver);
            return handler(...args);
          };
        }
        return (target.tool as (...a: unknown[]) => unknown)(name, ...rest);
      };
    }
  });
}
