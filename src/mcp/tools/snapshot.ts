import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { executeSnapshot } from '../../commands/snapshot.js';
import { executeFind } from '../../commands/find.js';

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

function requireContext(context: BrowserContext) {
  const manager = context.manager;
  if (!manager || !manager.isConnected()) {
    throw new Error('Browser not started. Call browser_start first.');
  }
  const client = manager.getClient()!;
  if (!context.elementRefMap) {
    throw new Error('Element ref map not initialized.');
  }
  return { client, refMap: context.elementRefMap };
}

export function registerSnapshotTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_snapshot',
    'Capture a structured accessibility snapshot of the current page. Returns interactive and meaningful elements with short refs (e1, e2, ...) that can be used with browser_click, browser_fill, and other interaction tools instead of CSS selectors.',
    {},
    async () => {
      const { client, refMap } = requireContext(context);
      const result = await executeSnapshot(client, refMap);
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
      const { client, refMap } = requireContext(context);
      const result = await executeFind(client, refMap, { role, name, text });
      return {
        content: [{ type: 'text' as const, text: result.text }]
      };
    }
  );
}
