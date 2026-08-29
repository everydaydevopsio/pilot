import type { Client } from 'chrome-remote-interface';
import {
  type TraceState,
  startTrace,
  stopTrace
} from '../browser/performance/trace.js';
import {
  analyzePerformance,
  formatPerformanceSummary
} from '../browser/performance/analyze.js';

export type PerformanceAction = 'start' | 'stop' | 'analyze';

export interface PerformanceParams {
  action: PerformanceAction;
}

export interface PerformanceResult {
  action: PerformanceAction;
  text: string;
}

export async function executePerformance(
  client: Client,
  traceState: TraceState,
  params: PerformanceParams
): Promise<PerformanceResult> {
  switch (params.action) {
    case 'start': {
      await client.Performance.enable();
      await startTrace(client, traceState);
      return { action: 'start', text: 'Performance tracing started.' };
    }

    case 'stop': {
      await stopTrace(client, traceState);
      return {
        action: 'stop',
        text: `Tracing stopped. ${traceState.events.length} events captured. Use action="analyze" to view summary.`
      };
    }

    case 'analyze': {
      const summary = await analyzePerformance(client, traceState.events);
      return {
        action: 'analyze',
        text: formatPerformanceSummary(summary)
      };
    }
  }
}
