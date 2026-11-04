// #58: BiDi value conversion, key mapping, and network event recording.
import {
  chordActions,
  parseKeyCombo,
  textActions
} from '../../../src/browser/bidi/keys.js';
import {
  BidiNetworkMonitor,
  resourceTypeOf
} from '../../../src/browser/bidi/network.js';
import {
  cdpTypeOf,
  deserialize,
  exceptionText,
  toLocalValue
} from '../../../src/browser/bidi/remote-value.js';
import type { BidiTransport } from '../../../src/browser/bidi/connection.js';
import { NetworkBuffer } from '../../../src/browser/network/network-buffer.js';

describe('toLocalValue', () => {
  it('serializes JSON values and special numbers', () => {
    expect(toLocalValue(undefined)).toEqual({ type: 'undefined' });
    expect(toLocalValue(null)).toEqual({ type: 'null' });
    expect(toLocalValue('a')).toEqual({ type: 'string', value: 'a' });
    expect(toLocalValue(true)).toEqual({ type: 'boolean', value: true });
    expect(toLocalValue(2)).toEqual({ type: 'number', value: 2 });
    expect(toLocalValue(NaN)).toEqual({ type: 'number', value: 'NaN' });
    expect(toLocalValue(Infinity)).toEqual({
      type: 'number',
      value: 'Infinity'
    });
    expect(toLocalValue(-Infinity)).toEqual({
      type: 'number',
      value: '-Infinity'
    });
    expect(toLocalValue(-0)).toEqual({ type: 'number', value: '-0' });
    expect(toLocalValue([1, { k: 'v' }])).toEqual({
      type: 'array',
      value: [
        { type: 'number', value: 1 },
        { type: 'object', value: [['k', { type: 'string', value: 'v' }]] }
      ]
    });
    expect(toLocalValue(BigInt(5))).toEqual({ type: 'string', value: '5' });
  });
});

describe('deserialize', () => {
  it('converts remote values to JSON', () => {
    expect(deserialize(undefined)).toBeUndefined();
    expect(deserialize({ type: 'undefined' })).toBeUndefined();
    expect(deserialize({ type: 'null' })).toBeNull();
    expect(deserialize({ type: 'string', value: 's' })).toBe('s');
    expect(deserialize({ type: 'boolean', value: false })).toBe(false);
    expect(deserialize({ type: 'number', value: 3 })).toBe(3);
    expect(deserialize({ type: 'number', value: 'NaN' })).toBeNaN();
    expect(deserialize({ type: 'number', value: 'Infinity' })).toBe(Infinity);
    expect(deserialize({ type: 'number', value: '-Infinity' })).toBe(-Infinity);
    expect(Object.is(deserialize({ type: 'number', value: '-0' }), -0)).toBe(
      true
    );
    expect(deserialize({ type: 'number', value: '7' })).toBe(7);
    expect(deserialize({ type: 'bigint', value: '9' })).toBe('9');
    expect(deserialize({ type: 'date', value: '2026-01-01' })).toBe(
      '2026-01-01'
    );
    expect(deserialize({ type: 'regexp', value: {} })).toEqual({});
    expect(
      deserialize({
        type: 'array',
        value: [{ type: 'function' }, { type: 'number', value: 1 }]
      })
    ).toEqual([null, 1]);
    expect(deserialize({ type: 'set' })).toEqual([]);
    expect(
      deserialize({
        type: 'object',
        value: [
          ['a', { type: 'number', value: 1 }],
          ['f', { type: 'function' }]
        ]
      })
    ).toEqual({ a: 1 });
    expect(
      deserialize({
        type: 'map',
        value: [[{ type: 'string', value: 'k' }, { type: 'null' }]]
      })
    ).toEqual({ k: null });
    expect(deserialize({ type: 'object' })).toEqual({});
    expect(deserialize({ type: 'node', sharedId: 'n' })).toBeUndefined();
  });

  it('names values the way CDP RemoteObject types do', () => {
    expect(cdpTypeOf(undefined)).toBe('undefined');
    expect(cdpTypeOf({ type: 'undefined' })).toBe('undefined');
    expect(cdpTypeOf({ type: 'number' })).toBe('number');
    expect(cdpTypeOf({ type: 'function' })).toBe('function');
    expect(cdpTypeOf({ type: 'array' })).toBe('object');
    expect(cdpTypeOf({ type: 'null' })).toBe('object');
  });

  it('falls back to a generic exception message', () => {
    expect(exceptionText({ text: 'Error: x' })).toBe('Error: x');
    expect(exceptionText({})).toBe('evaluation error');
  });
});

