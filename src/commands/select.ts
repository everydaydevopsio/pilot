import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { resolveRef, focusRef } from '../browser/interaction/ref-resolver.js';

export interface SelectParams {
  ref: string;
  value?: string;
  label?: string;
  index?: number;
}

export interface SelectResult {
  ref: string;
  selectedValue: string;
  selectedLabel: string;
}

/**
 * Select an option in a <select> element by value, label, or index.
 */
export async function executeSelect(
  client: Client,
  refMap: ElementRefMap,
  params: SelectParams
): Promise<SelectResult> {
  const resolved = await resolveRef(client, refMap, params.ref);

  await focusRef(client, resolved.backendNodeId);

  const { result } = await client.Runtime.callFunctionOn({
    objectId: resolved.objectId,
    functionDeclaration: `function(byValue, byLabel, byIndex) {
      if (this.tagName.toLowerCase() !== 'select') {
        throw new Error('Element is not a <select>');
      }
      var found = false;
      for (var i = 0; i < this.options.length; i++) {
        var opt = this.options[i];
        if (byValue !== null && opt.value === byValue) {
          this.selectedIndex = i; found = true; break;
        }
        if (byLabel !== null && opt.textContent.trim() === byLabel) {
          this.selectedIndex = i; found = true; break;
        }
        if (byIndex !== null && i === byIndex) {
          this.selectedIndex = i; found = true; break;
        }
      }
      if (!found) throw new Error('Option not found');
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
      var sel = this.options[this.selectedIndex];
      return { value: sel.value, label: sel.textContent.trim() };
    }`,
    arguments: [
      { value: params.value ?? null },
      { value: params.label ?? null },
      { value: params.index ?? null }
    ],
    returnByValue: true,
    awaitPromise: false
  });

  if (result.subtype === 'error' || result.className === 'Error') {
    throw new Error(result.description ?? 'Failed to select option');
  }

  const selected = result.value as { value: string; label: string };
  return {
    ref: params.ref,
    selectedValue: selected.value,
    selectedLabel: selected.label
  };
}
