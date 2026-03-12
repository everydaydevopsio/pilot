import { ClickParamsSchema, executeClick } from '../../src/commands/click.js';
import type { Client } from 'chrome-remote-interface';

describe('ClickParamsSchema', () => {
  it('parses with selector', () => {
    const p = ClickParamsSchema.parse({ selector: '#btn' });
    expect(p.selector).toBe('#btn');
    expect(p.button).toBe('left');
    expect(p.clickCount).toBe(1);
  });

  it('parses with coordinates', () => {
    const p = ClickParamsSchema.parse({ x: 100, y: 200 });
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
  });

  it('rejects when neither selector nor coordinates', () => {
    expect(() => ClickParamsSchema.parse({})).toThrow();
  });
});

describe('executeClick', () => {
  it('clicks coordinates directly', async () => {
    const events: string[] = [];
    const mockClient = {
      Runtime: { evaluate: jest.fn() },
      Input: {
        dispatchMouseEvent: jest
          .fn()
          .mockImplementation((p: { type: string }) => {
            events.push(p.type);
            return Promise.resolve();
          })
      }
    } as unknown as Client;

    const result = await executeClick(mockClient, {
      selector: undefined,
      x: 50,
      y: 100,
      button: 'left',
      clickCount: 1,
      timeoutMs: 5000
    });

    expect(result).toEqual({ x: 50, y: 100 });
    expect(events).toEqual(['mousePressed', 'mouseReleased']);
  });

  it('waits for selector and clicks center', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({
          result: { value: { x: 30, y: 40 } }
        })
      },
      Input: {
        dispatchMouseEvent: jest.fn().mockResolvedValue(undefined)
      }
    } as unknown as Client;

    const result = await executeClick(mockClient, {
      selector: '#btn',
      button: 'left',
      clickCount: 1,
      timeoutMs: 5000
    });

    expect(result).toEqual({ x: 30, y: 40 });
  });

  it('rejects when selector not found within timeout', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({
          result: { value: null }
        })
      },
      Input: { dispatchMouseEvent: jest.fn() }
    } as unknown as Client;

    await expect(
      executeClick(mockClient, {
        selector: '#missing',
        button: 'left',
        clickCount: 1,
        timeoutMs: 150
      })
    ).rejects.toThrow('timeout');
  });
});
