import type { Client } from 'chrome-remote-interface';

export interface PendingDialog {
  type: string;
  message: string;
  defaultPrompt?: string;
  timestamp: number;
}

export class DialogQueue {
  private pending: PendingDialog[] = [];

  push(dialog: PendingDialog): void {
    this.pending.push(dialog);
  }

  list(): PendingDialog[] {
    return [...this.pending];
  }

  shift(): PendingDialog | undefined {
    return this.pending.shift();
  }

  size(): number {
    return this.pending.length;
  }

  clear(): void {
    this.pending = [];
  }
}

export function attachDialogHandler(client: Client, queue: DialogQueue): void {
  client.Page.javascriptDialogOpening((params) => {
    queue.push({
      type: params.type,
      message: params.message,
      defaultPrompt: params.defaultPrompt || undefined,
      timestamp: Date.now()
    });
  });
}

export async function handleDialog(
  client: Client,
  accept: boolean,
  promptText?: string
): Promise<void> {
  await client.Page.handleJavaScriptDialog({
    accept,
    promptText
  });
}
