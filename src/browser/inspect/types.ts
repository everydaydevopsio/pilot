export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementInfo {
  ref: string;
  role: string;
  name: string;
  tag: string;
  type?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  selected?: boolean;
  expanded?: boolean;
  level?: number;
  visible: boolean;
  bounds?: ElementBounds;
  description?: string;
}

export interface SnapshotResult {
  url: string;
  title: string;
  timestamp: number;
  elements: ElementInfo[];
}

export interface StaleElementError {
  code: 'STALE_ELEMENT_REFERENCE';
  ref: string;
  message: string;
}
