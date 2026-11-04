import { ConsoleBuffer } from '../../src/mcp/console-buffer.js';
import { registerRuntimeTools } from '../../src/mcp/tools/runtime.js';

type Handler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ text: string }>;
}>;

function setup() {
  const buffer = new ConsoleBuffer(50);
  const handlers = new Map<string, Handler>();
  const server = {
    tool: (name: string, ...rest: unknown[]) =>
      handlers.set(name, rest[rest.length - 1] as Handler)
  };
  registerRuntimeTools(server as never, buffer);
  const text = async (name: string, args: Record<string, unknown>) =>
    (await handlers.get(name)!(args)).content[0].text;
  return { buffer, text };
}

const now = Date.now();

describe('browser_console', () => {
  it('reports an empty buffer', async () => {
    const { text } = setup();
    await expect(text('browser_console', { action: 'list' })).resolves.toBe(
      'No console messages.'
    );
  });

  it('lists messages with 1-based source locations and stack frames', async () => {
    const { buffer, text } = setup();
    buffer.push({
      level: 'error',
      text: 'boom',
      url: 'https://a.test/app.js',
      lineNumber: 9,
      columnNumber: 4,
      timestamp: now,
      stackFrames: [
        {
          functionName: '',
          url: 'https://a.test/app.js',
          lineNumber: 1,
          columnNumber: 2
        },
        {
          functionName: 'run',
          url: 'https://a.test/app.js',
          lineNumber: 3,
          columnNumber: 0
        }
      ]
    });
    buffer.push({
      level: 'log',
      text: 'plain',
      url: '',
      lineNumber: 0,
      timestamp: now
    });
    const out = await text('browser_console', { action: 'list', limit: 10 });
    expect(out).toContain('Console messages (2):');
    expect(out).toContain('[ERROR] boom\n  at https://a.test/app.js:10:5');
    expect(out).toContain('    at <anonymous> (https://a.test/app.js:2:3)');
    expect(out).toContain('    at run (https://a.test/app.js:4:1)');
    expect(out).toContain('[LOG] plain');
  });

  it('omits the column when it is unknown', async () => {
    const { buffer, text } = setup();
    buffer.push({
      level: 'warn',
      text: 'w',
      url: 'https://a.test/x.js',
      lineNumber: 0,
      timestamp: now
    });
    await expect(
      text('browser_console', { action: 'list' })
    ).resolves.toContain('  at https://a.test/x.js:1');
  });

  it('filters by one level or several', async () => {
    const { buffer, text } = setup();
    for (const level of ['log', 'warn', 'error'] as const) {
      buffer.push({
        level,
        text: level,
        url: '',
        lineNumber: 0,
        timestamp: now
      });
    }
    const one = await text('browser_console', {
      action: 'list',
      level: 'warn'
    });
    expect(one).toContain('Console messages (1):');
    const many = await text('browser_console', {
      action: 'list',
      levels: ['warn', 'error']
    });
    expect(many).toContain('Console messages (2):');
  });

  it('clears the buffer', async () => {
    const { buffer, text } = setup();
    buffer.push({
      level: 'log',
      text: 'x',
      url: '',
      lineNumber: 0,
      timestamp: now
    });
    await expect(text('browser_console', { action: 'clear' })).resolves.toBe(
      'Cleared 1 console messages.'
    );
    expect(buffer.size()).toBe(0);
  });
});

describe('browser_errors', () => {
  it('reports no errors', async () => {
    const { text } = setup();
    await expect(text('browser_errors', { action: 'list' })).resolves.toBe(
      'No errors found.'
    );
  });

  it('lists errors and optionally warnings', async () => {
    const { buffer, text } = setup();
    buffer.push({
      level: 'warn',
      text: 'careful',
      url: '',
      lineNumber: 0,
      timestamp: now
    });
    buffer.push({
      level: 'error',
      text: 'bad',
      url: '',
      lineNumber: 0,
      timestamp: now
    });
    const errors = await text('browser_errors', { action: 'list' });
    expect(errors).toContain('Errors (1):');
    expect(errors).not.toContain('careful');
    const withWarnings = await text('browser_errors', {
      action: 'list',
      includeWarnings: true
    });
    expect(withWarnings).toContain('Errors (2):');
  });

  it('clears the buffer', async () => {
    const { buffer, text } = setup();
    buffer.push({
      level: 'error',
      text: 'x',
      url: '',
      lineNumber: 0,
      timestamp: now
    });
    await expect(text('browser_errors', { action: 'clear' })).resolves.toBe(
      'Cleared 1 console messages.'
    );
  });
});
