import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resolveRef } from '../browser/interaction/ref-resolver.js';

export const ClickParamsSchema = z
  .object({
    ref: z.string().optional(),
    selector: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    button: z.enum(['left', 'right', 'middle']).default('left'),
    clickCount: z.number().int().positive().default(1),
    timeoutMs: z.number().int().positive().default(5000)
  })
  .refine(
    (v) =>
      v.ref !== undefined ||
      v.selector !== undefined ||
      (v.x !== undefined && v.y !== undefined),
    {
      message: 'Either ref, selector, or x/y coordinates are required'
    }
  );

export type ClickParams = z.infer<typeof ClickParamsSchema>;

export interface ClickResult {
  x: number;
  y: number;
}

async function waitForSelector(
  client: Client,
  selector: string,
  timeoutMs: number
): Promise<{ x: number; y: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.Runtime.evaluate({
      expression: `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`,
      returnByValue: true
    });

    if (result.result.value !== null && result.result.value !== undefined) {
      return result.result.value as { x: number; y: number };
    }

    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for selector: ${selector}`);
}

export async function executeClick(
  client: Client,
  params: ClickParams,
  refMap?: ElementRefMap
): Promise<ClickResult> {
  let x: number;
  let y: number;

  if (params.ref !== undefined) {
    if (!refMap) {
      throw new Error('Element ref map is required when using ref parameter');
    }
    const resolved = await resolveRef(client, refMap, params.ref);
    x = resolved.x;
    y = resolved.y;
  } else if (params.selector !== undefined) {
    const pos = await waitForSelector(
      client,
      params.selector,
      params.timeoutMs
    );
    x = pos.x;
    y = pos.y;
  } else {
    x = params.x!;
    y = params.y!;
  }

  const button = params.button;

  for (let i = 0; i < params.clickCount; i++) {
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed',
      x,
      y,
      button,
      clickCount: 1
    });
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased',
      x,
      y,
      button,
      clickCount: 1
    });
  }

  return { x, y };
}
