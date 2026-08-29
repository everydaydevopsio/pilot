import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import {
  executeNetwork,
  formatNetworkList,
  formatNetworkDetail
} from '../../commands/network.js';

const networkShape = {
  action: z
    .enum(['list', 'get', 'clear'])
    .describe('Action: list requests, get request detail, or clear buffer'),
  requestId: z
    .string()
    .optional()
    .describe('Request ID (required for "get" action)'),
  url: z.string().optional().describe('Filter by URL substring (list only)'),
  method: z
    .string()
    .optional()
    .describe('Filter by HTTP method, e.g. GET, POST (list only)'),
  statusMin: z
    .number()
    .int()
    .optional()
    .describe('Filter by minimum status code (list only)'),
  statusMax: z
    .number()
    .int()
    .optional()
    .describe('Filter by maximum status code (list only)'),
  resourceType: z
    .string()
    .optional()
    .describe(
      'Filter by resource type: Document, Stylesheet, Script, Image, XHR, Fetch, etc. (list only)'
    ),
  failed: z
    .boolean()
    .optional()
    .describe('Filter to only failed requests (list only)'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of results (list only)')
};

function requireContext(context: BrowserContext) {
  const manager = context.manager;
  if (!manager || !manager.isConnected()) {
    throw new Error('Browser not started. Call browser_start first.');
  }
  const client = manager.getClient()!;
  return { client, networkBuffer: context.networkBuffer };
}

export function registerNetworkTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_network',
    'Inspect captured network requests. Actions: "list" shows request summaries with filters (url, method, status, resourceType, failed); "get" returns full detail for a request ID including headers and response body; "clear" resets the buffer.',
    networkShape,
    async (params) => {
      const { client, networkBuffer } = requireContext(context);
      const result = await executeNetwork(client, networkBuffer, params);

      let text: string;
      if (result.action === 'list') {
        text = formatNetworkList(result);
      } else if (result.action === 'get') {
        text = formatNetworkDetail(result);
      } else {
        text = `Cleared ${result.cleared} network records.`;
      }

      return {
        content: [{ type: 'text' as const, text }]
      };
    }
  );
}
