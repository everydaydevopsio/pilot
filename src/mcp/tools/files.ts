import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { BrowserContext } from '../server.js';
import { formatDialogResult } from '../../commands/dialog.js';
import { requireDriver } from './driver-context.js';
import {
  executeDownloads,
  formatDownloadsResult
} from '../../commands/downloads.js';

const dialogShape = {
  action: z
    .enum(['list', 'accept', 'dismiss'])
    .describe(
      'Action: list pending dialogs, accept (OK/Yes), or dismiss (Cancel/No)'
    ),
  promptText: z
    .string()
    .optional()
    .describe('Text to enter for prompt dialogs (accept action only)')
};

const uploadShape = {
  ref: z
    .string()
    .describe('Element ref of a file input (from browser_snapshot)'),
  files: z
    .array(z.string())
    .describe(
      'File paths to upload. Must exist, be regular files, and be under PILOT_UPLOAD_ROOTS (default: cwd).'
    )
};

const downloadsShape = {
  action: z
    .enum(['list', 'wait', 'clear'])
    .describe(
      'Action: list tracked downloads, wait for one to complete, or clear'
    ),
  guid: z
    .string()
    .optional()
    .describe('Download GUID (required for wait action)'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Timeout for wait action in milliseconds (default: 30000)')
};

export function registerFilesTools(
  server: McpServer,
  context: BrowserContext
): void {
  server.tool(
    'browser_dialog',
    'Handle browser dialogs (alert, confirm, prompt). Use "list" to see pending dialogs, "accept" to click OK/Yes, or "dismiss" to click Cancel/No. For prompt dialogs, provide promptText with accept.',
    dialogShape,
    async ({ action, promptText }) => {
      const result = await requireDriver(context).dialog({
        action,
        promptText
      });
      return {
        content: [{ type: 'text' as const, text: formatDialogResult(result) }]
      };
    }
  );

  server.tool(
    'browser_upload',
    'Upload files to a file input element by ref. Files must exist, be regular files, and be under allowed roots (PILOT_UPLOAD_ROOTS env, default: cwd). Use browser_snapshot to find file input refs.',
    uploadShape,
    async ({ ref, files }) => {
      const result = await requireDriver(context).upload({
        ref,
        files
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: `Uploaded ${result.files.length} file(s) to ${result.ref}`
          }
        ]
      };
    }
  );

  server.tool(
    'browser_downloads',
    'Track file downloads. Actions: "list" shows tracked downloads with status/progress; "wait" blocks until a download (by GUID) completes; "clear" resets the tracker.',
    downloadsShape,
    async ({ action, guid, timeoutMs }) => {
      requireDriver(context);
      const result = await executeDownloads(context.downloadTracker, {
        action,
        guid,
        timeoutMs
      });
      return {
        content: [
          { type: 'text' as const, text: formatDownloadsResult(result) }
        ]
      };
    }
  );
}
