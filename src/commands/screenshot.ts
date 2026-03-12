import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';

export const ScreenshotParamsSchema = z.object({
  format: z.enum(['png', 'jpeg']).default('png'),
  quality: z.number().int().min(1).max(100).default(80),
  fullPage: z.boolean().default(false)
});

export type ScreenshotParams = z.infer<typeof ScreenshotParamsSchema>;

export interface ScreenshotResult {
  dataUrl: string;
  width: number;
  height: number;
}

export async function executeScreenshot(
  client: Client,
  params: ScreenshotParams
): Promise<ScreenshotResult> {
  let clip:
    | {
        x: number;
        y: number;
        width: number;
        height: number;
        scale: number;
      }
    | undefined;

  if (params.fullPage) {
    const layoutResult = await client.Page.getLayoutMetrics();
    const { width, height } = layoutResult.contentSize;
    clip = { x: 0, y: 0, width, height, scale: 1 };
  }

  const captureParams: {
    format?: 'png' | 'jpeg' | 'webp';
    quality?: number;
    clip?: typeof clip;
    captureBeyondViewport?: boolean;
  } = {
    format: params.format,
    captureBeyondViewport: params.fullPage
  };

  if (params.format === 'jpeg') {
    captureParams.quality = params.quality;
  }

  if (clip) {
    captureParams.clip = clip;
  }

  const { data } = await client.Page.captureScreenshot(captureParams);

  const mime = params.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const dataUrl = `data:${mime};base64,${data}`;

  // Decode dimensions from base64
  const buf = Buffer.from(data, 'base64');
  let width = 0;
  let height = 0;

  if (params.format === 'png' && buf.length > 24) {
    width = buf.readUInt32BE(16);
    height = buf.readUInt32BE(20);
  }

  return { dataUrl, width, height };
}
