import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { buildSnapshot, formatSnapshot } from '../browser/inspect/snapshot.js';
import type { SnapshotResult } from '../browser/inspect/types.js';

export interface SnapshotCommandResult {
  text: string;
  snapshot: SnapshotResult;
}

export async function executeSnapshot(
  client: Client,
  refMap: ElementRefMap
): Promise<SnapshotCommandResult> {
  const snapshot = await buildSnapshot(client, refMap);
  const text = formatSnapshot(snapshot);
  return { text, snapshot };
}
