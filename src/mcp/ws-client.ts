import WebSocket from 'ws';

export interface WsResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface WsEvent {
  event: string;
  data: unknown;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export type EventHandler = (event: string, data: unknown) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandler: EventHandler | null = null;
  private idCounter = 0;
  private destroyed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs: number;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly initialRetryMs = 100,
    private readonly maxRetryMs = 30000
  ) {
    this.retryMs = initialRetryMs;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error('Client has been destroyed');
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve) => {
      this.connectResolve = resolve;
      this.attemptConnect();
    });

    return this.connectPromise;
  }

  private attemptConnect(): void {
    if (this.destroyed) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.retryMs = this.initialRetryMs;
        if (this.connectResolve) {
          this.connectResolve();
          this.connectResolve = null;
        }
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id) {
            const p = this.pending.get(msg.id);
            if (p) {
              this.pending.delete(msg.id);
              clearTimeout(p.timeout);
              if (msg.ok) {
                p.resolve(msg.result);
              } else {
                p.reject(new Error(msg.error ?? 'unknown error'));
              }
            }
          } else if (msg.event) {
            this.eventHandler?.(msg.event, msg.data);
          }
        } catch {
          // Ignore invalid JSON
        }
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.rejectPending('Connection closed');
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        // Error will be followed by close event
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private rejectPending(message: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timeout);
      p.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.retryTimer) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs);
      this.attemptConnect();
    }, this.retryMs);
  }

  async send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 30000
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to ai-agent-browser');
    }

    const id = String(++this.idCounter);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout
      });

      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  async disconnect(): Promise<void> {
    this.destroyed = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.rejectPending('Client disconnected');

    if (this.ws) {
      return new Promise((resolve) => {
        this.ws!.once('close', resolve);
        this.ws!.close();
      });
    }
  }
}
