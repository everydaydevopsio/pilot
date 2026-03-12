import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';
import type { BrowserManager } from '../browser.js';

export const WaitParamsSchema = z
  .object({
    selector: z.string().optional(),
    selectorVisible: z.string().optional(),
    networkIdle: z.boolean().optional(),
    ms: z.number().int().min(0).optional(),
    timeoutMs: z.number().int().positive().default(10000)
  })
  .refine(
    (v) =>
      v.selector !== undefined ||
      v.selectorVisible !== undefined ||
      v.networkIdle !== undefined ||
      v.ms !== undefined,
    { message: 'At least one wait condition is required' }
  );

export type WaitParams = z.infer<typeof WaitParamsSchema>;

export interface WaitResult {
  ok: boolean;
  elapsed: number;
}

async function waitForSelectorPresent(
  client: Client,
  selector: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.Runtime.evaluate({
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true
    });
    if (result.result.value === true) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for selector: ${selector}`);
}

async function waitForSelectorVisible(
  client: Client,
  selector: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await client.Runtime.evaluate({
      expression: `(function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })()`,
      returnByValue: true
    });
    if (result.result.value === true) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for visible selector: ${selector}`);
}

export async function executeWait(
  client: Client,
  manager: BrowserManager,
  params: WaitParams
): Promise<WaitResult> {
  const start = Date.now();

  if (params.ms !== undefined) {
    await new Promise((r) => setTimeout(r, params.ms));
  } else if (params.selector !== undefined) {
    await waitForSelectorPresent(client, params.selector, params.timeoutMs);
  } else if (params.selectorVisible !== undefined) {
    await waitForSelectorVisible(
      client,
      params.selectorVisible,
      params.timeoutMs
    );
  } else if (params.networkIdle) {
    await manager.waitForNetworkIdle(params.timeoutMs);
  }

  return { ok: true, elapsed: Date.now() - start };
}
