import type { Client } from 'chrome-remote-interface';
import type {
  PerformanceSummary,
  NavigationTiming,
  LongTask,
  SlowRequest,
  LargeResource
} from './types.js';

const LONG_TASK_THRESHOLD_MS = 50;
const SLOW_REQUEST_THRESHOLD_MS = 1000;
const LARGE_RESOURCE_THRESHOLD_BYTES = 500 * 1024;
const MAX_ENTRIES = 100;

interface TraceEvent {
  cat?: string;
  name?: string;
  ph?: string;
  dur?: number;
  ts?: number;
  args?: Record<string, unknown>;
}

function findNavigationStart(events: TraceEvent[]): number {
  for (const event of events) {
    if (event.name === 'navigationStart' && event.ts) {
      return event.ts;
    }
  }
  // Fallback: earliest timestamp in the trace
  let earliest = Infinity;
  for (const event of events) {
    if (event.ts && event.ts < earliest) {
      earliest = event.ts;
    }
  }
  return earliest === Infinity ? 0 : earliest;
}

function extractNavigationTiming(events: TraceEvent[]): NavigationTiming {
  const timing: NavigationTiming = {};
  const baseTs = findNavigationStart(events);

  for (const event of events) {
    if (event.name === 'domContentLoadedEventEnd' && event.ts !== undefined) {
      timing.domContentLoaded = (event.ts - baseTs) / 1000;
    }
    if (event.name === 'loadEventEnd' && event.ts !== undefined) {
      timing.load = (event.ts - baseTs) / 1000;
    }
    if (event.name === 'firstPaint' && event.ts !== undefined) {
      timing.firstPaint = (event.ts - baseTs) / 1000;
    }
    if (event.name === 'firstContentfulPaint' && event.ts !== undefined) {
      timing.firstContentfulPaint = (event.ts - baseTs) / 1000;
    }
  }

  return timing;
}

function extractLongTasks(events: TraceEvent[]): LongTask[] {
  const tasks: LongTask[] = [];

  for (const event of events) {
    if (
      event.name === 'RunTask' &&
      event.ph === 'X' &&
      event.dur &&
      event.dur / 1000 > LONG_TASK_THRESHOLD_MS
    ) {
      tasks.push({
        name: event.name,
        duration: Math.round(event.dur / 1000),
        startTime: event.ts ? Math.round(event.ts / 1000) : 0
      });
    }
  }

  return tasks.sort((a, b) => b.duration - a.duration).slice(0, MAX_ENTRIES);
}

function extractSlowRequests(events: TraceEvent[]): SlowRequest[] {
  const requests = new Map<
    string,
    { url: string; start: number; end?: number; method?: string }
  >();

  for (const event of events) {
    if (event.name === 'ResourceSendRequest' && event.args) {
      const data = event.args.data as
        | { requestId?: string; url?: string; requestMethod?: string }
        | undefined;
      if (data?.requestId && data.url) {
        requests.set(data.requestId, {
          url: data.url,
          start: event.ts ?? 0,
          method: data.requestMethod
        });
      }
    }
    if (event.name === 'ResourceFinish' && event.args) {
      const data = event.args.data as { requestId?: string } | undefined;
      if (data?.requestId) {
        const req = requests.get(data.requestId);
        if (req) {
          req.end = event.ts;
        }
      }
    }
  }

  const slow: SlowRequest[] = [];
  for (const req of requests.values()) {
    if (req.end) {
      const duration = Math.round((req.end - req.start) / 1000);
      if (duration > SLOW_REQUEST_THRESHOLD_MS) {
        slow.push({ url: req.url, duration, method: req.method });
      }
    }
  }

  return slow.sort((a, b) => b.duration - a.duration).slice(0, MAX_ENTRIES);
}

function extractLargeResources(events: TraceEvent[]): LargeResource[] {
  // Build a requestId → URL map from ResourceSendRequest events
  const urlMap = new Map<string, string>();
  for (const event of events) {
    if (event.name === 'ResourceSendRequest' && event.args) {
      const data = event.args.data as
        { requestId?: string; url?: string } | undefined;
      if (data?.requestId && data.url) {
        urlMap.set(data.requestId, data.url);
      }
    }
  }

  const resources: LargeResource[] = [];
  for (const event of events) {
    if (event.name === 'ResourceFinish' && event.args) {
      const data = event.args.data as
        { decodedBodyLength?: number; requestId?: string } | undefined;
      if (
        data?.decodedBodyLength &&
        data.decodedBodyLength > LARGE_RESOURCE_THRESHOLD_BYTES
      ) {
        resources.push({
          url: (data.requestId && urlMap.get(data.requestId)) || '',
          size: data.decodedBodyLength
        });
      }
    }
  }

  return resources.sort((a, b) => b.size - a.size).slice(0, MAX_ENTRIES);
}