describe('keys', () => {
  it('parses named keys, characters, and modifiers', () => {
    expect(parseKeyCombo('Enter')).toEqual({
      key: 'Enter',
      modifierNames: [],
      values: ['']
    });
    expect(parseKeyCombo('Meta+Shift+F12')).toEqual({
      key: 'F12',
      modifierNames: ['Meta', 'Shift'],
      values: ['', '', '']
    });
    expect(parseKeyCombo('ctrl+a')).toEqual({
      key: 'a',
      modifierNames: ['ctrl'],
      values: ['', 'a']
    });
    expect(parseKeyCombo('Hyper+Space').values).toEqual([' ']);
    expect(parseKeyCombo('F1').values).toEqual(['']);
    expect(parseKeyCombo('MediaPlay')).toEqual({
      key: 'MediaPlay',
      modifierNames: [],
      values: ['MediaPlay']
    });
  });

  it('builds chord and text actions', () => {
    expect(chordActions(['a', 'b'])).toEqual([
      { type: 'keyDown', value: 'a' },
      { type: 'keyDown', value: 'b' },
      { type: 'keyUp', value: 'b' },
      { type: 'keyUp', value: 'a' }
    ]);
    expect(textActions('x\r')).toEqual([
      { type: 'keyDown', value: 'x' },
      { type: 'keyUp', value: 'x' },
      { type: 'keyDown', value: '' },
      { type: 'keyUp', value: '' }
    ]);
  });
});

describe('BidiNetworkMonitor', () => {
  function transport() {
    const handlers = new Map<string, (p: Record<string, unknown>) => void>();
    const t: BidiTransport = {
      send: jest.fn(),
      on: (event, handler) => handlers.set(event, handler),
      onClose: jest.fn(),
      close: jest.fn()
    };
    return {
      t,
      emit: (event: string, params: unknown) =>
        handlers.get(event)!(params as Record<string, unknown>)
    };
  }

  const request = (id: string, extra = {}) => ({
    request: id,
    url: `https://a/${id}`,
    method: 'GET',
    headers: [
      { name: 'Accept', value: { type: 'string', value: '*/*' } },
      { name: 'Accept', value: { type: 'string', value: 'text/html' } }
    ],
    ...extra
  });

  it('maps BiDi requests to CDP resource types', () => {
    const r = (extra: object) => ({
      request: 'r',
      url: '',
      method: 'GET',
      ...extra
    });
    expect(resourceTypeOf(r({ destination: 'document' }))).toBe('Document');
    expect(resourceTypeOf(r({ destination: 'style' }))).toBe('Stylesheet');
    expect(resourceTypeOf(r({ destination: 'video' }))).toBe('Media');
    expect(resourceTypeOf(r({ initiatorType: 'fetch' }))).toBe('Fetch');
    expect(resourceTypeOf(r({ initiatorType: 'xmlhttprequest' }))).toBe('XHR');
    expect(resourceTypeOf(r({}))).toBe('Other');
  });

  it('records requests, responses, failures, and redirects', () => {
    const buffer = new NetworkBuffer();
    const monitor = new BidiNetworkMonitor(buffer);
    const { t, emit } = transport();
    monitor.attach(t);

    emit('network.beforeRequestSent', {
      navigation: 'nav',
      request: request('r1', { destination: 'document' })
    });
    expect(buffer.get('r1')).toMatchObject({
      method: 'GET',
      status: 0,
      resourceType: 'Document',
      requestHeaders: { Accept: '*/*\ntext/html' },
      complete: false
    });
    emit('network.responseCompleted', {
      navigation: 'nav',
      request: request('r1'),
      response: {
        url: 'https://a/r1',
        status: 301,
        mimeType: 'text/html; charset=utf-8',
        bytesReceived: 12,
        fromCache: true,
        headers: [{ name: 'Location', value: { type: 'string', value: '/b' } }]
      }
    });
    expect(buffer.get('r1')).toMatchObject({
      status: 301,
      mimeType: 'text/html',
      encodedDataLength: 12,
      fromCache: true,
      responseHeaders: { Location: '/b' },
      complete: true
    });
    expect(monitor.statusForNavigation('nav')).toBe(301);

    emit('network.beforeRequestSent', {
      redirectCount: 1,
      request: request('r1')
    });
    expect(buffer.get('r1.1')).toBeDefined();
    expect(monitor.bidiRequestId('r1.1')).toBe('r1');
    emit('network.fetchError', {
      redirectCount: 1,
      request: request('r1'),
      errorText: 'NS_ERROR_CONNECTION_REFUSED'
    });
    expect(buffer.get('r1.1')).toMatchObject({
      failed: true,
      errorText: 'NS_ERROR_CONNECTION_REFUSED',
      complete: true
    });

    emit('network.responseCompleted', { request: request('unknown') });
    expect(buffer.get('unknown')).toBeUndefined();

    monitor.reset();
    expect(monitor.bidiRequestId('r1')).toBeUndefined();
    expect(monitor.statusForNavigation('nav')).toBeUndefined();
  });

  it('waits for the network to go idle', async () => {
    const monitor = new BidiNetworkMonitor(new NetworkBuffer());
    await expect(monitor.waitForIdle(10)).resolves.toBeUndefined();

    monitor.onRequest({ request: request('a') });
    monitor.onRequest({ request: request('b') });
    await expect(monitor.waitForIdle(10)).rejects.toThrow(
      'timeout waiting for network idle'
    );
    const idle = monitor.waitForIdle(2000);
    monitor.onResponse({ request: request('a') });
    monitor.onError({ request: request('b'), errorText: 'x' });
    await expect(idle).resolves.toBeUndefined();
  });
});
