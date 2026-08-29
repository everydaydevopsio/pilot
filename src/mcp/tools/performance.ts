import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { executePerformance } from '../../commands/performance.js';

const performanceShape = {
  action: z
    .enum(['start', 'stop', 'analyze'])
    .describe(
      'Action: "start" begins tracing, "stop" ends collection, "analyze" returns a summary of navigation timing, long tasks, slow requests, and large resources'
    )
};

function requireContext(context: BrowserContext) {
  const manager = context.manager;
  if (!manager || !manager.isConnected()) {
    throw new Error('Browser not started. Call browser_start first.');
  }
  return { client: manager.getClient()! };
}

export function registerPerformanceTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_performance',
    'Inspect page performance. Actions: "start" begins tracing (call before navigating), "stop" ends collection, "analyze" returns an agent-friendly summary with navigation timing, long tasks, slow requests, large resources, and JS execution time.',
    performanceShape,
    async ({ action }) => {
      const { client } = requireContext(context);
      const result = await executePerformance(client, context.traceState, {
        action
      });
      return {
        content: [{ type: 'text' as const, text: result.text }]
      };
    }
  );
}
