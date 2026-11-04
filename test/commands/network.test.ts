import type { Client } from 'chrome-remote-interface';
import {
  executeNetwork,
  formatNetworkDetail,
  formatNetworkList
} from '../../src/commands/network.js';
import { NetworkBuffer } from '../../src/browser/network/network-buffer.js';
import type { NetworkRecord } from '../../src/browser/network/types.js';

function record(overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id: 'r1',
    method: 'GET',
    url: 'https://a.test/api',
    status: 200,
    resourceType: 'XHR',
    startTime: 1,
    duration: 12,
    failed: false,
    requestHeaders: { Accept: 'json' },
    responseHeaders: { 'Content-Type': 'application/json' },
    mimeType: 'application/json',
    encodedDataLength: 2048,
    fromCache: false,
    complete: true,
    ...overrides
  };
}

function clientWithBody(body: string | null): Client {
  return {
    Network: {
      getResponseBody:
        body === null
          ? jest.fn().mockRejectedValue(new Error('gone'))
          : jest.fn().mockResolvedValue({ body, base64Encoded: false })
    }
  } as unknown as Client;
}

describe('executeNetwork', () => {
  it('lists requests with filters', async () => {
    const buffer = new NetworkBuffer();
    buffer.push(record());
    buffer.push(record({ id: 'r2', method: 'POST', url: 'https://b.test/' }));
    const result = await executeNetwork(clientWithBody(''), buffer, {
      action: 'list',
      method: 'POST'
    });
    expect(result).toMatchObject({ action: 'list', count: 1 });
  });

  it('gets a request with its response body', async () => {
    const buffer = new NetworkBuffer();
    buffer.push(record());
    const result = await executeNetwork(clientWithBody('{"ok":1}'), buffer, {
      action: 'get',
      requestId: 'r1'
    });
    expect(result).toMatchObject({
      action: 'get',
      request: { id: 'r1', responseBody: '{"ok":1}', bodyTruncated: false }
    });
  });

  it('gets a request without a body when none is available', async () => {
    const buffer = new NetworkBuffer();
    buffer.push(record());
    const result = await executeNetwork(clientWithBody(null), buffer, {
      action: 'get',
      requestId: 'r1'
    });
    expect(result.action).toBe('get');
    expect(
      (result as { request: { responseBody?: string } }).request.responseBody
    ).toBeUndefined();
  });

  it('requires a requestId for get', async () => {
    await expect(
      executeNetwork(clientWithBody(''), new NetworkBuffer(), { action: 'get' })
    ).rejects.toThrow('requestId is required for action "get"');
  });

  it('reports an unknown requestId', async () => {
    await expect(
      executeNetwork(clientWithBody(''), new NetworkBuffer(), {
        action: 'get',
        requestId: 'zz'
      })
    ).rejects.toThrow('No network request found with id: zz');
  });

  it('clears the buffer', async () => {
    const buffer = new NetworkBuffer();
    buffer.push(record());
    await expect(
      executeNetwork(clientWithBody(''), buffer, { action: 'clear' })
    ).resolves.toEqual({ action: 'clear', cleared: 1 });
  });
});

describe('formatNetworkList', () => {
  it('explains an empty buffer', () => {
    expect(formatNetworkList({ action: 'list', count: 0, requests: [] })).toBe(
      'No network requests captured.'
    );
  });

  it('formats status, duration, and size', () => {
    const text = formatNetworkList({
      action: 'list',
      count: 2,
      requests: [
        {
          id: 'r1',
          method: 'GET',
          url: 'https://a.test/',
          status: 200,
          resourceType: 'XHR',
          duration: 12,
          mimeType: 'text/html',
          size: 2048,
          failed: false,
          fromCache: false
        },
        {
          id: 'r2',
          method: 'GET',
          url: 'https://down.test/',
          status: 0,
          resourceType: 'XHR',
          mimeType: '',
          size: 10,
          failed: true,
          fromCache: false
        }
      ]
    });
    expect(text).toContain('[r1] GET 200 https://a.test/ (12ms, 2.0KB)');
    expect(text).toContain('[r2] GET FAILED https://down.test/ (..., 10B)');
  });
});

describe('formatNetworkDetail', () => {
  it('includes headers and body', () => {
    const text = formatNetworkDetail({
      action: 'get',
      request: {
        ...record(),
        responseBody: 'BODY',
        bodyTruncated: true
      }
    });
    expect(text).toContain('GET https://a.test/api');
    expect(text).toContain('Status: 200');
    expect(text).toContain('Duration: 12ms');
    expect(text).toContain('Request Headers:\n  Accept: json');
    expect(text).toContain(
      'Response Headers:\n  Content-Type: application/json'
    );
    expect(text).toContain('Response Body (truncated to 1MB):\nBODY');
  });

  it('describes failures and missing data', () => {
    const text = formatNetworkDetail({
      action: 'get',
      request: record({
        failed: true,
        errorText: 'net::ERR_FAILED',
        duration: undefined,
        requestHeaders: {},
        responseHeaders: {},
        fromCache: true
      })
    });
    expect(text).toContain('Status: FAILED — net::ERR_FAILED');
    expect(text).toContain('Duration: unknown');
    expect(text).toContain('Cache: yes');
    expect(text).not.toContain('Headers:');
    expect(text).not.toContain('Response Body');
  });
});
