import {
  EvaluateParamsSchema,
  executeEvaluate
} from '../../src/commands/evaluate.js';
import type { Client } from 'chrome-remote-interface';

describe('EvaluateParamsSchema', () => {
  it('parses defaults', () => {
    const p = EvaluateParamsSchema.parse({ expression: '1+1' });
    expect(p.awaitPromise).toBe(true);
    expect(p.timeoutMs).toBe(10000);
  });
});

describe('executeEvaluate', () => {
  it('returns value and type for a simple expression', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({
          result: { value: 'hello', type: 'string' },
          exceptionDetails: undefined
        })
      }
    } as unknown as Client;

    const result = await executeEvaluate(mockClient, {
      expression: 'document.title',
      awaitPromise: true,
      timeoutMs: 5000
    });

    expect(result.value).toBe('hello');
    expect(result.type).toBe('string');
  });

  it('throws when exceptionDetails are present', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest.fn().mockResolvedValue({
          result: { type: 'undefined' },
          exceptionDetails: {
            text: 'ReferenceError',
            exception: { description: 'ReferenceError: foo is not defined' }
          }
        })
      }
    } as unknown as Client;

    await expect(
      executeEvaluate(mockClient, {
        expression: 'foo',
        awaitPromise: true,
        timeoutMs: 5000
      })
    ).rejects.toThrow('ReferenceError: foo is not defined');
  });

  it('rejects on timeout', async () => {
    const mockClient = {
      Runtime: {
        evaluate: jest
          .fn()
          .mockImplementation(() => new Promise((r) => setTimeout(r, 500)))
      }
    } as unknown as Client;

    await expect(
      executeEvaluate(mockClient, {
        expression: 'slow',
        awaitPromise: true,
        timeoutMs: 50
      })
    ).rejects.toThrow('timeout');
  });
});
