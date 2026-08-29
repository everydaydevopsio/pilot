import { formatPerformanceSummary } from '../../../src/browser/performance/analyze.js';
import type { PerformanceSummary } from '../../../src/browser/performance/types.js';

describe('formatPerformanceSummary', () => {
  it('formats empty summary', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {},
      metrics: {},
      longTasks: [],
      slowRequests: [],
      largeResources: []
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('Performance Summary');
    expect(text).toContain('no timing data captured');
  });

  it('shows navigation timing including 0ms values', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {
        domContentLoaded: 0,
        load: 150,
        firstPaint: 80,
        firstContentfulPaint: 120
      },
      metrics: {},
      longTasks: [],
      slowRequests: [],
      largeResources: []
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('DOMContentLoaded: 0ms');
    expect(text).toContain('Load: 150ms');
    expect(text).toContain('First Paint: 80ms');
    expect(text).toContain('First Contentful Paint: 120ms');
    expect(text).not.toContain('no timing data captured');
  });

  it('shows key metrics', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {},
      metrics: {
        JSHeapUsedSize: 10240000,
        Documents: 5,
        ScriptDuration: 0.5
      },
      longTasks: [],
      slowRequests: [],
      largeResources: []
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('Key Metrics');
    expect(text).toContain('JSHeapUsedSize: 10000 KB');
    expect(text).toContain('Documents: 5');
    expect(text).toContain('ScriptDuration: 500 ms');
  });

  it('shows long tasks', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {},
      metrics: {},
      longTasks: [
        { name: 'RunTask', duration: 200, startTime: 100 },
        { name: 'RunTask', duration: 80, startTime: 300 }
      ],
      slowRequests: [],
      largeResources: []
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('Long Tasks (>50ms): 2');
    expect(text).toContain('RunTask: 200ms');
  });

  it('shows slow requests', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {},
      metrics: {},
      longTasks: [],
      slowRequests: [
        { url: 'https://api.test/slow', duration: 2500, method: 'POST' }
      ],
      largeResources: []
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('Slow Requests (>1000ms): 1');
    expect(text).toContain('POST https://api.test/slow: 2500ms');
  });

  it('shows large resources with URL', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {},
      metrics: {},
      longTasks: [],
      slowRequests: [],
      largeResources: [{ url: 'https://cdn.test/bundle.js', size: 1048576 }]
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('Large Resources (>500KB): 1');
    expect(text).toContain('1024KB https://cdn.test/bundle.js');
  });

  it('shows JS execution time and trace count', () => {
    const summary: PerformanceSummary = {
      navigationTiming: {},
      metrics: {},
      longTasks: [],
      slowRequests: [],
      largeResources: [],
      totalJsExecutionMs: 350,
      traceEventCount: 5000
    };
    const text = formatPerformanceSummary(summary);
    expect(text).toContain('Total JS Execution: 350ms');
    expect(text).toContain('Trace events processed: 5000');
  });
});