function extractJsExecutionTime(events: TraceEvent[]): number {
  let totalUs = 0;
  for (const event of events) {
    if (event.cat?.includes('v8') && event.ph === 'X' && event.dur) {
      totalUs += event.dur;
    }
  }
  return Math.round(totalUs / 1000);
}

export async function analyzePerformance(
  client: Client,
  traceEvents: unknown[]
): Promise<PerformanceSummary> {
  // Get current performance metrics from CDP
  const { metrics: rawMetrics } = await client.Performance.getMetrics();
  const metrics: Record<string, number> = {};
  for (const m of rawMetrics) {
    metrics[m.name] = m.value;
  }

  const events = traceEvents as TraceEvent[];

  return {
    navigationTiming: extractNavigationTiming(events),
    metrics,
    longTasks: extractLongTasks(events),
    slowRequests: extractSlowRequests(events),
    largeResources: extractLargeResources(events),
    totalJsExecutionMs: extractJsExecutionTime(events),
    traceEventCount: events.length
  };
}

export function formatPerformanceSummary(summary: PerformanceSummary): string {
  const lines: string[] = ['Performance Summary:\n'];

  // Navigation timing — use explicit undefined checks so 0ms values are shown
  const nt = summary.navigationTiming;
  lines.push('Navigation Timing:');
  if (nt.domContentLoaded !== undefined)
    lines.push(`  DOMContentLoaded: ${Math.round(nt.domContentLoaded)}ms`);
  if (nt.load !== undefined) lines.push(`  Load: ${Math.round(nt.load)}ms`);
  if (nt.firstPaint !== undefined)
    lines.push(`  First Paint: ${Math.round(nt.firstPaint)}ms`);
  if (nt.firstContentfulPaint !== undefined)
    lines.push(
      `  First Contentful Paint: ${Math.round(nt.firstContentfulPaint)}ms`
    );
  if (
    nt.domContentLoaded === undefined &&
    nt.load === undefined &&
    nt.firstPaint === undefined &&
    nt.firstContentfulPaint === undefined
  ) {
    lines.push('  (no timing data captured)');
  }

  // Key metrics
  const keyMetrics = [
    'JSHeapUsedSize',
    'JSHeapTotalSize',
    'Documents',
    'Frames',
    'LayoutCount',
    'RecalcStyleCount',
    'ScriptDuration',
    'TaskDuration'
  ];
  const hasMetrics = keyMetrics.some((k) => summary.metrics[k] !== undefined);
  if (hasMetrics) {
    lines.push('');
    lines.push('Key Metrics:');
    for (const k of keyMetrics) {
      if (summary.metrics[k] !== undefined) {
        let val = summary.metrics[k];
        let unit = '';
        if (k.includes('Size')) {
          val = Math.round(val / 1024);
          unit = ' KB';
        } else if (k.includes('Duration')) {
          val = Math.round(val * 1000);
          unit = ' ms';
        }
        lines.push(`  ${k}: ${val}${unit}`);
      }
    }
  }

  // JS execution time
  if (summary.totalJsExecutionMs) {
    lines.push('');
    lines.push(`Total JS Execution: ${summary.totalJsExecutionMs}ms`);
  }

  // Long tasks
  if (summary.longTasks.length > 0) {
    lines.push('');
    lines.push(
      `Long Tasks (>${LONG_TASK_THRESHOLD_MS}ms): ${summary.longTasks.length}`
    );
    for (const t of summary.longTasks.slice(0, 10)) {
      lines.push(`  ${t.name}: ${t.duration}ms`);
    }
    if (summary.longTasks.length > 10) {
      lines.push(`  ... and ${summary.longTasks.length - 10} more`);
    }
  }

  // Slow requests
  if (summary.slowRequests.length > 0) {
    lines.push('');
    lines.push(
      `Slow Requests (>${SLOW_REQUEST_THRESHOLD_MS}ms): ${summary.slowRequests.length}`
    );
    for (const r of summary.slowRequests.slice(0, 10)) {
      lines.push(`  ${r.method ?? 'GET'} ${r.url}: ${r.duration}ms`);
    }
  }

  // Large resources
  if (summary.largeResources.length > 0) {
    lines.push('');
    lines.push(
      `Large Resources (>${Math.round(LARGE_RESOURCE_THRESHOLD_BYTES / 1024)}KB): ${summary.largeResources.length}`
    );
    for (const r of summary.largeResources.slice(0, 10)) {
      lines.push(
        `  ${Math.round(r.size / 1024)}KB ${r.url || '(unknown url)'}`
      );
    }
  }

  if (summary.traceEventCount) {
    lines.push('');
    lines.push(`Trace events processed: ${summary.traceEventCount}`);
  }

  return lines.join('\n');
}
