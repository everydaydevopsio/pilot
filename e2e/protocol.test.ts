import { AgentClient, sleep } from './helpers.js';
import { WebSocket } from 'ws';

const PORT = parseInt(process.env.E2E_AAB_PORT ?? '8866', 10);

(process.env.E2E_SKIP ? describe.skip : describe)('E2E Protocol Tests', () => {
  let client: AgentClient;

  beforeEach(async () => {
    client = new AgentClient(PORT);
    await client.connect();
  });

  afterEach(async () => {
    if (client.readyState === WebSocket.OPEN) {
      await client.close();
    }
  });

  describe('E2E: health endpoint', () => {
    it('returns ok=true with chromeConnected=true', async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      const body = (await res.json()) as {
        ok: boolean;
        chromeConnected: boolean;
        agentConnected: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.chromeConnected).toBe(true);
      expect(body.agentConnected).toBe(true); // our client is connected
    });
  });

  describe('E2E: screenshot command', () => {
    it('returns a valid PNG dataUrl', async () => {
      const res = await client.send('screenshot');
      expect(res.ok).toBe(true);
      const result = res.result as {
        dataUrl: string;
        width: number;
        height: number;
      };
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
    });

    it('supports jpeg format', async () => {
      const res = await client.send('screenshot', {
        format: 'jpeg',
        quality: 50
      });
      expect(res.ok).toBe(true);
      const result = res.result as { dataUrl: string };
      expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe('E2E: GET /screenshot endpoint', () => {
    it('returns a PNG image', async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/screenshot`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const buf = await res.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(100);
    });
  });

  describe('E2E: navigate command', () => {
    it('navigates and returns final URL', async () => {
      const res = await client.send('navigate', {
        url: 'about:blank',
        waitUntil: 'load',
        timeoutMs: 10000
      });
      expect(res.ok).toBe(true);
      const result = res.result as { url: string; status: number };
      expect(result.url).toBeDefined();
    });

    it('emits page_navigated event', async () => {
      const navigatedEvents: unknown[] = [];
      client.on('page_navigated', (data) => navigatedEvents.push(data));

      await client.send('navigate', {
        url: 'about:blank',
        waitUntil: 'load',
        timeoutMs: 10000
      });
      await sleep(200);

      expect(navigatedEvents.length).toBeGreaterThan(0);
    });

    it('fails with invalid URL', async () => {
      await expect(
        client.send('navigate', { url: 'not-a-url' })
      ).rejects.toThrow();
    });
  });

  describe('E2E: evaluate command', () => {
    it('returns document.title as a string', async () => {
      const res = await client.send('evaluate', {
        expression: 'document.title'
      });
      expect(res.ok).toBe(true);
      const result = res.result as { value: string; type: string };
      expect(typeof result.value).toBe('string');
      expect(result.type).toBe('string');
    });

    it('returns numeric results', async () => {
      const res = await client.send('evaluate', { expression: '1 + 2' });
      expect(res.ok).toBe(true);
      const result = res.result as { value: number };
      expect(result.value).toBe(3);
    });

    it('handles evaluation errors', async () => {
      await expect(
        client.send('evaluate', { expression: 'throw new Error("test error")' })
      ).rejects.toThrow();
    });
  });

  describe('E2E: page_info command', () => {
    it('returns url, title, readyState', async () => {
      const res = await client.send('page_info');
      expect(res.ok).toBe(true);
      const result = res.result as {
        url: string;
        title: string;
        readyState: string;
      };
      expect(typeof result.url).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(['loading', 'interactive', 'complete']).toContain(
        result.readyState
      );
    });
  });

  describe('E2E: wait command', () => {
    it('waits fixed ms', async () => {
      const start = Date.now();
      const res = await client.send('wait', { ms: 200 });
      expect(res.ok).toBe(true);
      const result = res.result as { ok: boolean; elapsed: number };
      expect(result.elapsed).toBeGreaterThanOrEqual(180);
      expect(Date.now() - start).toBeGreaterThanOrEqual(180);
    });
  });

  describe('E2E: error handling', () => {
    it('returns unknown_method error', async () => {
      await expect(client.send('fly_to_moon')).rejects.toThrow(
        'unknown_method'
      );
    });

    it('rejects second WebSocket connection with 4409', (done) => {
      const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      ws2.on('close', (code, reason) => {
        expect(code).toBe(4409);
        expect(reason.toString()).toBe('session_conflict');
        done();
      });
      ws2.on('error', () => {
        // ignore connection errors
      });
    });

    it('closes with 4400 on malformed JSON', (done) => {
      client.close().then(() => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
        ws.on('open', () => {
          ws.send('not valid json');
        });
        ws.on('close', (code) => {
          expect(code).toBe(4400);
          done();
        });
      });
    });
  });
});
