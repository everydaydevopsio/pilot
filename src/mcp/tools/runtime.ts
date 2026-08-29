import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ConsoleBuffer,
  ConsoleLevel,
  ConsoleMessage
} from '../console-buffer.js';

const consoleShape = {
  action: z
    .enum(['list', 'clear'])
    .default('list')
    .describe('Action: list messages or clear the buffer'),
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

const errorsShape = {
  action: z
    .enum(['list', 'clear'])
    .default('list')
    .describe('Action: list errors or clear the buffer'),
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

function formatMessage(msg: ConsoleMessage): string {
  const parts = [`[${msg.level.toUpperCase()}] ${msg.text}`];
  if (msg.url) {
    parts.push(
      `  at ${msg.url}:${msg.lineNumber}${msg.columnNumber !== undefined ? `:${msg.columnNumber}` : ''}`
    );
  }
  if (msg.stackFrames && msg.stackFrames.length > 0) {
    for (const frame of msg.stackFrames) {
      const fn = frame.functionName || '<anonymous>';
      parts.push(
        `    at ${fn} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`
      );
    }
  }
  return parts.join('\n');
}

export function registerRuntimeTools(
  server: McpServer,
  buffer: ConsoleBuffer
): void {
  server.tool(
    'browser_console',
    'Get or clear console messages. Actions: "list" returns messages with optional level/sinceMs/limit filters; "clear" resets the buffer. Messages include source location and stack traces for exceptions.',
    consoleShape,
    async ({ action, level, levels, sinceMs, limit }) => {
      if (action === 'clear') {
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

      let filterLevels: ConsoleLevel | ConsoleLevel[] | undefined;
      if (levels && levels.length > 0) {
        filterLevels = levels as ConsoleLevel[];
      } else if (level) {
        filterLevels = level as ConsoleLevel;
      }

      const messages = buffer.getAll({ level: filterLevels, sinceMs, limit });
      const total = buffer.size();

      if (messages.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No console messages.' }]
        };
      }

      const formatted = messages.map(formatMessage).join('\n\n');
      const header = `Console messages (${messages.length}${total > messages.length ? ` of ${total}` : ''}):\n`;

      return {
        content: [{ type: 'text' as const, text: header + formatted }]
      };
    }
  );

  server.tool(
    'browser_errors',
    'Get or clear runtime errors and exceptions. Actions: "list" returns errors with stack traces; "clear" resets the buffer. Captures both console.error calls and uncaught exceptions.',
    errorsShape,
    async ({ action, sinceMs, limit, includeWarnings }) => {
      if (action === 'clear') {
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

      const levels: ConsoleLevel[] = includeWarnings
        ? ['error', 'warn']
        : ['error'];

      const errors = buffer.getAll({ level: levels, sinceMs, limit });

      if (errors.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No errors found.' }]
        };
      }

      const formatted = errors.map(formatMessage).join('\n\n');
      const header = `Errors (${errors.length}):\n`;

      return {
        content: [{ type: 'text' as const, text: header + formatted }]
      };
    }
  );
}
