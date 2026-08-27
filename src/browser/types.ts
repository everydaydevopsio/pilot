import type { Client } from 'chrome-remote-interface';

export type BrowserEventCallback = (event: string, data: unknown) => void;

export interface TabInfo {
  targetId: string;
  url: string;
  title: string;
  active: boolean;
}

export interface BrowserState {
  client: Client | null;
  targetId: string | null;
  url: string | null;
  connected: boolean;
}

export interface LaunchOptions {
  headless?: boolean;
  chromePath?: string;
  profileName?: string;
  viewport?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  deviceScaleFactor?: number;
  responsive?: boolean;
}

export type SandboxDecision =
  { disable: false } | { disable: true; reason: 'env_override' | 'root_user' };
