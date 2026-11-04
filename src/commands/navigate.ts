import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';
import type { BrowserManager } from '../browser.js';
import { checkOrigin } from '../browser/security/origins.js';

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
  // Check origin policy before navigation
  const originCheck = checkOrigin(params.url);
  if (!originCheck.allowed) {
    throw new Error(
      originCheck.reason ?? 'Navigation blocked by origin policy'
    );
  }

  // Collect document responses so the status reported is the navigated page's,
  // not whichever image or script happened to finish last.
  const documentResponses: Array<{
    loaderId: string;
    frameId?: string;
    status: number;
  }> = [];
  const stopListening = client.Network.responseReceived((event) => {
    if (event.type === 'Document' && event.response.status) {
      documentResponses.push({
        loaderId: event.loaderId,
        frameId: event.frameId,
        status: event.response.status
      });
    }
  });

  const navigationPromise = new Promise<{ url: string }>((resolve, reject) => {
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
              url: (r.result.value as string) ?? params.url
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
              url: (r.result.value as string) ?? params.url
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
            url: (r.result.value as string) ?? params.url
          });
        })
        .catch((err: unknown) => {
          cleanup();
          reject(err);
        });
    }
  });

  try {
    const { frameId, loaderId } = await client.Page.navigate({
      url: params.url
    });
    const { url } = await navigationPromise;
    const document =
      documentResponses.find((r) => loaderId && r.loaderId === loaderId) ??
      documentResponses.filter((r) => r.frameId === frameId).at(-1);
    const result = { url, status: document?.status ?? 200 };

    // Check final URL after redirects — block if redirected to a blocked origin
    const finalCheck = checkOrigin(result.url);
    if (!finalCheck.allowed) {
      // Navigate away from the blocked origin
      await client.Page.navigate({ url: 'about:blank' });
      throw new Error(
        `Redirect landed on blocked origin: ${finalCheck.reason}`
      );
    }

    return result;
  } finally {
    stopListening();
  }
}
