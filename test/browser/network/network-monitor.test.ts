import type { Client } from 'chrome-remote-interface';
import {
  attachNetworkMonitor,
  getResponseBody
} from '../../../src/browser/network/network-monitor.js';
import { NetworkBuffer } from '../../../src/browser/network/network-buffer.js';

type Listener = (params: unknown) => void;

function fakeClient() {
  const listeners: Record<string, Listener> = {};
  const on = (name: string) => (cb: Listener) => {
    listeners[name] = cb;
  };
  const client = {
    Network: {
      requestWillBeSent: on('requestWillBeSent'),
      responseReceived: on('responseReceived'),
      loadingFinished: on('loadingFinished'),
      loadingFailed: on('loadingFailed'),
      getResponseBody: jest.fn()
    }
  };
  return {
    client: client as unknown as Client,
    network: client.Network,
    fire: (name: string, params: unknown) => listeners[name](params)
  };
}

describe('attachNetworkMonitor', () => {
  it('records a request through to completion', () => {
    const { client, fire } = fakeClient();
    const buffer = new NetworkBuffer();
    attachNetworkMonitor(client, buffer);

    fire('requestWillBeSent', {
      requestId: 'r1',
      type: 'XHR',
      request: {
        method: 'GET',
        url: 'https://a.test/api',
        headers: { Accept: 'json' }
      }
    });
    fire('responseReceived', {
      requestId: 'r1',
      response: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        mimeType: 'application/json',
        fromDiskCache: true
      }
    });
    fire('loadingFinished', { requestId: 'r1', encodedDataLength: 42 });

    expect(buffer.get('r1')).toMatchObject({
      method: 'GET',
      url: 'https://a.test/api',
      status: 201,
      resourceType: 'XHR',
      requestHeaders: { Accept: 'json' },
      responseHeaders: { 'Content-Type': 'application/json' },
      mimeType: 'application/json',
      fromCache: true,
      encodedDataLength: 42,
      complete: true,
      failed: false
    });
    expect(buffer.get('r1')!.duration).toBeGreaterThanOrEqual(0);
  });

  it('defaults missing optional fields', () => {
    const { client, fire } = fakeClient();
    const buffer = new NetworkBuffer();
    attachNetworkMonitor(client, buffer);
    fire('requestWillBeSent', {
      requestId: 'r2',
      request: { method: 'POST', url: 'https://a.test/' }
    });
    fire('responseReceived', { requestId: 'r2', response: { status: 204 } });
    fire('loadingFinished', { requestId: 'r2' });
    expect(buffer.get('r2')).toMatchObject({
      resourceType: 'Other',
      requestHeaders: {},
      responseHeaders: {},
      mimeType: '',
      fromCache: false,
      encodedDataLength: 0
    });
  });

  it('marks failed requests', () => {
    const { client, fire } = fakeClient();
    const buffer = new NetworkBuffer();
    attachNetworkMonitor(client, buffer);
    fire('requestWillBeSent', {
      requestId: 'r3',
      request: { method: 'GET', url: 'https://down.test/' }
    });
    fire('loadingFailed', { requestId: 'r3', errorText: 'net::ERR_FAILED' });
    expect(buffer.get('r3')).toMatchObject({
      failed: true,
      errorText: 'net::ERR_FAILED',
      complete: true
    });
  });

  it('ignores completion events for unknown requests', () => {
    const { client, fire } = fakeClient();
    const buffer = new NetworkBuffer();
    attachNetworkMonitor(client, buffer);
    fire('loadingFinished', { requestId: 'nope' });
    fire('loadingFailed', { requestId: 'nope', errorText: 'x' });
    expect(buffer.size()).toBe(0);
  });
});

describe('getResponseBody', () => {
  it('returns a plain body', async () => {
    const { client, network } = fakeClient();
    network.getResponseBody.mockResolvedValue({
      body: 'hello',
      base64Encoded: false
    });
    await expect(getResponseBody(client, 'r1')).resolves.toEqual({
      body: 'hello',
      truncated: false
    });
  });

  it('decodes base64 bodies', async () => {
    const { client, network } = fakeClient();
    network.getResponseBody.mockResolvedValue({
      body: Buffer.from('decoded').toString('base64'),
      base64Encoded: true
    });
    await expect(getResponseBody(client, 'r1')).resolves.toEqual({
      body: 'decoded',
      truncated: false
    });
  });

  it('truncates bodies over 1MB', async () => {
    const { client, network } = fakeClient();
    const big = 'x'.repeat(1024 * 1024 + 10);
    network.getResponseBody.mockResolvedValueOnce({
      body: big,
      base64Encoded: false
    });
    const plain = await getResponseBody(client, 'r1');
    expect(plain!.truncated).toBe(true);
    expect(plain!.body.length).toBe(1024 * 1024);

    network.getResponseBody.mockResolvedValueOnce({
      body: Buffer.from(big).toString('base64'),
      base64Encoded: true
    });
    const encoded = await getResponseBody(client, 'r1');
    expect(encoded!.truncated).toBe(true);
    expect(encoded!.body.length).toBe(1024 * 1024);
  });

  it('returns null when the body is unavailable', async () => {
    const { client, network } = fakeClient();
    network.getResponseBody.mockRejectedValue(new Error('No resource'));
    await expect(getResponseBody(client, 'r1')).resolves.toBeNull();
  });
});
