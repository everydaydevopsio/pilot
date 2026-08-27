import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { executeFill } from '../../commands/fill.js';
import { executeHover } from '../../commands/hover.js';
import { executePressKey } from '../../commands/press_key.js';
import { executeSelect } from '../../commands/select.js';
import { executeCheck } from '../../commands/check.js';
import { executeScroll } from '../../commands/scroll.js';

function requireContext(context: BrowserContext) {
  const manager = context.manager;
  if (!manager || !manager.isConnected()) {
    throw new Error('Browser not started. Call browser_start first.');
  }
  const client = manager.getClient()!;
  return { client, refMap: context.elementRefMap };
}

const fillShape = {
  ref: z.string().describe('Element ref from browser_snapshot (e.g. "e3")'),
  value: z.string().describe('Value to set in the field')
};

const hoverShape = {
  ref: z
    .string()
    .optional()
    .describe('Element ref from browser_snapshot (e.g. "e3")'),
  x: z.number().optional().describe('Viewport X coordinate'),
  y: z.number().optional().describe('Viewport Y coordinate')
};

const pressKeyShape = {
  key: z
    .string()
    .describe(
      'Key to press. Named keys: Enter, Tab, Escape, Backspace, Delete, Space, ArrowUp/Down/Left/Right, Home, End, PageUp/Down, F1-F12. Modifier combos: Control+a, Meta+c, Shift+Enter.'
    )
};

const selectShape = {
  ref: z.string().describe('Element ref of a <select> element'),
  value: z.string().optional().describe('Option value attribute to select'),
  label: z.string().optional().describe('Option visible text to select'),
  index: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Option index to select (0-based)')
};

const checkShape = {
  ref: z.string().describe('Element ref of a checkbox or radio button'),
  checked: z.boolean().optional().describe('Desired state. Omit to toggle.')
};

const scrollShape = {
  ref: z.string().optional().describe('Element ref to scroll into view'),
  direction: z
    .enum(['up', 'down', 'left', 'right'])
    .optional()
    .describe('Scroll direction'),
  amount: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Scroll amount in pixels (default: 300)'),
  x: z.number().optional().describe('Absolute scroll X position'),
  y: z.number().optional().describe('Absolute scroll Y position')
};

export function registerInteractionTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_fill',
    'Fill a form field by element ref. Replaces the entire field value and fires input/change events compatible with React, Vue, and Svelte. Use browser_snapshot first to get refs.',
    fillShape,
    async ({ ref, value }) => {
      const { client, refMap } = requireContext(context);
      const result = await executeFill(client, refMap, { ref, value });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Filled ${result.ref} with "${result.value}"`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_hover',
    'Hover over an element by ref or coordinates. Dispatches a mouseMoved event.',
    hoverShape,
    async (params) => {
      if (
        params.ref === undefined &&
        (params.x === undefined || params.y === undefined)
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Either ref or x/y coordinates are required'
            }
          ],
          isError: true
        };
      }
      const { client, refMap } = requireContext(context);
      const result = await executeHover(client, refMap, params);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Hovered at (${result.x}, ${result.y})`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_press_key',
    'Press a key or key combination. Supports named keys (Enter, Tab, Escape, etc.) and modifier combos (Control+a, Meta+c, Shift+Enter).',
    pressKeyShape,
    async ({ key }) => {
      const { client } = requireContext(context);
      const result = await executePressKey(client, { key });
      const modStr =
        result.modifiers.length > 0
          ? ` with modifiers: ${result.modifiers.join('+')}`
          : '';
      return {
        content: [
          { type: 'text' as const, text: `Pressed ${result.key}${modStr}` }
        ]
      };
    }
  );

  server.tool(
    'browser_select',
    'Select an option in a <select> element by value, label, or index. Use browser_snapshot to get the ref.',
    selectShape,
    async (params) => {
      if (
        params.value === undefined &&
        params.label === undefined &&
        params.index === undefined
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: One of value, label, or index is required'
            }
          ],
          isError: true
        };
      }
      const { client, refMap } = requireContext(context);
      const result = await executeSelect(client, refMap, params);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Selected "${result.selectedLabel}" (value="${result.selectedValue}") in ${result.ref}`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_check',
    'Toggle a checkbox or radio button by ref. Optionally set to a specific checked state.',
    checkShape,
    async ({ ref, checked }) => {
      const { client, refMap } = requireContext(context);
      const result = await executeCheck(client, refMap, { ref, checked });
      return {
        content: [
          {
            type: 'text' as const,
            text: `${result.ref} is now ${result.checked ? 'checked' : 'unchecked'}`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_scroll',
    'Scroll the page or an element. Use ref to scroll an element into view, direction/amount for relative scrolling, or x/y for absolute scroll position.',
    scrollShape,
    async (params) => {
      if (
        params.ref === undefined &&
        params.direction === undefined &&
        params.x === undefined &&
        params.y === undefined
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: At least one of ref, direction, or x/y is required'
            }
          ],
          isError: true
        };
      }
      const { client, refMap } = requireContext(context);
      const result = await executeScroll(client, refMap, params);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Scrolled to (${result.scrollX}, ${result.scrollY})`
          }
        ]
      };
    }
  );
}
