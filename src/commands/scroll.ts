import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';

export interface ScrollParams {
  ref?: string;
  x?: number;
  y?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface ScrollResult {
  scrollX: number;
  scrollY: number;
}

/**
 * Scroll the page or an element.
 * - If ref is given, scrolls the element into view.
 * - If direction/amount is given, scrolls the page.
 * - If x/y is given, scrolls the page to absolute coordinates.
 */
export async function executeScroll(
  client: Client,
  refMap: ElementRefMap,
  params: ScrollParams
): Promise<ScrollResult> {
  if (params.ref) {
    // Scroll element into view
    const backendNodeId = refMap.resolve(params.ref);
    await client.DOM.scrollIntoViewIfNeeded({ backendNodeId });

    const { result } = await client.Runtime.evaluate({
      expression: `JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY })`,
      returnByValue: true
    });
    const pos = JSON.parse(String(result.value));
    return { scrollX: pos.scrollX, scrollY: pos.scrollY };
  }

  if (params.direction) {
    const amount = params.amount ?? 300;
    const deltaX =
      params.direction === 'left'
        ? -amount
        : params.direction === 'right'
          ? amount
          : 0;
    const deltaY =
      params.direction === 'up'
        ? -amount
        : params.direction === 'down'
          ? amount
          : 0;

    await client.Input.dispatchMouseEvent({
      type: 'mouseWheel',
      x: 0,
      y: 0,
      deltaX,
      deltaY
    });

    // Small delay for scroll to take effect
    await new Promise((r) => setTimeout(r, 100));
  } else if (params.x !== undefined || params.y !== undefined) {
    await client.Runtime.evaluate({
      expression: `window.scrollTo(${params.x ?? 0}, ${params.y ?? 0})`,
      awaitPromise: false
    });
  }

  const { result } = await client.Runtime.evaluate({
    expression: `JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY })`,
    returnByValue: true
  });
  const pos = JSON.parse(String(result.value));
  return { scrollX: pos.scrollX, scrollY: pos.scrollY };
}
