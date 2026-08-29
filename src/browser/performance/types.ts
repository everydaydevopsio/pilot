export interface NavigationTiming {
  domContentLoaded?: number;
  load?: number;
  firstPaint?: number;
  firstContentfulPaint?: number;
}

export interface LongTask {
  name: string;
  duration: number;
  startTime: number;
}

export interface SlowRequest {
  url: string;
  duration: number;
  method?: string;
}

export interface LargeResource {
  url: string;
  size: number;
  type?: string;
}

export interface PerformanceSummary {
  navigationTiming: NavigationTiming;
  metrics: Record<string, number>;
  longTasks: LongTask[];
  slowRequests: SlowRequest[];
  largeResources: LargeResource[];
  totalJsExecutionMs?: number;
  traceEventCount?: number;
}
