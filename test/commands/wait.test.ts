import { WaitParamsSchema, executeWait } from '../../src/commands/wait.js';
import type { Client } from 'chrome-remote-interface';
import type { BrowserManager } from '../../src/browser.js';

describe('WaitParamsSchema', () => {
  it('requires at least one condition', () => {
    expect(() => WaitParamsSchema.parse({})).toThrow();
  });

  it('accepts ms', () => {
    const p = WaitParamsSchema.parse({ ms: 100 });
    expect(p.ms).toBe(100);
  });

  it('accepts selector', () => {
    const p = WaitParamsSchema.parse({ selector: '#el' });
    expect(p.selector).toBe('#el');
  });
});

describe('executeWait', () => {
  const mockBrowser = {
    waitForNetworkIdle: jest.fn().mockResolvedValue(undefined)
  } as unknown as BrowserManager;

  it('resolves fixed delay', async () => {
    const client = {} as Client;
    const start = Date.now();
    const result = await executeWait(client, mockBrowser, {
      ms: 100,
      timeoutMs: 5000
    });
    expect(result.ok).toBe(true);
    expect(result.elapsed).toBeGreaterThanOrEqual(90);
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });

  it('resolves for selector present', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({ result: { value: true } })
      }
    } as unknown as Client;

    const result = await executeWait(mockClient, mockBrowser, {
      selector: '#el',
      timeoutMs: 5000
    });
    expect(result.ok).toBe(true);
  });

  it('times out for absent selector', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({ result: { value: false } })
      }
    } as unknown as Client;

    await expect(
      executeWait(mockClient, mockBrowser, {
        selector: '#missing',
        timeoutMs: 150
      })
    ).rejects.toThrow('timeout');
  });

  it('delegates networkIdle to browser manager', async () => {
    const client = {} as Client;
    await executeWait(client, mockBrowser, {
      networkIdle: true,
      timeoutMs: 5000
    });
    expect(mockBrowser.waitForNetworkIdle).toHaveBeenCalled();
  });
});
