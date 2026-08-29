import { DownloadTracker } from '../../src/browser/interaction/downloads.js';
import {
  executeDownloads,
  formatDownloadsResult
} from '../../src/commands/downloads.js';
import type { DownloadsResult } from '../../src/commands/downloads.js';

describe('executeDownloads', () => {
  let tracker: DownloadTracker;

  beforeEach(() => {
    tracker = new DownloadTracker();
  });

  it('lists empty downloads', async () => {
    const result = await executeDownloads(tracker, { action: 'list' });
    expect(result.action).toBe('list');
    expect(result.downloads).toEqual([]);
  });

  it('lists tracked downloads', async () => {
    tracker.track({
      guid: 'dl-1',
      url: 'https://example.com/file.zip',
      suggestedFilename: 'file.zip',
      state: 'completed',
      receivedBytes: 1024,
      totalBytes: 1024,
      timestamp: Date.now()
    });
    const result = await executeDownloads(tracker, { action: 'list' });
    expect(result.downloads).toHaveLength(1);
    expect(result.downloads![0].filename).toBe('file.zip');
  });

  it('throws when wait called without guid', async () => {
    await expect(executeDownloads(tracker, { action: 'wait' })).rejects.toThrow(
      /guid is required/
    );
  });

  it('clears download records', async () => {
    tracker.track({
      guid: 'dl-1',
      url: 'https://example.com/a',
      suggestedFilename: 'a',
      state: 'completed',
      receivedBytes: 100,
      totalBytes: 100,
      timestamp: Date.now()
    });
    const result = await executeDownloads(tracker, { action: 'clear' });
    expect(result.cleared).toBe(1);
    expect(tracker.size()).toBe(0);
  });
});

describe('formatDownloadsResult', () => {
  it('formats empty list', () => {
    const result: DownloadsResult = { action: 'list', downloads: [] };
    expect(formatDownloadsResult(result)).toBe('No downloads tracked.');
  });

  it('formats completed download wait', () => {
    const result: DownloadsResult = {
      action: 'wait',
      download: {
        guid: 'dl-1',
        url: 'https://example.com/file.zip',
        filename: 'file.zip',
        state: 'completed',
        receivedBytes: 2048,
        totalBytes: 2048
      }
    };
    const text = formatDownloadsResult(result);
    expect(text).toContain('Download complete');
    expect(text).toContain('file.zip');
  });

  it('formats canceled download wait', () => {
    const result: DownloadsResult = {
      action: 'wait',
      download: {
        guid: 'dl-2',
        url: 'https://example.com/big.zip',
        filename: 'big.zip',
        state: 'canceled',
        receivedBytes: 500,
        totalBytes: 10000
      }
    };
    const text = formatDownloadsResult(result);
    expect(text).toContain('Download canceled');
    expect(text).not.toContain('Download complete');
  });

  it('formats clear result', () => {
    const result: DownloadsResult = { action: 'clear', cleared: 3 };
    expect(formatDownloadsResult(result)).toBe('Cleared 3 download records.');
  });
});
