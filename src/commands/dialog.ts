import type { Client } from 'chrome-remote-interface';
import type { DialogQueue } from '../browser/interaction/dialogs.js';
import { handleDialog } from '../browser/interaction/dialogs.js';

export type DialogAction = 'list' | 'accept' | 'dismiss';

export interface DialogParams {
  action: DialogAction;
  promptText?: string;
}

export interface DialogResult {
  action: DialogAction;
  dialogs?: Array<{
    type: string;
    message: string;
    defaultPrompt?: string;
  }>;
  handled?: boolean;
}

export async function executeDialog(
  client: Client,
  queue: DialogQueue,
  params: DialogParams
): Promise<DialogResult> {
  switch (params.action) {
    case 'list': {
      const pending = queue.list();
      return {
        action: 'list',
        dialogs: pending.map((d) => ({
          type: d.type,
          message: d.message,
          defaultPrompt: d.defaultPrompt
        }))
      };
    }

    case 'accept': {
      const dialog = queue.shift();
      if (!dialog) {
        return { action: 'accept', handled: false };
      }
      await handleDialog(client, true, params.promptText);
      return { action: 'accept', handled: true };
    }

    case 'dismiss': {
      const dialog = queue.shift();
      if (!dialog) {
        return { action: 'dismiss', handled: false };
      }
      await handleDialog(client, false);
      return { action: 'dismiss', handled: true };
    }
  }
}

export function formatDialogResult(result: DialogResult): string {
  if (result.action === 'list') {
    const dialogs = result.dialogs ?? [];
    if (dialogs.length === 0) {
      return 'No pending dialogs.';
    }
    const lines = [`Pending dialogs (${dialogs.length}):`];
    for (const d of dialogs) {
      const prompt =
        d.defaultPrompt !== undefined ? ` (default: "${d.defaultPrompt}")` : '';
      lines.push(`  [${d.type}] ${d.message}${prompt}`);
    }
    return lines.join('\n');
  }

  if (result.handled) {
    return `Dialog ${result.action}ed.`;
  }
  return 'No pending dialog to handle.';
}
