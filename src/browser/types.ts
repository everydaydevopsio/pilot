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
  firefoxPath?: string;
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
  /** launched: browser started by this session; external: browser_connect. */
  mode: 'launched' | 'external' | 'none';
  connected: boolean;
  profile?: string;
  userDataDir?: string;
  pid?: number;
  host?: string;
  cdpPort?: number;
  /** WebDriver BiDi port (Firefox). */
  bidiPort?: number;
}

export type SandboxDecision =
  { disable: false } | { disable: true; reason: 'env_override' | 'root_user' };
