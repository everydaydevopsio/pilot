import type { Client } from 'chrome-remote-interface';
import type { NetworkBuffer } from '../browser/network/network-buffer.js';
import type {
  NetworkSummary,
  NetworkDetail,
  NetworkFilter
} from '../browser/network/types.js';
import { getResponseBody } from '../browser/network/network-monitor.js';
import { redactHeaders } from '../browser/network/redaction.js';

export type NetworkAction = 'list' | 'get' | 'clear';

export interface NetworkParams {
  action: NetworkAction;
  requestId?: string;
  url?: string;
  method?: string;
  statusMin?: number;
  statusMax?: number;
  resourceType?: string;
  failed?: boolean;
  limit?: number;
}

export interface NetworkListResult {
  action: 'list';
  count: number;
  requests: NetworkSummary[];
}

export interface NetworkGetResult {
  action: 'get';
  request: NetworkDetail;
}

export interface NetworkClearResult {
  action: 'clear';
  cleared: number;
}

export type NetworkResult =
  NetworkListResult | NetworkGetResult | NetworkClearResult;

export async function executeNetwork(
  client: Client,
  buffer: NetworkBuffer,
  params: NetworkParams
): Promise<NetworkResult> {
  switch (params.action) {
    case 'list': {
      const filter: NetworkFilter = {
        url: params.url,
        method: params.method,
        statusMin: params.statusMin,
        statusMax: params.statusMax,
        resourceType: params.resourceType,
        failed: params.failed,
        limit: params.limit
      };
      const requests = buffer.list(filter);
      return { action: 'list', count: requests.length, requests };
    }

    case 'get': {
      if (!params.requestId) {
        throw new Error('requestId is required for action "get"');
      }
      const record = buffer.getDetail(params.requestId);
      if (!record) {
        throw new Error(
          `No network request found with id: ${params.requestId}`
        );
      }
      // Lazily fetch response body
      const bodyResult = await getResponseBody(client, params.requestId);
      const detail: NetworkDetail = {
        ...record,
        requestHeaders: redactHeaders(record.requestHeaders),
        responseHeaders: redactHeaders(record.responseHeaders),
        ...(bodyResult && {
          responseBody: bodyResult.body,
          bodyTruncated: bodyResult.truncated
        })
      };
      return { action: 'get', request: detail };
    }

    case 'clear': {
      const cleared = buffer.clear();
      return { action: 'clear', cleared };
    }
  }
}

export function formatNetworkList(result: NetworkListResult): string {
  if (result.requests.length === 0) {
    return 'No network requests captured.';
  }
  const lines = [`Network requests (${result.count}):\n`];
  for (const req of result.requests) {
    const status = req.failed ? 'FAILED' : String(req.status);
    const dur = req.duration !== undefined ? `${req.duration}ms` : '...';
    const size =
      req.size > 1024 ? `${(req.size / 1024).toFixed(1)}KB` : `${req.size}B`;
    lines.push(
      `  [${req.id}] ${req.method} ${status} ${req.url} (${dur}, ${size})`
    );
  }
  return lines.join('\n');
}

export function formatNetworkDetail(result: NetworkGetResult): string {
  const r = result.request;
  const lines = [
    `${r.method} ${r.url}`,
    `Status: ${r.failed ? `FAILED — ${r.errorText}` : r.status}`,
    `Type: ${r.resourceType} (${r.mimeType})`,
    `Duration: ${r.duration !== undefined ? `${r.duration}ms` : 'unknown'}`,
    `Size: ${r.encodedDataLength}B`,
    `Cache: ${r.fromCache ? 'yes' : 'no'}`
  ];

  if (Object.keys(r.requestHeaders).length > 0) {
    lines.push('', 'Request Headers:');
    for (const [k, v] of Object.entries(r.requestHeaders)) {
      lines.push(`  ${k}: ${v}`);
    }
  }

  if (Object.keys(r.responseHeaders).length > 0) {
    lines.push('', 'Response Headers:');
    for (const [k, v] of Object.entries(r.responseHeaders)) {
      lines.push(`  ${k}: ${v}`);
    }
  }

  if (r.responseBody !== undefined) {
    const truncNote = r.bodyTruncated ? ' (truncated to 1MB)' : '';
    lines.push('', `Response Body${truncNote}:`, r.responseBody);
  }

  return lines.join('\n');
}
