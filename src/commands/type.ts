import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resolveRef, focusRef } from '../browser/interaction/ref-resolver.js';

export const TypeParamsSchema = z.object({
  text: z.string(),
  ref: z.string().optional(),
  selector: z.string().optional(),
  clearFirst: z.boolean().default(false),
  delayMs: z.number().int().min(0).default(0)
});

export type TypeParams = z.infer<typeof TypeParamsSchema>;

export interface TypeResult {
  ok: boolean;
}

async function focusSelector(client: Client, selector: string): Promise<void> {
  const result = await client.Runtime.evaluate({
    expression: `(function() {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      return true;
    })()`
  });
  if (!result.result.value) {
    throw new Error(`Element not found: ${selector}`);
  }
}

export async function executeType(
  client: Client,
  params: TypeParams,
  refMap?: ElementRefMap
): Promise<TypeResult> {
  if (params.ref) {
    if (!refMap) {
      throw new Error('Element ref map is required when using ref parameter');
    }
    const resolved = await resolveRef(client, refMap, params.ref);
    await focusRef(client, resolved.backendNodeId);
  } else if (params.selector) {
    await focusSelector(client, params.selector);
  }

  if (params.clearFirst) {
    // Select all and delete
    await client.Input.dispatchKeyEvent({
      type: 'keyDown',
      key: 'a',
      modifiers: 2 // Ctrl
    });
    await client.Input.dispatchKeyEvent({
      type: 'keyUp',
      key: 'a',
      modifiers: 2
    });
    await client.Input.dispatchKeyEvent({
      type: 'keyDown',
      key: 'Delete'
    });
    await client.Input.dispatchKeyEvent({
      type: 'keyUp',
      key: 'Delete'
    });
  }

  for (const char of params.text) {
    await client.Input.dispatchKeyEvent({
      type: 'keyDown',
      text: char
    });
    await client.Input.dispatchKeyEvent({
      type: 'keyUp',
      text: char
    });

    if (params.delayMs > 0) {
      await new Promise((r) => setTimeout(r, params.delayMs));
    }
  }

  return { ok: true };
}
