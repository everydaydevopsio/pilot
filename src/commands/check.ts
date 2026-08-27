import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resolveRef } from '../browser/interaction/ref-resolver.js';

export interface CheckParams {
  ref: string;
  checked?: boolean;
}

export interface CheckResult {
  ref: string;
  checked: boolean;
}

/**
 * Toggle a checkbox or radio button by ref.
 * If `checked` is specified, sets it to that state (no-op if already matching).
 * If omitted, toggles the current state.
 */
export async function executeCheck(
  client: Client,
  refMap: ElementRefMap,
  params: CheckParams
): Promise<CheckResult> {
  const resolved = await resolveRef(client, refMap, params.ref);

  const { result } = await client.Runtime.callFunctionOn({
    objectId: resolved.objectId,
    functionDeclaration: `function(desiredState) {
      var tag = this.tagName.toLowerCase();
      var type = (this.type || '').toLowerCase();
      if (tag !== 'input' || (type !== 'checkbox' && type !== 'radio')) {
        throw new Error('Element is not a checkbox or radio button');
      }
      var current = this.checked;
      var target = desiredState !== null ? desiredState : !current;
      if (current !== target) {
        this.click();
      }
      return this.checked;
    }`,
    arguments: [{ value: params.checked ?? null }],
    returnByValue: true,
    awaitPromise: false
  });

  if (result.subtype === 'error' || result.className === 'Error') {
    throw new Error(result.description ?? 'Failed to toggle checkbox');
  }

  return {
    ref: params.ref,
    checked: result.value as boolean
  };
}
