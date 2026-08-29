import type { Client } from 'chrome-remote-interface';
import { tmpdir } from 'os';
import { resolve } from 'path';

export interface DownloadRecord {
  guid: string;
  url: string;
  suggestedFilename: string;
  state: 'inProgress' | 'completed' | 'canceled';
  receivedBytes: number;
  totalBytes: number;
  timestamp: number;
}

export class DownloadTracker {
  private downloads = new Map<string, DownloadRecord>();

  track(record: DownloadRecord): void {
    this.downloads.set(record.guid, record);
  }

  update(guid: string, patch: Partial<DownloadRecord>): void {
    const existing = this.downloads.get(guid);
    if (existing) {
      Object.assign(existing, patch);
    }
  }

  get(guid: string): DownloadRecord | undefined {
    return this.downloads.get(guid);
  }

  list(): DownloadRecord[] {
    return [...this.downloads.values()];
  }

  clear(): number {
    const count = this.downloads.size;
    this.downloads.clear();
    return count;
  }

  size(): number {
    return this.downloads.size;
  }
}

function getDownloadDir(): string {
  const env = process.env.PILOT_DOWNLOAD_DIR;
  if (env) return resolve(env);
  return resolve(tmpdir(), 'pilot-downloads');
}

export async function enableDownloads(client: Client): Promise<string> {
  const downloadPath = getDownloadDir();
  await client.Browser.setDownloadBehavior({
    behavior: 'allowAndName',
    downloadPath,
    eventsEnabled: true
  });
  return downloadPath;
}

export function attachDownloadHandler(
  client: Client,
  tracker: DownloadTracker
): void {
  client.Browser.downloadWillBegin((params) => {
    tracker.track({
      guid: params.guid,
      url: params.url,
      suggestedFilename: params.suggestedFilename,
      state: 'inProgress',
      receivedBytes: 0,
      totalBytes: 0,
      timestamp: Date.now()
    });
  });

  client.Browser.downloadProgress((params) => {
    const state =
      params.state === 'completed'
        ? 'completed'
        : params.state === 'canceled'
          ? 'canceled'
          : 'inProgress';
    tracker.update(params.guid, {
      state,
      receivedBytes: params.receivedBytes ?? 0,
      totalBytes: params.totalBytes ?? 0
    });
  });
}

export function waitForDownload(
  tracker: DownloadTracker,
  guid: string,
  timeoutMs = 30000
): Promise<DownloadRecord> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const record = tracker.get(guid);
      if (record && record.state !== 'inProgress') {
        resolve(record);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Download ${guid} timed out after ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}
