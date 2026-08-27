import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../inspect/element-ref.js';

export interface ResolvedElement {
  backendNodeId: number;
  objectId: string;
  x: number;
  y: number;
}

/**
 * Resolve an element ref to coordinates and a remote object ID.
 * Scrolls the element into view first so click coordinates are valid.
 */
export async function resolveRef(
  client: Client,
  refMap: ElementRefMap,
  ref: string
): Promise<ResolvedElement> {
  const backendNodeId = refMap.resolve(ref);

  // Scroll into view
  await client.DOM.scrollIntoViewIfNeeded({ backendNodeId });

  // Get center coordinates from box model
  const { model } = await client.DOM.getBoxModel({ backendNodeId });
  const content = model.content;
  const x = (content[0] + content[2] + content[4] + content[6]) / 4;
  const y = (content[1] + content[3] + content[5] + content[7]) / 4;

  // Get remote object for Runtime.callFunctionOn
  const { object } = await client.DOM.resolveNode({ backendNodeId });
  if (!object.objectId) {
    throw new Error(`Could not resolve ref "${ref}" to a remote object`);
  }

  return {
    backendNodeId,
    objectId: object.objectId,
    x: Math.round(x),
    y: Math.round(y)
  };
}

/**
 * Focus an element by ref.
 */
export async function focusRef(
  client: Client,
  backendNodeId: number
): Promise<void> {
  await client.DOM.focus({ backendNodeId });
}
