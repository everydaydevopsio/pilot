import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { requireDriver } from './driver-context.js';

const performanceShape = {
  action: z
    .enum(['start', 'stop', 'analyze'])
    .describe(
      'Action: "start" begins tracing, "stop" ends collection, "analyze" returns a summary of navigation timing, long tasks, slow requests, and large resources'
    )
};

export function registerPerformanceTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_performance',
    'Inspect page performance. Actions: "start" begins tracing (call before navigating), "stop" ends collection, "analyze" returns an agent-friendly summary with navigation timing, long tasks, slow requests, large resources, and JS execution time.',
    performanceShape,
    async ({ action }) => {
      const result = await requireDriver(context).performance({ action });
      return {
        content: [{ type: 'text' as const, text: result.text }]
      };
    }
  );
}
