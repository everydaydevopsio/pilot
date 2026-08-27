import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resolveRef } from '../browser/interaction/ref-resolver.js';

export interface HoverParams {
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
}

export interface HoverResult {
  x: number;
  y: number;
}

export async function executeHover(
  client: Client,
  refMap: ElementRefMap,
  params: HoverParams
): Promise<HoverResult> {
  let x: number;
  let y: number;

  if (params.ref) {
    const resolved = await resolveRef(client, refMap, params.ref);
    x = resolved.x;
    y = resolved.y;
  } else if (params.x !== undefined && params.y !== undefined) {
    x = params.x;
    y = params.y;
  } else {
    throw new Error('Either ref or x/y coordinates are required');
  }

  await client.Input.dispatchMouseEvent({
    type: 'mouseMoved',
    x,
    y
  });

  return { x, y };
}
