// #58: WebDriver BiDi transport over a WebSocket, tested with a fake socket.
import {
  BidiConnection,
  BidiError
} from '../../../src/browser/bidi/connection.js';

type Listener = (event: { data?: unknown }) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static behavior: 'open' | 'error' | 'hang' | 'throw' = 'open';
  sent: Array<{ id: number; method: string; params: unknown }> = [];
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    if (FakeWebSocket.behavior === 'throw') throw new Error('bad url');
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      if (FakeWebSocket.behavior === 'open') this.fire('open', {});
      if (FakeWebSocket.behavior === 'error') this.fire('error', {});
    }, 0);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    setTimeout(() => this.fire('close', {}), 0);
  }

  fire(type: string, event: { data?: unknown }): void {
    for (const l of this.listeners.get(type) ?? []) l(event);
  }

  reply(message: unknown): void {
    this.fire('message', { data: JSON.stringify(message) });
  }
}

describe('BidiConnection', () => {
  const realWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    FakeWebSocket.behavior = 'open';
    (globalThis as { WebSocket: unknown }).WebSocket = FakeWebSocket;
  });

  afterEach(() => {
    (globalThis as { WebSocket: unknown }).WebSocket = realWebSocket;
  });

  async function open(): Promise<{ conn: BidiConnection; ws: FakeWebSocket }> {
    const conn = await BidiConnection.connect('ws://127.0.0.1:1/session');
    return { conn, ws: FakeWebSocket.instances[0] };
  }

  it('sends commands and resolves their results', async () => {
    const { conn, ws } = await open();
    const pending = conn.send('browsingContext.getTree', { maxDepth: 0 });
    expect(ws.sent).toEqual([
      { id: 1, method: 'browsingContext.getTree', params: { maxDepth: 0 } }
    ]);
    ws.reply({ id: 1, type: 'success', result: { contexts: [] } });
    await expect(pending).resolves.toEqual({ contexts: [] });

    const empty = conn.send('session.end');
    ws.reply({ id: 2, type: 'success' });
    await expect(empty).resolves.toEqual({});
  });

  it('rejects commands the browser answers with an error', async () => {
    const { conn, ws } = await open();
    const pending = conn.send('script.callFunction');
    ws.reply({ id: 1, type: 'error', error: 'no such node', message: 'gone' });
    const err = await pending.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BidiError);
    expect(err).toMatchObject({
      method: 'script.callFunction',
      error: 'no such node',
      message: 'script.callFunction failed: no such node (gone)'
    });

    const bare = conn.send('x');
    ws.reply({ id: 2, type: 'error' });
    await expect(bare).rejects.toThrow('x failed: unknown error');
  });

  it('times out unanswered commands', async () => {
    const { conn } = await open();
    await expect(conn.send('slow', {}, 10)).rejects.toThrow(
      'slow timed out after 10ms'
    );
  });

  it('dispatches events and survives bad handlers and messages', async () => {
    const { conn, ws } = await open();
    const seen: unknown[] = [];
    conn.on('log.entryAdded', () => {
      throw new Error('handler bug');
    });
    conn.on('log.entryAdded', (p) => seen.push(p));
    ws.reply({
      type: 'event',
      method: 'log.entryAdded',
      params: { text: 'a' }
    });
    ws.reply({ type: 'event', method: 'log.entryAdded' });
    ws.fire('message', { data: 'not json' });
    ws.reply({ id: 99, type: 'success' });
    expect(seen).toEqual([{ text: 'a' }, {}]);
  });

  it('fails pending and later commands when the socket closes', async () => {
    const { conn, ws } = await open();
    const closed = jest.fn();
    conn.onClose(closed);
    const pending = conn.send('slow');
    ws.fire('close', {});
    ws.fire('close', {});
    await expect(pending).rejects.toThrow(
      'slow failed: the browser connection closed'
    );
    expect(closed).toHaveBeenCalledTimes(1);
    await expect(conn.send('next')).rejects.toThrow(
      'next failed: the browser connection is closed'
    );
    await expect(conn.close()).resolves.toBeUndefined();
  });

  it('closes the socket on request', async () => {
    const { conn } = await open();
    await expect(conn.close()).resolves.toBeUndefined();
  });

  it('rejects when the socket cannot open', async () => {
    FakeWebSocket.behavior = 'error';
    await expect(BidiConnection.connect('ws://x/session')).rejects.toThrow(
      'Could not open WebSocket ws://x/session'
    );
    FakeWebSocket.behavior = 'throw';
    await expect(BidiConnection.connect('ws://x/session')).rejects.toThrow(
      'bad url'
    );
    FakeWebSocket.behavior = 'hang';
    await expect(BidiConnection.connect('ws://x/session', 10)).rejects.toThrow(
      'Timed out opening ws://x/session'
    );
  });
});
