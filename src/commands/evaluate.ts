import { z } from 'zod';
import type { Client } from 'chrome-remote-interface';

export const EvaluateParamsSchema = z.object({
  expression: z.string(),
  awaitPromise: z.boolean().default(true),
  timeoutMs: z.number().int().positive().default(10000)
});

export type EvaluateParams = z.infer<typeof EvaluateParamsSchema>;

export interface EvaluateResult {
  value: unknown;
  type: string;
}

export async function executeEvaluate(
  client: Client,
  params: EvaluateParams
): Promise<EvaluateResult> {
  const result = await Promise.race([
    client.Runtime.evaluate({
      expression: params.expression,
      awaitPromise: params.awaitPromise,
      returnByValue: true,
      userGesture: true
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), params.timeoutMs)
    )
  ]);

  if (result.exceptionDetails) {
    const msg =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      'evaluation error';
    throw new Error(msg);
  }

  return {
    value: result.result.value,
    type: result.result.type
  };
}
