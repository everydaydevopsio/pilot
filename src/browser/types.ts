import type { Client } from 'chrome-remote-interface';
import type { BrowserKind } from './driver/types.js';

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
  startupTimeoutMs?: number;
}

export interface SessionInfo {
  /** Browser the session drives; set by the driver. */
  browser?: BrowserKind;
  /** launched: Chrome started by this session; external: browser_connect. */
  mode: 'launched' | 'external' | 'none';
  connected: boolean;
  profile?: string;
  userDataDir?: string;
  pid?: number;
  host?: string;
  cdpPort?: number;
}

export type SandboxDecision =
  { disable: false } | { disable: true; reason: 'env_override' | 'root_user' };
