import { getLogger } from '../../util/logger.js';

export type BidiEventHandler = (params: Record<string, unknown>) => void;

/**
 * The slice of a WebDriver BiDi connection the driver uses. Tests substitute
 * a fake that answers commands without a browser.
 */
export interface BidiTransport {
  send<T = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<T>;
  on(event: string, handler: BidiEventHandler): void;
  onClose(handler: () => void): void;
  close(): Promise<void>;
}

/** A BiDi command that the browser answered with an error. */
export class BidiError extends Error {
  constructor(
    readonly method: string,
    readonly error: string,
    message: string
  ) {
    super(`${method} failed: ${error}${message ? ` (${message})` : ''}`);
    this.name = 'BidiError';
  }
}

interface BidiMessage {
  id?: number;
  type?: 'success' | 'error' | 'event';
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  message?: string;
}

interface Pending {
  method: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 60000;

/** WebDriver BiDi over the WebSocket that Firefox serves at /session. */
export class BidiConnection implements BidiTransport {
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Map<string, BidiEventHandler[]>();
  private readonly closeHandlers: Array<() => void> = [];
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      this.onMessage(String(event.data));
    });
    ws.addEventListener('close', () => this.onSocketClosed());
  }

  /** Open a WebSocket to url; rejects if the socket does not open. */
  static connect(url: string, timeoutMs = 5000): Promise<BidiConnection> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(err as Error);
        return;
      }
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Timed out opening ${url}`));
      }, timeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new BidiConnection(ws));
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`Could not open WebSocket ${url}`));
      });
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(
        new Error(`${method} failed: the browser connection is closed`)
      );
    }
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, {
        method,
        resolve: resolve as (value: Record<string, unknown>) => void,
        reject,
        timer
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: BidiEventHandler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.push(handler);
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      timer.unref?.();
      this.ws.addEventListener('close', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.close();
    });
  }

  private onMessage(raw: string): void {
    let msg: BidiMessage;
    try {
      msg = JSON.parse(raw) as BidiMessage;
    } catch {
      getLogger().warn({ raw: raw.slice(0, 200) }, 'Unparseable BiDi message');
      return;
    }

    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.type === 'error') {
        pending.reject(
          new BidiError(
            pending.method,
            msg.error ?? 'unknown error',
            msg.message ?? ''
          )
        );
      } else {
        pending.resolve(msg.result ?? {});
      }
      return;
    }

    if (msg.method) {
      for (const handler of this.handlers.get(msg.method) ?? []) {
        try {
          handler(msg.params ?? {});
        } catch (err) {
          getLogger().warn({ err, event: msg.method }, 'BiDi handler failed');
        }
      }
    }
  }

  private onSocketClosed(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(
        new Error(`${pending.method} failed: the browser connection closed`)
      );
      this.pending.delete(id);
    }
    for (const handler of this.closeHandlers) handler();
  }
}
