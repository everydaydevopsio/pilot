import type { NetworkBuffer } from '../network/network-buffer.js';
import type { NetworkRecord } from '../network/types.js';
import type { BidiTransport } from './connection.js';

interface BidiHeader {
  name: string;
  value: { type: string; value: string };
}

interface BidiRequestData {
  request: string;
  url: string;
  method: string;
  headers?: BidiHeader[];
  destination?: string;
  initiatorType?: string | null;
}

interface BidiResponseData {
  url: string;
  status: number;
  headers?: BidiHeader[];
  mimeType?: string;
  bytesReceived?: number;
  fromCache?: boolean;
}

export interface BidiNetworkEvent {
  context?: string | null;
  navigation?: string | null;
  redirectCount?: number;
  request: BidiRequestData;
  response?: BidiResponseData;
  errorText?: string;
}

function headerRecord(headers?: BidiHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    const value = h.value?.value ?? '';
    out[h.name] = out[h.name] ? `${out[h.name]}\n${value}` : value;
  }
  return out;
}

const DESTINATION_TYPES: Record<string, string> = {
  document: 'Document',
  iframe: 'Document',
  frame: 'Document',
  script: 'Script',
  style: 'Stylesheet',
  image: 'Image',
  font: 'Font',
  audio: 'Media',
  video: 'Media',
  track: 'Media',
  manifest: 'Manifest'
};

/** Map a BiDi request to the CDP resource type names browser_network uses. */
export function resourceTypeOf(request: BidiRequestData): string {
  const byDestination = DESTINATION_TYPES[request.destination ?? ''];
  if (byDestination) return byDestination;
  if (request.initiatorType === 'fetch') return 'Fetch';
  if (request.initiatorType === 'xmlhttprequest') return 'XHR';
  return 'Other';
}

/**
 * Records BiDi network events in the shared NetworkBuffer and tracks
 * in-flight requests for networkidle waits. BiDi reuses a request id across
 * redirects, so each redirect hop gets its own record id.
 */
export class BidiNetworkMonitor {
  private readonly pending = new Set<string>();
  private readonly bidiIds = new Map<string, string>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleResolvers: Array<() => void> = [];
  /** Status of the main document response per navigation id. */
  private readonly navigationStatus = new Map<string, number>();

  constructor(private readonly buffer: NetworkBuffer) {}

  attach(transport: BidiTransport): void {
    transport.on('network.beforeRequestSent', (p) =>
      this.onRequest(p as unknown as BidiNetworkEvent)
    );
    transport.on('network.responseCompleted', (p) =>
      this.onResponse(p as unknown as BidiNetworkEvent)
    );
    transport.on('network.fetchError', (p) =>
      this.onError(p as unknown as BidiNetworkEvent)
    );
  }

  /** The BiDi request id behind a NetworkBuffer record id. */
  bidiRequestId(recordId: string): string | undefined {
    return this.bidiIds.get(recordId);
  }

  statusForNavigation(navigation: string): number | undefined {
    return this.navigationStatus.get(navigation);
  }

  private recordId(event: BidiNetworkEvent): string {
    const count = event.redirectCount ?? 0;
    return count > 0
      ? `${event.request.request}.${count}`
      : event.request.request;
  }

  onRequest(event: BidiNetworkEvent): void {
    const id = this.recordId(event);
    const record: NetworkRecord = {
      id,
      method: event.request.method,
      url: event.request.url,
      status: 0,
      resourceType: resourceTypeOf(event.request),
      startTime: Date.now(),
      failed: false,
      requestHeaders: headerRecord(event.request.headers),
      responseHeaders: {},
      mimeType: '',
      encodedDataLength: 0,
      fromCache: false,
      complete: false
    };
    this.buffer.push(record);
    this.bidiIds.set(id, event.request.request);
    this.pending.add(id);
    // A request that starts during the quiet period restarts the idle wait.
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  onResponse(event: BidiNetworkEvent): void {
    const id = this.recordId(event);
    const response = event.response;
    const now = Date.now();
    const existing = this.buffer.get(id);
    this.buffer.update(id, {
      status: response?.status ?? 0,
      responseHeaders: headerRecord(response?.headers),
      mimeType: (response?.mimeType ?? '').split(';')[0].trim(),
      fromCache: response?.fromCache ?? false,
      encodedDataLength: response?.bytesReceived ?? 0,
      endTime: now,
      duration: existing ? now - existing.startTime : undefined,
      complete: true
    });
    if (event.navigation && response) {
      this.navigationStatus.set(event.navigation, response.status);
    }
    this.finish(id);
  }

  onError(event: BidiNetworkEvent): void {
    const id = this.recordId(event);
    const now = Date.now();
    const existing = this.buffer.get(id);
    this.buffer.update(id, {
      failed: true,
      errorText: event.errorText,
      endTime: now,
      duration: existing ? now - existing.startTime : undefined,
      complete: true
    });
    this.finish(id);
  }

  private finish(id: string): void {
    this.pending.delete(id);
    if (this.pending.size > 0) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleResolvers.splice(0).forEach((r) => r());
    }, 500);
    this.idleTimer.unref?.();
  }

  /** Resolve once no request has been in flight for 500ms. */
  waitForIdle(timeoutMs: number): Promise<void> {
    if (this.pending.size === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const idx = this.idleResolvers.indexOf(done);
        if (idx !== -1) this.idleResolvers.splice(idx, 1);
        reject(new Error('timeout waiting for network idle'));
      }, timeoutMs);
      this.idleResolvers.push(done);
    });
  }

  reset(): void {
    this.pending.clear();
    this.bidiIds.clear();
    this.navigationStatus.clear();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
