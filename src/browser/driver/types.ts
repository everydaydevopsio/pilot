import type { ConsoleBuffer } from '../../mcp/console-buffer.js';
import type { ElementRefMap } from '../inspect/element-ref.js';
import type { DialogQueue } from '../interaction/dialogs.js';
import type { DownloadTracker } from '../interaction/downloads.js';
import type { NetworkBuffer } from '../network/network-buffer.js';
import type { TraceState } from '../performance/trace.js';
import type { LaunchOptions, SessionInfo, TabInfo } from '../types.js';
import type { ViewportConfig } from '../../viewport.js';
import type { CheckParams, CheckResult } from '../../commands/check.js';
import type { ClickParams, ClickResult } from '../../commands/click.js';
import type { DialogParams, DialogResult } from '../../commands/dialog.js';
import type {
  EvaluateParams,
  EvaluateResult
} from '../../commands/evaluate.js';
import type { FillParams, FillResult } from '../../commands/fill.js';
import type { FindCommandResult, FindQuery } from '../../commands/find.js';
import type { HoverParams, HoverResult } from '../../commands/hover.js';
import type {
  NavigateParams,
  NavigateResult
} from '../../commands/navigate.js';
import type { NetworkParams, NetworkResult } from '../../commands/network.js';
import type { PageInfoResult } from '../../commands/page_info.js';
import type {
  PerformanceParams,
  PerformanceResult
} from '../../commands/performance.js';
import type {
  PressKeyParams,
  PressKeyResult
} from '../../commands/press_key.js';
import type {
  ScreenshotParams,
  ScreenshotResult
} from '../../commands/screenshot.js';
import type { ScrollParams, ScrollResult } from '../../commands/scroll.js';
import type { SelectParams, SelectResult } from '../../commands/select.js';
import type { SnapshotCommandResult } from '../../commands/snapshot.js';
import type {
  StylesCommandResult,
  StylesParams
} from '../../commands/styles.js';
import type { NewTabResult } from '../../commands/tabs.js';
import type { TypeParams, TypeResult } from '../../commands/type.js';
import type { UploadParams, UploadResult } from '../../commands/upload.js';
import type { WaitParams, WaitResult } from '../../commands/wait.js';

/** Browsers Pilot knows about. Only `chrome` has a driver today. */
export const BROWSER_KINDS = ['chrome', 'firefox', 'safari', 'webkit'] as const;
export type BrowserKind = (typeof BROWSER_KINDS)[number];

/**
 * Features a driver may or may not provide. Each MCP tool declares the
 * capabilities it needs (see capabilities.ts); a tool whose capabilities the
 * active driver lacks fails with a CapabilityError before touching the browser.
 */
export const CAPABILITIES = [
  'tabs',
  'navigation',
  'evaluate',
  'input',
  'screenshot',
  'viewport',
  'accessibilitySnapshot',
  'styles',
  'console',
  'network',
  'dialogs',
  'uploads',
  'downloads',
  'performanceTrace',
  'connectExisting'
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Per-session buffers shared between a driver and the MCP tools. The driver
 * fills them from browser events; tools such as browser_console read them
 * directly.
 */
export interface DriverSession {
  consoleBuffer: ConsoleBuffer;
  elementRefMap: ElementRefMap;
  networkBuffer: NetworkBuffer;
  dialogQueue: DialogQueue;
  downloadTracker: DownloadTracker;
  traceState: TraceState;
}

export interface ConnectExistingOptions {
  host?: string;
  port?: number;
}

export interface ViewportResizeParams {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
}

/**
 * Browser-agnostic surface the MCP tools call. Each implementation owns its
 * protocol (CDP, WebDriver BiDi, ...) and must not leak protocol types here.
 */
export interface BrowserDriver {
  readonly kind: BrowserKind;
  readonly capabilities: ReadonlySet<Capability>;

  // Lifecycle
  launch(
    opts?: LaunchOptions
  ): Promise<{ headless: boolean; viewport: string }>;
  connectExisting(opts: ConnectExistingOptions): Promise<{ tabs: TabInfo[] }>;
  destroy(): Promise<void>;
  isConnected(): boolean;
  getSessionInfo(): SessionInfo;

  // Tabs
  listTabs(): Promise<TabInfo[]>;
  newTab(url?: string): Promise<NewTabResult>;
  closeTab(targetId: string): Promise<void>;
  switchTab(targetId: string): Promise<void>;

  // Page
  navigate(params: NavigateParams): Promise<NavigateResult>;
  pageInfo(): Promise<PageInfoResult>;
  evaluate(params: EvaluateParams): Promise<EvaluateResult>;
  wait(params: WaitParams): Promise<WaitResult>;
  screenshot(params: ScreenshotParams): Promise<ScreenshotResult>;
  resizeViewport(params: ViewportResizeParams): Promise<ViewportConfig>;

  // Inspection
  snapshot(): Promise<SnapshotCommandResult>;
  find(query: FindQuery): Promise<FindCommandResult>;
  styles(params: StylesParams): Promise<StylesCommandResult>;

  // Input
  click(params: ClickParams): Promise<ClickResult>;
  type(params: TypeParams): Promise<TypeResult>;
  fill(params: FillParams): Promise<FillResult>;
  hover(params: HoverParams): Promise<HoverResult>;
  pressKey(params: PressKeyParams): Promise<PressKeyResult>;
  select(params: SelectParams): Promise<SelectResult>;
  check(params: CheckParams): Promise<CheckResult>;
  scroll(params: ScrollParams): Promise<ScrollResult>;

  // Files and dialogs
  dialog(params: DialogParams): Promise<DialogResult>;
  upload(params: UploadParams): Promise<UploadResult>;

  // Diagnostics
  network(params: NetworkParams): Promise<NetworkResult>;
  performance(params: PerformanceParams): Promise<PerformanceResult>;
}
