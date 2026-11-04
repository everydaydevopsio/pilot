import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { requireDriver } from './driver-context.js';

const findShape = {
  role: z
    .string()
    .optional()
    .describe(
      'Filter by ARIA role (e.g. button, link, textbox, checkbox, radio, heading)'
    ),
  name: z
    .string()
    .optional()
    .describe('Filter by accessible name (substring, case-insensitive)'),
  text: z
    .string()
    .optional()
    .describe(
      'Filter by text content — matches name, value, or description (substring, case-insensitive)'
    )
};

export function registerSnapshotTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_snapshot',
    'Capture a structured accessibility snapshot of the current page. Returns interactive and meaningful elements with short refs (e1, e2, ...) that can be used with browser_click and other interaction tools instead of CSS selectors.',
    {},
    async () => {
      const result = await requireDriver(context).snapshot();
      return {
        content: [{ type: 'text' as const, text: result.text }]
      };
    }
  );

  server.tool(
    'browser_find',
    'Find elements in the current page matching a query. Takes a new snapshot and filters by role, name, or text. Returns matching elements with refs.',
    findShape,
    async ({ role, name, text }) => {
      const result = await requireDriver(context).find({ role, name, text });
      return {
        content: [{ type: 'text' as const, text: result.text }]
      };
    }
  );
}
