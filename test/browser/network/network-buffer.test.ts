import { NetworkBuffer } from '../../../src/browser/network/network-buffer.js';
import type { NetworkRecord } from '../../../src/browser/network/types.js';

function makeRecord(overrides: Partial<NetworkRecord> = {}): NetworkRecord {
  return {
    id: `req-${Math.random().toString(36).slice(2, 8)}`,
    method: 'GET',
    url: 'https://example.com/api',
    status: 200,
    resourceType: 'Fetch',
    startTime: Date.now(),
    failed: false,
    requestHeaders: {},
    responseHeaders: {},
    mimeType: 'application/json',
    encodedDataLength: 100,
    fromCache: false,
    complete: true,
    ...overrides
  };
}

describe('NetworkBuffer', () => {
  it('starts empty', () => {
    const buf = new NetworkBuffer(10);
    expect(buf.size()).toBe(0);
    expect(buf.list()).toEqual([]);
  });

  it('stores and retrieves records', () => {
    const buf = new NetworkBuffer(10);
    const rec = makeRecord({ id: 'r1' });
    buf.push(rec);
    expect(buf.size()).toBe(1);
    expect(buf.get('r1')).toEqual(rec);
  });

  it('updates records in place', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1', status: 0 }));
    buf.update('r1', { status: 200, mimeType: 'text/html' });
    const updated = buf.get('r1');
    expect(updated?.status).toBe(200);
    expect(updated?.mimeType).toBe('text/html');
  });

  it('wraps around when maxSize is exceeded', () => {
    const buf = new NetworkBuffer(3);
    buf.push(makeRecord({ id: 'r1' }));
    buf.push(makeRecord({ id: 'r2' }));
    buf.push(makeRecord({ id: 'r3' }));
    buf.push(makeRecord({ id: 'r4' }));
    expect(buf.size()).toBe(3);
    expect(buf.get('r1')).toBeUndefined();
    expect(buf.get('r4')).toBeDefined();
  });

  it('list returns summaries', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1', method: 'GET', status: 200 }));
    const summaries = buf.list();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe('r1');
    expect(summaries[0].method).toBe('GET');
    expect(summaries[0].status).toBe(200);
  });

  it('filters by URL substring', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1', url: 'https://api.test/users' }));
    buf.push(makeRecord({ id: 'r2', url: 'https://api.test/posts' }));
    const result = buf.list({ url: 'users' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('filters by method', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1', method: 'GET' }));
    buf.push(makeRecord({ id: 'r2', method: 'POST' }));
    const result = buf.list({ method: 'POST' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });

  it('filters by status range', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1', status: 200 }));
    buf.push(makeRecord({ id: 'r2', status: 404 }));
    buf.push(makeRecord({ id: 'r3', status: 500 }));
    const result = buf.list({ statusMin: 400 });
    expect(result).toHaveLength(2);
  });

  it('filters by failed', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1', failed: false }));
    buf.push(makeRecord({ id: 'r2', failed: true }));
    const result = buf.list({ failed: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });

  it('respects limit', () => {
    const buf = new NetworkBuffer(10);
    for (let i = 0; i < 5; i++) {
      buf.push(makeRecord({ id: `r${i}` }));
    }
    const result = buf.list({ limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('clear resets the buffer', () => {
    const buf = new NetworkBuffer(10);
    buf.push(makeRecord({ id: 'r1' }));
    buf.push(makeRecord({ id: 'r2' }));
    const cleared = buf.clear();
    expect(cleared).toBe(2);
    expect(buf.size()).toBe(0);
    expect(buf.list()).toEqual([]);
  });

  it('getDetail returns record with redacted headers', () => {
    const buf = new NetworkBuffer(10);
    buf.push(
      makeRecord({
        id: 'r1',
        requestHeaders: { Authorization: 'Bearer secret', Accept: 'text/html' },
        responseHeaders: {
          'Set-Cookie': 'session=abc',
          'Content-Type': 'text/html'
        }
      })
    );
    const detail = buf.getDetail('r1');
    expect(detail?.requestHeaders.Authorization).toBe('[REDACTED]');
    expect(detail?.requestHeaders.Accept).toBe('text/html');
    expect(detail?.responseHeaders['Set-Cookie']).toBe('[REDACTED]');
    expect(detail?.responseHeaders['Content-Type']).toBe('text/html');
  });

  it('getDetail returns undefined for unknown id', () => {
    const buf = new NetworkBuffer(10);
    expect(buf.getDetail('nonexistent')).toBeUndefined();
  });
});
