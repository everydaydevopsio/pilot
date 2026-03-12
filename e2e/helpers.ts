import { WebSocket } from 'ws';

export interface WsMessage {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  event?: string;
  data?: unknown;
}

export class AgentClient {
  private ws: WebSocket;
  private pending = new Map<
    string,
    { resolve: (v: WsMessage) => void; reject: (e: Error) => void }
  >();
  private events: WsMessage[] = [];
  private eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  private _idCounter = 0;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
      this.ws.on('message', (raw) => {
        const msg: WsMessage = JSON.parse(raw.toString());
        if (msg.id) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.ok) p.resolve(msg);
            else p.reject(new Error(msg.error ?? 'unknown error'));
          }
        } else if (msg.event) {
          this.events.push(msg);
          const handlers = this.eventHandlers.get(msg.event) ?? [];
          handlers.forEach((h) => h(msg.data));
        }
      });
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<WsMessage> {
    const id = String(++this._idCounter);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event: string, handler: (data: unknown) => void): void {
    const handlers = this.eventHandlers.get(event) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  getEvents(type?: string): WsMessage[] {
    return type ? this.events.filter((e) => e.event === type) : this.events;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }

  get readyState(): number {
    return this.ws.readyState;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
