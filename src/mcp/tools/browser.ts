import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WSClient } from '../ws-client.js';

// Raw shapes for MCP SDK (expects ZodRawShape, not ZodObject)

const screenshotShape = {
  format: z
    .enum(['png', 'jpeg'])
    .default('png')
    .describe('Image format (png or jpeg)'),
  quality: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(80)
    .describe('JPEG quality (1-100, ignored for PNG)'),
  fullPage: z
    .boolean()
    .default(false)
    .describe('Capture full scrollable page instead of viewport')
};

const navigateShape = {
  url: z.string().url().describe('URL to navigate to'),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle'])
    .default('load')
    .describe('Wait condition: load, domcontentloaded, or networkidle'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(30000)
    .describe('Navigation timeout in milliseconds')
};

const clickShape = {
  selector: z.string().optional().describe('CSS selector to click'),
  x: z.number().optional().describe('Viewport X coordinate'),
  y: z.number().optional().describe('Viewport Y coordinate'),
  button: z
    .enum(['left', 'right', 'middle'])
    .default('left')
    .describe('Mouse button'),
  clickCount: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe('Number of clicks (2 for double-click)'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe('Timeout waiting for selector')
};

const typeShape = {
  text: z.string().describe('Text to type'),
  selector: z.string().optional().describe('CSS selector to focus first'),
  clearFirst: z
    .boolean()
    .default(false)
    .describe('Clear the field before typing'),
  delayMs: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Delay between keystrokes in milliseconds')
};

const evaluateShape = {
  expression: z.string().describe('JavaScript expression to evaluate'),
  awaitPromise: z
    .boolean()
    .default(true)
    .describe('Await if result is a Promise'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(10000)
    .describe('Evaluation timeout in milliseconds')
};

const waitShape = {
  selector: z.string().optional().describe('Wait for selector to exist'),
  selectorVisible: z
    .string()
    .optional()
    .describe('Wait for selector to be visible'),
  networkIdle: z.boolean().optional().describe('Wait for network to be idle'),
  ms: z.number().int().min(0).optional().describe('Fixed delay in ms'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(10000)
    .describe('Overall timeout')
};

interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

interface NavigateResult {
  url: string;
  status: number;
}

interface ClickResult {
  x: number;
  y: number;
}

interface EvaluateResult {
  value: unknown;
  type: string;
}

interface WaitResult {
  ok: boolean;
  elapsed: number;
}

interface PageInfoResult {
  url: string;
  title: string;
  readyState: string;
}

export function registerBrowserTools(
  server: McpServer,
  wsClient: WSClient
): void {
  server.tool(
    'browser_screenshot',
    'Capture a screenshot of the current browser viewport or full page',
    screenshotShape,
    async ({ format, quality, fullPage }) => {
      const result = await wsClient.send<ScreenshotResult>('screenshot', {
        format,
        quality,
        fullPage
      });

      // Extract base64 data from data URL
      const base64Match = result.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (base64Match) {
        return {
          content: [
            {
              type: 'image' as const,
              data: base64Match[1],
              mimeType: format === 'jpeg' ? 'image/jpeg' : 'image/png'
            }
          ]
        };
      }

      // Fallback to text response
      return {
        content: [
          {
            type: 'text' as const,
            text: `Screenshot captured: ${result.width}x${result.height}`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_navigate',
    'Navigate to a URL and wait for page load',
    navigateShape,
    async ({ url, waitUntil, timeoutMs }) => {
      const result = await wsClient.send<NavigateResult>(
        'navigate',
        { url, waitUntil, timeoutMs },
        timeoutMs + 5000
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Navigated to ${result.url} (status: ${result.status})`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_click',
    'Click an element by CSS selector or coordinates. Either selector or x/y coordinates required.',
    clickShape,
    async (params) => {
      // Validate: either selector or x/y required
      if (
        params.selector === undefined &&
        (params.x === undefined || params.y === undefined)
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Either selector or x/y coordinates are required'
            }
          ],
          isError: true
        };
      }

      const result = await wsClient.send<ClickResult>('click', params);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Clicked at (${result.x}, ${result.y})`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_type',
    'Type text into the focused element or a specified selector',
    typeShape,
    async (params) => {
      await wsClient.send('type', params);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Typed "${params.text}"${params.selector ? ` into ${params.selector}` : ''}`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the page context and return the result',
    evaluateShape,
    async ({ expression, awaitPromise, timeoutMs }) => {
      const result = await wsClient.send<EvaluateResult>(
        'evaluate',
        { expression, awaitPromise, timeoutMs },
        timeoutMs + 5000
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { value: result.value, type: result.type },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    'browser_wait',
    'Wait for a selector, network idle, or fixed delay. At least one wait condition required.',
    waitShape,
    async (params) => {
      // Validate: at least one condition required
      if (
        params.selector === undefined &&
        params.selectorVisible === undefined &&
        params.networkIdle === undefined &&
        params.ms === undefined
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: At least one wait condition is required'
            }
          ],
          isError: true
        };
      }

      const result = await wsClient.send<WaitResult>(
        'wait',
        params,
        (params.timeoutMs ?? 10000) + 5000
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Wait completed in ${result.elapsed}ms`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_page_info',
    'Get information about the current page (URL, title, ready state)',
    {},
    async () => {
      const result = await wsClient.send<PageInfoResult>('page_info', {});

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  );
}
