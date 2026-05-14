import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Client } from 'chrome-remote-interface';
import type { BrowserManager } from '../../browser.js';
import type { BrowserContext } from '../server.js';
import { executeScreenshot } from '../../commands/screenshot.js';
import { executeNavigate } from '../../commands/navigate.js';
import { executeClick } from '../../commands/click.js';
import { executeType } from '../../commands/type.js';
import { executeEvaluate } from '../../commands/evaluate.js';
import { executeWait } from '../../commands/wait.js';
import { executePageInfo } from '../../commands/page_info.js';
import {
  executeListTabs,
  executeNewTab,
  executeCloseTab,
  executeSwitchTab
} from '../../commands/tabs.js';

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

const startShape = {
  headless: z
    .boolean()
    .default(true)
    .describe('Run Chrome headless (default: true)'),
  chromePath: z
    .string()
    .optional()
    .describe('Path to Chrome executable (auto-detected if omitted)'),
  profileName: z
    .string()
    .optional()
    .describe(
      'Browser profile name. Data is stored under $XDG_DATA_HOME/aab/<profileName>/ (default: ~/.local/share/aab/<profileName>/). Defaults to AAB_PROFILE_NAME env var or "profile1".'
    )
};

const newTabShape = {
  url: z
    .string()
    .optional()
    .describe('URL to open in the new tab (opens blank tab if omitted)')
};

const closeTabShape = {
  targetId: z.string().describe('Target ID of the tab to close')
};

const switchTabShape = {
  targetId: z.string().describe('Target ID of the tab to switch to')
};

function requireClient(context: BrowserContext): {
  client: Client;
  manager: BrowserManager;
} {
  const manager = context.manager;
  if (!manager || !manager.isConnected()) {
    throw new Error('Browser not started. Call browser_start first.');
  }
  const client = manager.getClient()!;
  return { client, manager };
}

export function registerBrowserTools(
  server: McpServer,
  context: BrowserContext,
  makeBrowserManager: () => BrowserManager
): void {
  server.tool(
    'browser_start',
    'Launch the Chrome browser. Call this before using any other browser tools.',
    startShape,
    async ({ headless, chromePath, profileName }) => {
      if (context.manager?.isConnected()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Browser is already running.'
            }
          ]
        };
      }

      if (context.manager) {
        await context.manager.destroy();
        context.manager = null;
      }

      const manager = makeBrowserManager();
      await manager.launch({ headless, chromePath, profileName });
      context.manager = manager;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Browser started${headless ? ' (headless)' : ' (visible)'}.`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_stop',
    'Stop the Chrome browser and free all resources.',
    {},
    async () => {
      if (!context.manager) {
        return {
          content: [{ type: 'text' as const, text: 'Browser is not running.' }]
        };
      }

      await context.manager.destroy();
      context.manager = null;

      return {
        content: [{ type: 'text' as const, text: 'Browser stopped.' }]
      };
    }
  );

  server.tool(
    'browser_screenshot',
    'Capture a screenshot of the current browser viewport or full page',
    screenshotShape,
    async ({ format, quality, fullPage }) => {
      const { client } = requireClient(context);
      const result = await executeScreenshot(client, {
        format,
        quality,
        fullPage
      });

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
      const { client, manager } = requireClient(context);
      const result = await executeNavigate(client, manager, {
        url,
        waitUntil,
        timeoutMs
      });

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

      const { client } = requireClient(context);
      const result = await executeClick(client, params);

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
      const { client } = requireClient(context);
      await executeType(client, params);

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
      const { client } = requireClient(context);
      const result = await executeEvaluate(client, {
        expression,
        awaitPromise,
        timeoutMs
      });

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

      const { client, manager } = requireClient(context);
      const result = await executeWait(client, manager, params);

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
      const { client } = requireClient(context);
      const result = await executePageInfo(client);

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

  server.tool(
    'browser_list_tabs',
    'List all open browser tabs with their target IDs, URLs, titles, and active status',
    {},
    async () => {
      const { manager } = requireClient(context);
      const tabs = await executeListTabs(manager);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(tabs, null, 2)
          }
        ]
      };
    }
  );

  server.tool(
    'browser_new_tab',
    'Open a new browser tab, optionally navigating to a URL',
    newTabShape,
    async ({ url }) => {
      const { manager } = requireClient(context);
      const result = await executeNewTab(manager, url);

      return {
        content: [
          {
            type: 'text' as const,
            text: `New tab opened (targetId: ${result.targetId}, url: ${result.url})`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_close_tab',
    'Close a browser tab by its target ID. Cannot close the currently active tab.',
    closeTabShape,
    async ({ targetId }) => {
      const { manager } = requireClient(context);
      await executeCloseTab(manager, targetId);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Tab ${targetId} closed.`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_switch_tab',
    'Switch the active browser tab to the one with the given target ID. All subsequent commands will target this tab.',
    switchTabShape,
    async ({ targetId }) => {
      const { manager } = requireClient(context);
      await executeSwitchTab(manager, targetId);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Switched to tab ${targetId}.`
          }
        ]
      };
    }
  );
}
