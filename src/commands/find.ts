import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import {
  buildSnapshot,
  findElements,
  formatSnapshot
} from '../browser/inspect/snapshot.js';
import type { ElementInfo } from '../browser/inspect/types.js';

export interface FindQuery {
  role?: string;
  name?: string;
  text?: string;
}

export interface FindCommandResult {
  text: string;
  elements: ElementInfo[];
}

export async function executeFind(
  client: Client,
  refMap: ElementRefMap,
  query: FindQuery
): Promise<FindCommandResult> {
  // Always builds a fresh snapshot — no caching across calls
  const snapshot = await buildSnapshot(client, refMap);
  const matched = findElements(snapshot, query);

  if (matched.length === 0) {
    const queryParts = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${v}"`);
    const queryDesc =
      queryParts.length > 0 ? queryParts.join(', ') : 'the given query';
    return {
      text: `No elements found matching ${queryDesc}.`,
      elements: []
    };
  }

  // Format just the matched elements
  const result = formatSnapshot({
    ...snapshot,
    elements: matched
  });

  return {
    text: result,
    elements: matched
  };
}
