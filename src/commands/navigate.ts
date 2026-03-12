import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';
import type { BrowserManager } from '../browser.js';

export const NavigateParamsSchema = z.object({
  url: z.string().url(),
  waitUntil: z
    .enum(['load', 'domcontentloaded', 'networkidle'])
    .default('load'),
  timeoutMs: z.number().int().positive().default(30000)
});

export type NavigateParams = z.infer<typeof NavigateParamsSchema>;

export interface NavigateResult {
  url: string;
  status: number;
}

export async function executeNavigate(
  client: Client,
  manager: BrowserManager,
  params: NavigateParams
): Promise<NavigateResult> {
  let finalStatus = 200;

  const navigationPromise = new Promise<{ url: string; status: number }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('timeout'));
      }, params.timeoutMs);

      const cleanup = () => clearTimeout(timeout);

      if (params.waitUntil === 'load') {
        client.Page.loadEventFired(() => {
          cleanup();
          client.Runtime.evaluate({ expression: 'window.location.href' }).then(
            (r) => {
              resolve({
                url: (r.result.value as string) ?? params.url,
                status: finalStatus
              });
            },
            reject
          );
        });
      } else if (params.waitUntil === 'domcontentloaded') {
        client.Page.domContentEventFired(() => {
          cleanup();
          client.Runtime.evaluate({ expression: 'window.location.href' }).then(
            (r) => {
              resolve({
                url: (r.result.value as string) ?? params.url,
                status: finalStatus
              });
            },
            reject
          );
        });
      } else {
        // networkidle
        manager
          .waitForNetworkIdle(params.timeoutMs)
          .then(() => {
            cleanup();
            return client.Runtime.evaluate({
              expression: 'window.location.href'
            });
          })
          .then((r) => {
            resolve({
              url: (r.result.value as string) ?? params.url,
              status: finalStatus
            });
          })
          .catch((err: unknown) => {
            cleanup();
            reject(err);
          });
      }
    }
  );

  // Capture the response status
  const responseHandler = (params: {
    response: { url: string; status: number };
  }) => {
    if (params.response.url === params.response.url && params.response.status) {
      finalStatus = params.response.status;
    }
  };
  client.Network.responseReceived(responseHandler);

  const { frameId } = await client.Page.navigate({ url: params.url });
  void frameId; // used implicitly

  try {
    const result = await navigationPromise;
    return result;
  } finally {
    // Event listeners are auto-removed when client disconnects;
    // for long-lived clients this is acceptable for v0.1
  }
}
