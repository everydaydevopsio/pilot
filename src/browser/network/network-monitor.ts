import type { Client } from 'chrome-remote-interface';
import type { NetworkRecord } from './types.js';
import type { NetworkBuffer } from './network-buffer.js';

/**
 * Parse CDP headers object to a flat Record.
 * CDP returns headers as { "Header-Name": "value" }.
 */
function parseHeaders(
  headers?: Record<string, string>
): Record<string, string> {
  if (!headers) return {};
  return { ...headers };
}

export function attachNetworkMonitor(
  client: Client,
  buffer: NetworkBuffer
): void {
  client.Network.requestWillBeSent((params) => {
    const record: NetworkRecord = {
      id: params.requestId,
      method: params.request.method,
      url: params.request.url,
      status: 0,
      resourceType: params.type ?? 'Other',
      startTime: Date.now(),
      failed: false,
      requestHeaders: parseHeaders(
        params.request.headers as Record<string, string>
      ),
      responseHeaders: {},
      mimeType: '',
      encodedDataLength: 0,
      fromCache: false,
      complete: false
    };
    buffer.push(record);
  });

  client.Network.responseReceived((params) => {
    buffer.update(params.requestId, {
      status: params.response.status,
      responseHeaders: parseHeaders(
        params.response.headers as Record<string, string>
      ),
      mimeType: params.response.mimeType ?? '',
      fromCache: params.response.fromDiskCache ?? false
    });
  });

  client.Network.loadingFinished((params) => {
    const now = Date.now();
    const existing = buffer.get(params.requestId);
    buffer.update(params.requestId, {
      endTime: now,
      duration: existing?.startTime ? now - existing.startTime : undefined,
      encodedDataLength: params.encodedDataLength ?? 0,
      complete: true
    });
  });

  client.Network.loadingFailed((params) => {
    const now = Date.now();
    const existing = buffer.get(params.requestId);
    buffer.update(params.requestId, {
      endTime: now,
      duration: existing?.startTime ? now - existing.startTime : undefined,
      failed: true,
      errorText: params.errorText,
      complete: true
    });
  });
}

const MAX_RESPONSE_BODY_SIZE = 1024 * 1024; // 1 MB

export async function getResponseBody(
  client: Client,
  requestId: string
): Promise<{ body: string; truncated: boolean } | null> {
  try {
    const { body, base64Encoded } = await client.Network.getResponseBody({
      requestId
    });

    if (base64Encoded) {
      const decoded = Buffer.from(body, 'base64');
      if (decoded.length > MAX_RESPONSE_BODY_SIZE) {
        return {
          body: decoded.subarray(0, MAX_RESPONSE_BODY_SIZE).toString('utf-8'),
          truncated: true
        };
      }
      return { body: decoded.toString('utf-8'), truncated: false };
    }

    if (body.length > MAX_RESPONSE_BODY_SIZE) {
      return { body: body.slice(0, MAX_RESPONSE_BODY_SIZE), truncated: true };
    }

    return { body, truncated: false };
  } catch {
    // Body may not be available (e.g., still loading, or was a redirect)
    return null;
  }
}
