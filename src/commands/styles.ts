import type { Client } from 'chrome-remote-interface';
import type { ElementRefMap } from '../browser/inspect/element-ref.js';
import { getStyles, formatStyles } from '../browser/inspect/styles.js';
import type { StylesResult } from '../browser/inspect/styles.js';

export interface StylesParams {
  ref: string;
  properties?: string[];
}

export interface StylesCommandResult {
  text: string;
  styles: StylesResult;
}

export async function executeStyles(
  client: Client,
  refMap: ElementRefMap,
  params: StylesParams
): Promise<StylesCommandResult> {
  const styles = await getStyles(client, refMap, params.ref, params.properties);
  const text = formatStyles(styles);
  return { text, styles };
}
