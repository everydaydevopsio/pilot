import type { NetworkRecord, NetworkSummary, NetworkFilter } from './types.js';
import { redactHeaders } from './redaction.js';

export class NetworkBuffer {
  private buffer: NetworkRecord[] = [];
  private head = 0;
  private count = 0;
  private index = new Map<string, number>();

  constructor(private readonly maxSize: number = 1000) {}

  push(record: NetworkRecord): void {
    if (this.count < this.maxSize) {
      const idx = this.buffer.length;
      this.buffer.push(record);
      this.index.set(record.id, idx);
      this.count++;
    } else {
      // Remove the old record's index entry
      const oldRecord = this.buffer[this.head];
      if (oldRecord) {
        this.index.delete(oldRecord.id);
      }
      this.buffer[this.head] = record;
      this.index.set(record.id, this.head);
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  update(id: string, patch: Partial<NetworkRecord>): void {
    const idx = this.index.get(id);
    if (idx === undefined) return;
    Object.assign(this.buffer[idx], patch);
  }

  get(id: string): NetworkRecord | undefined {
    const idx = this.index.get(id);
    if (idx === undefined) return undefined;
    return this.buffer[idx];
  }

  list(filter?: NetworkFilter): NetworkSummary[] {
    const records = this.toArray();
    const filtered = this.applyFilter(records, filter);
    return filtered.map((r) => ({
      id: r.id,
      method: r.method,
      url: r.url,
      status: r.status,
      resourceType: r.resourceType,
      duration: r.duration,
      mimeType: r.mimeType,
      size: r.encodedDataLength,
      failed: r.failed,
      fromCache: r.fromCache
    }));
  }

  getDetail(id: string): NetworkRecord | undefined {
    const record = this.get(id);
    if (!record) return undefined;
    return {
      ...record,
      requestHeaders: redactHeaders(record.requestHeaders),
      responseHeaders: redactHeaders(record.responseHeaders)
    };
  }

  clear(): number {
    const cleared = this.count;
    this.buffer = [];
    this.head = 0;
    this.count = 0;
    this.index.clear();
    return cleared;
  }

  size(): number {
    return this.count;
  }

  private toArray(): NetworkRecord[] {
    if (this.count < this.maxSize) {
      return [...this.buffer];
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head)
    ];
  }

  private applyFilter(
    records: NetworkRecord[],
    filter?: NetworkFilter
  ): NetworkRecord[] {
    if (!filter) return records;

    let result = records;

    if (filter.url) {
      const urlLower = filter.url.toLowerCase();
      result = result.filter((r) => r.url.toLowerCase().includes(urlLower));
    }

    if (filter.method) {
      const methodUpper = filter.method.toUpperCase();
      result = result.filter((r) => r.method === methodUpper);
    }

    if (filter.statusMin !== undefined) {
      result = result.filter((r) => r.status >= filter.statusMin!);
    }

    if (filter.statusMax !== undefined) {
      result = result.filter((r) => r.status <= filter.statusMax!);
    }

    if (filter.resourceType) {
      const rt = filter.resourceType.toLowerCase();
      result = result.filter((r) => r.resourceType.toLowerCase() === rt);
    }

    if (filter.failed !== undefined) {
      result = result.filter((r) => r.failed === filter.failed);
    }

    if (filter.limit !== undefined && result.length > filter.limit) {
      result = result.slice(-filter.limit);
    }

    return result;
  }
}
