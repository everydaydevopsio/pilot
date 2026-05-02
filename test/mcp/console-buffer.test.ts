import { ConsoleBuffer } from '../../src/mcp/console-buffer.js';
import type { ConsoleMessage } from '../../src/mcp/console-buffer.js';

function msg(
  level: ConsoleMessage['level'] = 'log',
  text = 'hello',
  timestamp = Date.now()
): ConsoleMessage {
  return { level, text, url: '', lineNumber: 0, timestamp };
}

describe('ConsoleBuffer', () => {
  describe('push / size', () => {
    it('starts empty', () => {
      const buf = new ConsoleBuffer(10);
      expect(buf.size()).toBe(0);
    });

    it('increments size on push', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg());
      buf.push(msg());
      expect(buf.size()).toBe(2);
    });

    it('caps at maxSize and overwrites oldest entries', () => {
      const buf = new ConsoleBuffer(3);
      buf.push(msg('log', 'a'));
      buf.push(msg('log', 'b'));
      buf.push(msg('log', 'c'));
      buf.push(msg('log', 'd'));
      expect(buf.size()).toBe(3);
      const texts = buf.getAll().map((m) => m.text);
      expect(texts).toContain('b');
      expect(texts).toContain('c');
      expect(texts).toContain('d');
      expect(texts).not.toContain('a');
    });
  });

  describe('clear', () => {
    it('returns the count of cleared messages', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg());
      buf.push(msg());
      expect(buf.clear()).toBe(2);
    });

    it('resets size to 0', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg());
      buf.clear();
      expect(buf.size()).toBe(0);
    });

    it('returns 0 when already empty', () => {
      const buf = new ConsoleBuffer(10);
      expect(buf.clear()).toBe(0);
    });
  });

  describe('getAll', () => {
    it('returns all messages with no filter', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('log', 'a'));
      buf.push(msg('error', 'b'));
      expect(buf.getAll()).toHaveLength(2);
    });

    it('filters by single level', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('log', 'a'));
      buf.push(msg('error', 'b'));
      buf.push(msg('warn', 'c'));
      const result = buf.getAll({ level: 'error' });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('b');
    });

    it('filters by multiple levels', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('log', 'a'));
      buf.push(msg('error', 'b'));
      buf.push(msg('warn', 'c'));
      const result = buf.getAll({ level: ['error', 'warn'] });
      expect(result).toHaveLength(2);
    });

    it('filters by sinceMs', () => {
      const buf = new ConsoleBuffer(10);
      const old = Date.now() - 10000;
      const recent = Date.now() - 100;
      buf.push(msg('log', 'old', old));
      buf.push(msg('log', 'new', recent));
      const result = buf.getAll({ sinceMs: 5000 });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('new');
    });

    it('respects limit', () => {
      const buf = new ConsoleBuffer(10);
      for (let i = 0; i < 5; i++) buf.push(msg('log', `m${i}`));
      const result = buf.getAll({ limit: 2 });
      expect(result).toHaveLength(2);
    });

    it('limit takes last N messages', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('log', 'first'));
      buf.push(msg('log', 'second'));
      buf.push(msg('log', 'third'));
      const result = buf.getAll({ limit: 2 });
      expect(result.map((m) => m.text)).toEqual(['second', 'third']);
    });
  });

  describe('getErrors', () => {
    it('returns only error-level messages', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('log', 'not-an-error'));
      buf.push(msg('error', 'is-an-error'));
      const result = buf.getErrors();
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('is-an-error');
    });

    it('accepts sinceMs to filter by time', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('error', 'old-error', Date.now() - 10000));
      buf.push(msg('error', 'new-error', Date.now() - 100));
      const result = buf.getErrors(5000);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('new-error');
    });

    it('returns empty array when no errors', () => {
      const buf = new ConsoleBuffer(10);
      buf.push(msg('log', 'fine'));
      expect(buf.getErrors()).toHaveLength(0);
    });
  });

  describe('ring-buffer ordering after overflow', () => {
    it('returns messages in chronological order after wrapping', () => {
      const buf = new ConsoleBuffer(3);
      buf.push(msg('log', 'a'));
      buf.push(msg('log', 'b'));
      buf.push(msg('log', 'c'));
      buf.push(msg('log', 'd')); // wraps: evicts 'a'
      buf.push(msg('log', 'e')); // wraps: evicts 'b'
      const texts = buf.getAll().map((m) => m.text);
      expect(texts).toEqual(['c', 'd', 'e']);
    });
  });
});
