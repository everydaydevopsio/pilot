import { TypeParamsSchema, executeType } from '../../src/commands/type.js';
import type { Client } from 'chrome-remote-interface';

describe('TypeParamsSchema', () => {
  it('parses required text', () => {
    const p = TypeParamsSchema.parse({ text: 'hello' });
    expect(p.text).toBe('hello');
    expect(p.clearFirst).toBe(false);
    expect(p.delayMs).toBe(0);
  });
});

describe('executeType', () => {
  function makeClient(focusResult = true): Client {
    return {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({
          result: { value: focusResult }
        })
      },
      Input: {
        dispatchKeyEvent: jest.fn().mockResolvedValue(undefined)
      }
    } as unknown as Client;
  }

  it('types each character', async () => {
    const client = makeClient();
    const result = await executeType(client, {
      text: 'hi',
      clearFirst: false,
      delayMs: 0
    });
    expect(result.ok).toBe(true);
    // 2 chars × 2 events = 4 key events
    expect(
      (client.Input.dispatchKeyEvent as jest.Mock).mock.calls
    ).toHaveLength(4);
  });

  it('focuses selector before typing', async () => {
    const client = makeClient();
    await executeType(client, {
      text: 'x',
      selector: '#input',
      clearFirst: false,
      delayMs: 0
    });
    expect(client.Runtime.evaluate).toHaveBeenCalled();
  });

  it('throws when selector not found', async () => {
    const client = makeClient(false);
    await expect(
      executeType(client, {
        text: 'x',
        selector: '#missing',
        clearFirst: false,
        delayMs: 0
      })
    ).rejects.toThrow('Element not found');
  });

  it('sends clear keys when clearFirst=true', async () => {
    const client = makeClient();
    await executeType(client, { text: 'a', clearFirst: true, delayMs: 0 });
    const calls = (client.Input.dispatchKeyEvent as jest.Mock).mock.calls;
    // 4 for clear (ctrl+a down/up, delete down/up) + 2 for 'a' = 6
    expect(calls.length).toBe(6);
  });
});
