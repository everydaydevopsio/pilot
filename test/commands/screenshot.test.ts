import {
  ScreenshotParamsSchema,
  executeScreenshot
} from '../../src/commands/screenshot.js';
import type { Client } from 'chrome-remote-interface';

describe('ScreenshotParamsSchema', () => {
  it('parses defaults', () => {
    const p = ScreenshotParamsSchema.parse({});
    expect(p.format).toBe('png');
    expect(p.quality).toBe(80);
    expect(p.fullPage).toBe(false);
  });

  it('accepts jpeg format', () => {
    const p = ScreenshotParamsSchema.parse({ format: 'jpeg', quality: 60 });
    expect(p.format).toBe('jpeg');
    expect(p.quality).toBe(60);
  });

  it('rejects invalid format', () => {
    expect(() => ScreenshotParamsSchema.parse({ format: 'gif' })).toThrow();
  });
});

describe('executeScreenshot', () => {
  it('returns a dataUrl for PNG', async () => {
    // Create a minimal 1x1 PNG buffer (89 50 4E 47 ... IHDR chunk has width/height at bytes 16-23)
    const pngBuf = Buffer.alloc(30);
    pngBuf[0] = 0x89; // PNG signature
    pngBuf.writeUInt32BE(1, 16); // width = 1
    pngBuf.writeUInt32BE(1, 20); // height = 1
    const base64 = pngBuf.toString('base64');

    const mockClient = {
      Page: {
        captureScreenshot: jest.fn().mockResolvedValue({ data: base64 }),
        getLayoutMetrics: jest.fn().mockResolvedValue({
          contentSize: { width: 1280, height: 800 }
        })
      }
    } as unknown as Client;

    const result = await executeScreenshot(mockClient, {
      format: 'png',
      quality: 80,
      fullPage: false
    });

    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('uses fullPage layout metrics when fullPage=true', async () => {
    const mockClient = {
      Page: {
        captureScreenshot: jest
          .fn()
          .mockResolvedValue({ data: Buffer.alloc(30).toString('base64') }),
        getLayoutMetrics: jest.fn().mockResolvedValue({
          contentSize: { width: 1280, height: 2000 }
        })
      }
    } as unknown as Client;

    await executeScreenshot(mockClient, {
      format: 'png',
      quality: 80,
      fullPage: true
    });

    expect(mockClient.Page.getLayoutMetrics).toHaveBeenCalled();
    const captureCall = (mockClient.Page.captureScreenshot as jest.Mock).mock
      .calls[0][0];
    expect(captureCall.clip).toBeDefined();
    expect(captureCall.clip.width).toBe(1280);
  });
});
