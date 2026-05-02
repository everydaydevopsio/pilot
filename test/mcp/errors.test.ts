import { ConsoleBuffer } from '../../src/mcp/console-buffer.js';
import { registerErrorTools } from '../../src/mcp/tools/errors.js';
import type { ConsoleMessage } from '../../src/mcp/console-buffer.js';

// Minimal McpServer mock that captures registered tools
function makeMockServer() {
  const tools = new Map<
    string,
    (args: Record<string, unknown>) => Promise<unknown>
  >();
  return {
    tool(
      name: string,
      _desc: string,
      _shape: unknown,
      handler: (args: Record<string, unknown>) => Promise<unknown>
    ) {
      tools.set(name, handler);
    },
    async call(name: string, args: Record<string, unknown> = {}) {
      const h = tools.get(name);
      if (!h) throw new Error(`tool ${name} not registered`);
      return h(args);
    },
    registeredTools: tools
  };
}

type TextResult = { content: [{ type: 'text'; text: string }] };

function msg(
  level: ConsoleMessage['level'],
  text: string,
  timestamp = Date.now()
): ConsoleMessage {
  return { level, text, url: '', lineNumber: 0, timestamp };
}

describe('registerErrorTools', () => {
  let buffer: ConsoleBuffer;
  let server: ReturnType<typeof makeMockServer>;

  beforeEach(() => {
    buffer = new ConsoleBuffer(100);
    server = makeMockServer();
    registerErrorTools(server as never, buffer);
  });

  it('registers browser_get_console_logs, browser_get_errors, browser_clear_errors', () => {
    expect(server.registeredTools.has('browser_get_console_logs')).toBe(true);
    expect(server.registeredTools.has('browser_get_errors')).toBe(true);
    expect(server.registeredTools.has('browser_clear_errors')).toBe(true);
  });

  // ── browser_clear_errors ─────────────────────────────────────────────────

  describe('browser_clear_errors', () => {
    it('clears the buffer and reports count', async () => {
      buffer.push(msg('log', 'a'));
      buffer.push(msg('log', 'b'));
      const result = (await server.call('browser_clear_errors')) as TextResult;
      expect(result.content[0].text).toMatch(/cleared 2 console messages/i);
      expect(buffer.size()).toBe(0);
    });

    it('reports 0 when buffer is already empty', async () => {
      const result = (await server.call('browser_clear_errors')) as TextResult;
      expect(result.content[0].text).toMatch(/cleared 0 console messages/i);
    });
  });

  // ── browser_get_console_logs ─────────────────────────────────────────────

  describe('browser_get_console_logs', () => {
    beforeEach(() => {
      buffer.push(msg('log', 'log-msg'));
      buffer.push(msg('warn', 'warn-msg'));
      buffer.push(msg('error', 'error-msg'));
    });

    it('returns all messages when no filter', async () => {
      const result = (await server.call('browser_get_console_logs', {
        limit: 100
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(3);
    });

    it('filters by single level', async () => {
      const result = (await server.call('browser_get_console_logs', {
        level: 'warn',
        limit: 100
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.messages[0].text).toBe('warn-msg');
    });

    it('filters by multiple levels via levels array', async () => {
      const result = (await server.call('browser_get_console_logs', {
        levels: ['warn', 'error'],
        limit: 100
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(2);
    });

    it('levels array takes priority over level', async () => {
      const result = (await server.call('browser_get_console_logs', {
        level: 'log',
        levels: ['error'],
        limit: 100
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      // levels wins
      expect(data.count).toBe(1);
      expect(data.messages[0].level).toBe('error');
    });

    it('respects limit', async () => {
      const result = (await server.call('browser_get_console_logs', {
        limit: 1
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.messages.length).toBeLessThanOrEqual(1);
    });

    it('includes hasMore when buffer has more than limit', async () => {
      const result = (await server.call('browser_get_console_logs', {
        limit: 1
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.total).toBe(3);
      expect(data.hasMore).toBe(true);
    });
  });

  // ── browser_get_errors ───────────────────────────────────────────────────

  describe('browser_get_errors', () => {
    it('returns "No errors found." when buffer has no errors', async () => {
      buffer.push(msg('log', 'fine'));
      const result = (await server.call('browser_get_errors', {
        limit: 50
      })) as TextResult;
      expect(result.content[0].text).toMatch(/no errors found/i);
    });

    it('returns errors when present', async () => {
      buffer.push(msg('error', 'oops'));
      const result = (await server.call('browser_get_errors', {
        limit: 50
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.errors[0].text).toBe('oops');
    });

    it('excludes warnings by default', async () => {
      buffer.push(msg('warn', 'just-a-warning'));
      const result = (await server.call('browser_get_errors', {
        limit: 50
      })) as TextResult;
      expect(result.content[0].text).toMatch(/no errors found/i);
    });

    it('includes warnings when includeWarnings=true', async () => {
      buffer.push(msg('warn', 'w'));
      buffer.push(msg('error', 'e'));
      const result = (await server.call('browser_get_errors', {
        includeWarnings: true,
        limit: 50
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(2);
    });

    it('respects limit', async () => {
      buffer.push(msg('error', 'e1'));
      buffer.push(msg('error', 'e2'));
      buffer.push(msg('error', 'e3'));
      const result = (await server.call('browser_get_errors', {
        limit: 2
      })) as TextResult;
      const data = JSON.parse(result.content[0].text);
      expect(data.errors.length).toBeLessThanOrEqual(2);
    });
  });
});
