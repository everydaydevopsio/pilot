import { executePageInfo } from '../../src/commands/page_info.js';
import type { Client } from 'chrome-remote-interface';

describe('executePageInfo', () => {
  it('returns url, title and readyState', async () => {
    const payload = JSON.stringify({
      url: 'https://example.com',
      title: 'Example Domain',
      readyState: 'complete'
    });

    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({
          result: { value: payload }
        })
      }
    } as unknown as Client;

    const result = await executePageInfo(mockClient);
    expect(result.url).toBe('https://example.com');
    expect(result.title).toBe('Example Domain');
    expect(result.readyState).toBe('complete');
  });
});
