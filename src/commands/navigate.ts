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
  // not whichever image or script happened to finish last. Track the last
  // main-frame commit too, so a client-side redirect before load reports the
  // document whose load we waited for rather than the one Page.navigate started.
  const documentResponses: Array<{
    loaderId: string;
    frameId?: string;
    status: number;
  }> = [];
  let committedLoaderId: string | undefined;
  const stopCommits = client.Page.frameNavigated(({ frame }) => {
    if (!frame.parentId) committedLoaderId = frame.loaderId;
  });
  const stopResponses = client.Network.responseReceived((event) => {
    if (event.type === 'Document' && event.response.status) {
      documentResponses.push({
        loaderId: event.loaderId,
        frameId: event.frameId,
        status: event.response.status
      });
    }
  });

  // The timer and the page-event listener live outside the promise so the
  // finally block can release them however the navigation ends, including
  // when Page.navigate throws and the promise is never awaited.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopPageEvent: (() => void) | undefined;
  const readHref = () =>
    client.Runtime.evaluate({ expression: 'window.location.href' }).then(
      (r) => ({ url: (r.result.value as string) ?? params.url })
    );

  const navigationPromise = new Promise<{ url: string }>((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('timeout'));
    }, params.timeoutMs);

    const cleanup = () => clearTimeout(timeout);
    const onPageEvent = () => {
      cleanup();
      readHref().then(resolve, reject);
    };

    if (params.waitUntil === 'load') {
      stopPageEvent = client.Page.loadEventFired(onPageEvent);
    } else if (params.waitUntil === 'domcontentloaded') {
      stopPageEvent = client.Page.domContentEventFired(onPageEvent);
    } else {
      // networkidle
      manager
        .waitForNetworkIdle(params.timeoutMs)
        .then(() => {
          cleanup();
          return readHref();
        })
        .then(resolve)
        .catch((err: unknown) => {
          cleanup();
          reject(err);
        });
    }
  });
  // If Page.navigate throws, nothing awaits this promise; keep a late
  // rejection from surfacing as an unhandled rejection.
  navigationPromise.catch(() => undefined);

  try {
    const { frameId, loaderId } = await client.Page.navigate({
      url: params.url
    });
    const { url } = await navigationPromise;
    const byLoader = (id: string | undefined) =>
      id ? documentResponses.find((r) => r.loaderId === id) : undefined;
    const document =
      byLoader(committedLoaderId) ??
      byLoader(loaderId) ??
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
    clearTimeout(timeout);
    stopPageEvent?.();
    stopResponses();
    stopCommits();
  }
}
