import type { Client } from 'chrome-remote-interface';

/**
 * Fire framework-compatible input events on an element.
 * Uses the native value setter to work with React's synthetic event system,
 * then dispatches native DOM events with bubbling enabled for Vue/Svelte.
 */
export async function fireInputEvents(
  client: Client,
  objectId: string
): Promise<void> {
  await client.Runtime.callFunctionOn({
    objectId,
    functionDeclaration: `function() {
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    awaitPromise: false
  });
}

/**
 * Set a form field value using the native setter for React compatibility,
 * then fire input/change events.
 */
export async function setFieldValue(
  client: Client,
  objectId: string,
  value: string
): Promise<void> {
  await client.Runtime.callFunctionOn({
    objectId,
    functionDeclaration: `function(newValue) {
      var tag = this.tagName.toLowerCase();
      if (tag === 'select') {
        // Select element — set by value
        for (var i = 0; i < this.options.length; i++) {
          if (this.options[i].value === newValue) {
            this.selectedIndex = i;
            break;
          }
        }
      } else if (this.getAttribute('contenteditable') !== null) {
        this.textContent = newValue;
      } else {
        // Use native setter for React compatibility
        var proto = tag === 'textarea'
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) {
          setter.set.call(this, newValue);
        } else {
          this.value = newValue;
        }
      }
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }`,
    arguments: [{ value }],
    awaitPromise: false
  });
}

/**
 * Get the tag name of an element by its remote object ID.
 */
export async function getTagName(
  client: Client,
  objectId: string
): Promise<string> {
  const { result } = await client.Runtime.callFunctionOn({
    objectId,
    functionDeclaration: `function() { return this.tagName ? this.tagName.toLowerCase() : ''; }`,
    returnByValue: true,
    awaitPromise: false
  });
  return String(result.value ?? '');
}
