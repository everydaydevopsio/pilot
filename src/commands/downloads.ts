import type { DownloadTracker } from '../browser/interaction/downloads.js';
import { waitForDownload } from '../browser/interaction/downloads.js';

export type DownloadsAction = 'list' | 'wait' | 'clear';

export interface DownloadsParams {
  action: DownloadsAction;
  guid?: string;
  timeoutMs?: number;
}

export interface DownloadsResult {
  action: DownloadsAction;
  downloads?: Array<{
    guid: string;
    url: string;
    filename: string;
    state: string;
    receivedBytes: number;
    totalBytes: number;
  }>;
  download?: {
    guid: string;
    url: string;
    filename: string;
    state: string;
    receivedBytes: number;
    totalBytes: number;
  };
  cleared?: number;
}

export async function executeDownloads(
  tracker: DownloadTracker,
  params: DownloadsParams
): Promise<DownloadsResult> {
  switch (params.action) {
    case 'list': {
      const records = tracker.list();
      return {
        action: 'list',
        downloads: records.map((r) => ({
          guid: r.guid,
          url: r.url,
          filename: r.suggestedFilename,
          state: r.state,
          receivedBytes: r.receivedBytes,
          totalBytes: r.totalBytes
        }))
      };
    }

    case 'wait': {
      if (!params.guid) {
        throw new Error('guid is required for action "wait"');
      }
      const record = await waitForDownload(
        tracker,
        params.guid,
        params.timeoutMs ?? 30000
      );
      return {
        action: 'wait',
        download: {
          guid: record.guid,
          url: record.url,
          filename: record.suggestedFilename,
          state: record.state,
          receivedBytes: record.receivedBytes,
          totalBytes: record.totalBytes
        }
      };
    }

    case 'clear': {
      const cleared = tracker.clear();
      return { action: 'clear', cleared };
    }
  }
}

export function formatDownloadsResult(result: DownloadsResult): string {
  if (result.action === 'list') {
    const downloads = result.downloads ?? [];
    if (downloads.length === 0) {
      return 'No downloads tracked.';
    }
    const lines = [`Downloads (${downloads.length}):`];
    for (const d of downloads) {
      const progress =
        d.totalBytes > 0
          ? ` ${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`
          : '';
      lines.push(`  [${d.guid}] ${d.filename} (${d.state}${progress})`);
    }
    return lines.join('\n');
  }

  if (result.action === 'wait' && result.download) {
    const d = result.download;
    const label =
      d.state === 'completed' ? 'Download complete' : `Download ${d.state}`;
    return `${label}: ${d.filename} (${d.receivedBytes} bytes)`;
  }

  if (result.action === 'clear') {
    return `Cleared ${result.cleared} download records.`;
  }

  return 'Done.';
}
