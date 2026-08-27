import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resolveRef, focusRef } from '../browser/interaction/ref-resolver.js';
import { setFieldValue } from '../browser/interaction/events.js';

export interface FillParams {
  ref: string;
  value: string;
}

export interface FillResult {
  ref: string;
  value: string;
}

/**
 * Fill a form field by ref — clears the existing value and sets a new one.
 * Fires framework-compatible input/change events.
 */
export async function executeFill(
  client: Client,
  refMap: ElementRefMap,
  params: FillParams
): Promise<FillResult> {
  const resolved = await resolveRef(client, refMap, params.ref);

  // Focus the element
  await focusRef(client, resolved.backendNodeId);

  // Set value and fire events
  await setFieldValue(client, resolved.objectId, params.value);

  return { ref: params.ref, value: params.value };
}
