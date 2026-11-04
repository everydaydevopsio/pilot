import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { requireDriver } from './driver-context.js';

const stylesShape = {
  ref: z.string().describe('Element ref from browser_snapshot (e.g. "e3")'),
  properties: z
    .array(z.string())
    .optional()
    .describe(
      'CSS properties to return (e.g. ["display", "color"]). Omit for a default diagnostic set covering layout, visibility, and common properties.'
    )
};

export function registerStylesTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_styles',
    'Inspect computed styles, matched CSS rules, and box model for an element by ref. Helps diagnose visibility issues (display:none, opacity:0), layout problems (margins, positioning, overflow), and identify which CSS rule is responsible for a property. Use browser_snapshot first to get refs.',
    stylesShape,
    async ({ ref, properties }) => {
      const result = await requireDriver(context).styles({ ref, properties });
      return {
        content: [{ type: 'text' as const, text: result.text }]
      };
    }
  );
}
