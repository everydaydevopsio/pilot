import { EventEmitter } from 'node:events';
import { Session } from '../src/session.js';
import type { BrowserManager } from '../src/browser.js';
import type { Client } from 'chrome-remote-interface';

function makeMockWs() {
  const ee = new EventEmitter() as EventEmitter & {
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
  };
  ee.readyState = 1; // OPEN
  ee.send = jest.fn();
  ee.close = jest.fn();
  return ee;
}

function makeMockBrowser(client: Client | null = null): BrowserManager {
  return {
    getClient: jest.fn().mockReturnValue(client),
    setEventCallback: jest.fn(),
    isConnected: jest.fn().mockReturnValue(client !== null)
  } as unknown as BrowserManager;
}

function makeMockClient(): Client {
  return {
    Runtime: {
      evaluate: jest.fn().mockResolvedValue({
        result: { value: 'test', type: 'string' }
      })
    },
    Page: {
      captureScreenshot: jest
        .fn()
        .mockResolvedValue({ data: Buffer.alloc(30).toString('base64') }),
      getLayoutMetrics: jest
        .fn()
        .mockResolvedValue({ contentSize: { width: 1, height: 1 } })
    },
    Input: {
      dispatchMouseEvent: jest.fn().mockResolvedValue(undefined),
      dispatchKeyEvent: jest.fn().mockResolvedValue(undefined)
    },
    Network: {
      responseReceived: jest.fn()
    }
  } as unknown as Client;
}

describe('Session', () => {
  it('closes with 4400 on malformed JSON', async () => {
    const ws = makeMockWs();
    const browser = makeMockBrowser();
    new Session(ws as never, browser);

    ws.emit('message', Buffer.from('not-json'));
    await new Promise((r) => setTimeout(r, 10));

    expect(ws.close).toHaveBeenCalledWith(4400, 'invalid_json');
  });

  it('returns unknown_method error for unrecognized command', async () => {
    const ws = makeMockWs();
    const browser = makeMockBrowser(makeMockClient());
    new Session(ws as never, browser);

    ws.emit('message', Buffer.from(JSON.stringify({ id: '1', method: 'fly' })));
    await new Promise((r) => setTimeout(r, 10));

    const sent = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(sent.ok).toBe(false);
    expect(sent.error).toBe('unknown_method');
  });

  it('responds with browser_disconnected when no client', async () => {
    const ws = makeMockWs();
    const browser = makeMockBrowser(null);
    new Session(ws as never, browser);

    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ id: '1', method: 'screenshot' }))
    );
    await new Promise((r) => setTimeout(r, 10));

    const sent = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(sent.ok).toBe(false);
    expect(sent.error).toBe('browser_not_started');
  });

  it('dispatches evaluate command successfully', async () => {
    const client = makeMockClient();
    const ws = makeMockWs();
    const browser = makeMockBrowser(client);
    new Session(ws as never, browser);

    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          id: '2',
          method: 'evaluate',
          params: { expression: 'document.title' }
        })
      )
    );
    await new Promise((r) => setTimeout(r, 50));

    const sent = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(sent.id).toBe('2');
    expect(sent.ok).toBe(true);
    expect(sent.result.value).toBe('test');
  });

  it('forwards browser events to WS client', () => {
    const ws = makeMockWs();
    const browser = makeMockBrowser();
    let savedCb: ((event: string, data: unknown) => void) | null = null;
    (browser.setEventCallback as jest.Mock).mockImplementation((cb) => {
      savedCb = cb;
    });

    new Session(ws as never, browser);

    savedCb!('console_message', { level: 'error', text: 'boom' });

    const sent = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(sent.event).toBe('console_message');
    expect(sent.data.text).toBe('boom');
  });
});
