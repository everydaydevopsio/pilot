import type { Client } from 'chrome-remote-interface';

export interface PageInfoResult {
  url: string;
  title: string;
  readyState: string;
}

export async function executePageInfo(client: Client): Promise<PageInfoResult> {
  const result = await client.Runtime.evaluate({
    expression: `JSON.stringify({
      url: window.location.href,
      title: document.title,
      readyState: document.readyState
    })`,
    returnByValue: true
  });

  const value = result.result.value as string;
  return JSON.parse(value) as PageInfoResult;
}
