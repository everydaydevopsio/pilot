import type { WebSocket } from '@fastify/websocket';
import { z } from 'zod';
import { getLogger } from './util/logger.js';
import type { BrowserManager } from './browser.js';
import {
  ScreenshotParamsSchema,
  executeScreenshot
} from './commands/screenshot.js';
import { NavigateParamsSchema, executeNavigate } from './commands/navigate.js';
import { ClickParamsSchema, executeClick } from './commands/click.js';
import { TypeParamsSchema, executeType } from './commands/type.js';
import { EvaluateParamsSchema, executeEvaluate } from './commands/evaluate.js';
import { WaitParamsSchema, executeWait } from './commands/wait.js';
import { executePageInfo } from './commands/page_info.js';

const CommandSchema = z.object({
  id: z.string(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional()
});

export type CommandMessage = z.infer<typeof CommandSchema>;

export interface ResponseMessage {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface EventMessage {
  event: string;
  data: unknown;
}

export class Session {
  private readonly logger = getLogger();

  constructor(
    private readonly ws: WebSocket,
    private readonly browser: BrowserManager
  ) {
    this.browser.setEventCallback(this.onBrowserEvent.bind(this));
    ws.on('message', (raw) => this.onMessage(raw));
    ws.on('close', () => this.onClose());
    ws.on('error', (err) => this.logger.error({ err }, 'WS error'));
  }

  private onBrowserEvent(event: string, data: unknown): void {
    const msg: EventMessage = { event, data };
    this.sendRaw(JSON.stringify(msg));
  }

  private sendRaw(json: string): void {
    try {
      if (this.ws.readyState === 1 /* OPEN */) {
        this.ws.send(json);
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to send WS message');
    }
  }

  sendResponse(res: ResponseMessage): void {
    this.sendRaw(JSON.stringify(res));
  }

  private onClose(): void {
    this.logger.info('Agent WebSocket disconnected');
  }

  private async onMessage(raw: unknown): Promise<void> {
    let parsed: CommandMessage;

    try {
      const text = raw instanceof Buffer ? raw.toString('utf-8') : String(raw);
      const json: unknown = JSON.parse(text);
      parsed = CommandSchema.parse(json);
    } catch {
      this.ws.close(4400, 'invalid_json');
      return;
    }

    const { id, method, params = {} } = parsed;

    try {
      const result = await this.dispatch(method, params);
      this.sendResponse({ id, ok: true, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.sendResponse({ id, ok: false, error });
    }
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const client = this.browser.getClient();
    if (!client && method !== 'page_info') {
      throw new Error('browser_disconnected');
    }

    switch (method) {
      case 'screenshot': {
        const p = ScreenshotParamsSchema.parse(params);
        return executeScreenshot(client!, p);
      }
      case 'navigate': {
        const p = NavigateParamsSchema.parse(params);
        return executeNavigate(client!, this.browser, p);
      }
      case 'click': {
        const p = ClickParamsSchema.parse(params);
        return executeClick(client!, p);
      }
      case 'type': {
        const p = TypeParamsSchema.parse(params);
        return executeType(client!, p);
      }
      case 'evaluate': {
        const p = EvaluateParamsSchema.parse(params);
        return executeEvaluate(client!, p);
      }
      case 'wait': {
        const p = WaitParamsSchema.parse(params);
        return executeWait(client!, this.browser, p);
      }
      case 'page_info': {
        if (!client) throw new Error('browser_disconnected');
        return executePageInfo(client);
      }
      default:
        throw new Error('unknown_method');
    }
  }
}
