import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ConsoleBuffer, ConsoleLevel } from '../console-buffer.js';

// Raw shapes for MCP SDK (expects ZodRawShape, not ZodObject)

const getConsoleLogsShape = {
  level: z
    .enum(['log', 'warn', 'error', 'info', 'debug'])
    .optional()
    .describe('Filter by single log level'),
  levels: z
    .array(z.enum(['log', 'warn', 'error', 'info', 'debug']))
    .optional()
    .describe('Filter by multiple log levels'),
  sinceMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Only messages from the last N milliseconds'),
  limit: z
    .number()
    .int()
    .positive()
    .default(100)
    .describe('Maximum messages to return')
};

const getErrorsShape = {
  sinceMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Only errors from the last N milliseconds'),
  limit: z
    .number()
    .int()
    .positive()
    .default(50)
    .describe('Maximum errors to return'),
  includeWarnings: z
    .boolean()
    .default(false)
    .describe('Include warnings in addition to errors')
};

export function registerErrorTools(
  server: McpServer,
  buffer: ConsoleBuffer
): void {
  server.tool(
    'browser_get_console_logs',
    'Get console log messages from the browser. Use this to see console output during testing.',
    getConsoleLogsShape,
    async ({ level, levels, sinceMs, limit }) => {
      let filterLevels: ConsoleLevel | ConsoleLevel[] | undefined;

      if (levels && levels.length > 0) {
        filterLevels = levels as ConsoleLevel[];
      } else if (level) {
        filterLevels = level as ConsoleLevel;
      }

      const messages = buffer.getAll({
        level: filterLevels,
        sinceMs,
        limit
      });

      const total = buffer.size();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                messages,
                count: messages.length,
                total,
                hasMore: total > messages.length
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    'browser_get_errors',
    'Get console errors (and optionally warnings) from the browser. Use this to check for JavaScript errors while testing an application.',
    getErrorsShape,
    async ({ sinceMs, limit, includeWarnings }) => {
      const levels: ConsoleLevel[] = includeWarnings
        ? ['error', 'warn']
        : ['error'];

      const errors = buffer.getAll({
        level: levels,
        sinceMs,
        limit
      });

      const total = buffer.size();

      if (errors.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No errors found.'
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                errors,
                count: errors.length,
                hasMore: total > errors.length
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.tool(
    'browser_clear_errors',
    'Clear the console message buffer. Use this before testing to get a clean slate.',
    {},
    async () => {
      const cleared = buffer.clear();

      return {
        content: [
          {
            type: 'text' as const,
            text: `Cleared ${cleared} console messages.`
          }
        ]
      };
    }
  );
}
