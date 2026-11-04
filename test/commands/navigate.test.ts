import type { Client } from 'chrome-remote-interface';
import type { BrowserManager } from '../../src/browser.js';
import { executeNavigate } from '../../src/commands/navigate.js';

type Cb = (params?: unknown) => void;

function fakeClient(opts: { href?: string; status?: number } = {}) {
  const listeners: Record<string, Cb> = {};
  const navigate = jest.fn(async () => {
    listeners.responseReceived?.({
      response: { url: 'https://a.test/', status: opts.status ?? 200 }
    });
    // Fire both page events; the waitUntil mode decides which one counts.
    setImmediate(() => {
      listeners.domContentEventFired?.();
      listeners.loadEventFired?.();
    });
    return { frameId: 'f1' };
  });
  const client = {
    Page: {
      navigate,
      loadEventFired: (cb: Cb) => (listeners.loadEventFired = cb),
      domContentEventFired: (cb: Cb) => (listeners.domContentEventFired = cb)
    },
    Network: {
      responseReceived: (cb: Cb) => (listeners.responseReceived = cb)
    },
    Runtime: {
      evaluate: jest.fn().mockResolvedValue({
        result: { value: opts.href ?? 'https://a.test/' }
      })
    }
  };
  return { client: client as unknown as Client, navigate };
}

const manager = {
  waitForNetworkIdle: jest.fn().mockResolvedValue(undefined)
} as unknown as BrowserManager;

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe('executeNavigate', () => {
  it.each(['load', 'domcontentloaded', 'networkidle'] as const)(
    'resolves the final URL and status on %s',
    async (waitUntil) => {
      const { client, navigate } = fakeClient({ status: 201 });
      await expect(
        executeNavigate(client, manager, {
          url: 'https://a.test/',
          waitUntil,
          timeoutMs: 1000
        })
      ).resolves.toEqual({ url: 'https://a.test/', status: 201 });
      expect(navigate).toHaveBeenCalledWith({ url: 'https://a.test/' });
    }
  );

  it('blocks a URL denied by the origin policy before navigating', async () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'blocked.test';
    const { client, navigate } = fakeClient();
    await expect(
      executeNavigate(client, manager, {
        url: 'https://blocked.test/',
        waitUntil: 'load',
        timeoutMs: 1000
      })
    ).rejects.toThrow(/blocked/i);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves a page that redirected to a blocked origin', async () => {
    process.env.PILOT_BLOCKED_ORIGINS = 'evil.test';
    const { client, navigate } = fakeClient({ href: 'https://evil.test/' });
    await expect(
      executeNavigate(client, manager, {
        url: 'https://a.test/',
        waitUntil: 'load',
        timeoutMs: 1000
      })
    ).rejects.toThrow(/Redirect landed on blocked origin/);
    expect(navigate).toHaveBeenLastCalledWith({ url: 'about:blank' });
  });

  it('times out when the page never loads', async () => {
    const { client } = fakeClient();
    (client.Page as unknown as { navigate: jest.Mock }).navigate = jest
      .fn()
      .mockResolvedValue({ frameId: 'f1' });
    await expect(
      executeNavigate(client, manager, {
        url: 'https://a.test/',
        waitUntil: 'load',
        timeoutMs: 20
      })
    ).rejects.toThrow('timeout');
  });

  it('propagates a network-idle failure', async () => {
    const { client } = fakeClient();
    const idleFails = {
      waitForNetworkIdle: jest.fn().mockRejectedValue(new Error('busy'))
    } as unknown as BrowserManager;
    await expect(
      executeNavigate(client, idleFails, {
        url: 'https://a.test/',
        waitUntil: 'networkidle',
        timeoutMs: 1000
      })
    ).rejects.toThrow('busy');
  });
});
