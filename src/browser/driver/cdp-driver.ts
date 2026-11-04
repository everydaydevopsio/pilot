import type { Client } from 'chrome-remote-interface';
import { BrowserManager } from '../browser-manager.js';
import type { LaunchOptions, SessionInfo, TabInfo } from '../types.js';
import { resetCssState } from '../inspect/styles.js';
import { attachDialogHandler } from '../interaction/dialogs.js';
import {
  attachDownloadHandler,
  enableDownloads
} from '../interaction/downloads.js';
import { attachNetworkMonitor } from '../network/network-monitor.js';
import type { ConsoleMessage } from '../../mcp/console-buffer.js';
import type { Config } from '../../util/config.js';
import { applyViewport, type ViewportConfig } from '../../viewport.js';
import { executeCheck, type CheckParams } from '../../commands/check.js';
import { executeClick, type ClickParams } from '../../commands/click.js';
import { executeDialog, type DialogParams } from '../../commands/dialog.js';
import {
  executeEvaluate,
  type EvaluateParams
} from '../../commands/evaluate.js';
import { executeFill, type FillParams } from '../../commands/fill.js';
import { executeFind, type FindQuery } from '../../commands/find.js';
import { executeHover, type HoverParams } from '../../commands/hover.js';
import {
  executeNavigate,
  type NavigateParams
} from '../../commands/navigate.js';
import { executeNetwork, type NetworkParams } from '../../commands/network.js';
import { executePageInfo } from '../../commands/page_info.js';
import {
  executePerformance,
  type PerformanceParams
} from '../../commands/performance.js';
import {
  executePressKey,
  type PressKeyParams
} from '../../commands/press_key.js';
import {
  executeScreenshot,
  type ScreenshotParams
} from '../../commands/screenshot.js';
import { executeScroll, type ScrollParams } from '../../commands/scroll.js';
import { executeSelect, type SelectParams } from '../../commands/select.js';
import { executeSnapshot } from '../../commands/snapshot.js';
import { executeStyles, type StylesParams } from '../../commands/styles.js';
import {
  executeCloseTab,
  executeListTabs,
  executeNewTab,
  executeSwitchTab,
  type NewTabResult
} from '../../commands/tabs.js';
import { executeType, type TypeParams } from '../../commands/type.js';
import { executeUpload, type UploadParams } from '../../commands/upload.js';
import { executeWait, type WaitParams } from '../../commands/wait.js';
import {
  CAPABILITIES,
  type BrowserDriver,
  type Capability,
  type ConnectExistingOptions,
  type DriverSession,
  type ViewportResizeParams
} from './types.js';

const CDP_CAPABILITIES: ReadonlySet<Capability> = new Set(CAPABILITIES);

/**
 * Chrome driver over the Chrome DevTools Protocol. BrowserManager owns the
 * Chrome process and CDP connection; this class wires CDP events into the
 * session buffers and maps driver calls onto the CDP command implementations.
 */
export class CdpDriver implements BrowserDriver {
  readonly kind = 'chrome' as const;
  readonly capabilities = CDP_CAPABILITIES;
  private monitoredClient: Client | null = null;

  constructor(
    private readonly session: DriverSession,
    private readonly manager: BrowserManager
  ) {
    manager.setEventCallback((event, data) => this.onBrowserEvent(event, data));
  }

  static create(config: Config, session: DriverSession): CdpDriver {
    return new CdpDriver(session, new BrowserManager(config));
  }

  private onBrowserEvent(event: string, data: unknown): void {
    if (event === 'console_message') {
      this.session.consoleBuffer.push(data as ConsoleMessage);
    }
    if (event === 'page_navigated') {
      this.session.elementRefMap.invalidate();
    }
    if (event === 'browser_disconnected') {
      this.monitoredClient = null;
      resetCssState();
      this.session.dialogQueue.clear();
      this.session.downloadTracker.clear();
      return;
    }
    // Covers browser_connected and tab switches, which swap the CDP client
    // without emitting a connect event.
    this.ensureMonitors();
  }

  private ensureMonitors(): void {
    const client = this.manager.getClient();
    if (!client || client === this.monitoredClient) return;
    attachNetworkMonitor(client, this.session.networkBuffer);
    attachDialogHandler(client, this.session.dialogQueue);
    attachDownloadHandler(client, this.session.downloadTracker);
    void enableDownloads(client).catch(() => {
      // Download behavior setup may fail in some environments
    });
    this.monitoredClient = client;
  }

  private client(): Client {
    const client = this.manager.getClient();
    if (!client) {
      throw new Error('Browser not started. Call browser_start first.');
    }
    return client;
  }

  launch(opts?: LaunchOptions) {
    return this.manager.launch(opts);
  }

  connectExisting(opts: ConnectExistingOptions): Promise<{ tabs: TabInfo[] }> {
    return this.manager.connectExisting(opts);
  }

  destroy(): Promise<void> {
    return this.manager.destroy();
  }

  isConnected(): boolean {
    return this.manager.isConnected();
  }

  getSessionInfo(): SessionInfo {
    return { browser: this.kind, ...this.manager.getSessionInfo() };
  }

  listTabs(): Promise<TabInfo[]> {
    return executeListTabs(this.manager);
  }

  newTab(url?: string): Promise<NewTabResult> {
    return executeNewTab(this.manager, url);
  }

  closeTab(targetId: string): Promise<void> {
    return executeCloseTab(this.manager, targetId);
  }

  switchTab(targetId: string): Promise<void> {
    return executeSwitchTab(this.manager, targetId);
  }

  navigate(params: NavigateParams) {
    return executeNavigate(this.client(), this.manager, params);
  }

  pageInfo() {
    return executePageInfo(this.client());
  }

  evaluate(params: EvaluateParams) {
    return executeEvaluate(this.client(), params);
  }

  wait(params: WaitParams) {
    return executeWait(this.client(), this.manager, params);
  }

  screenshot(params: ScreenshotParams) {
    return executeScreenshot(this.client(), params);
  }

  async resizeViewport(params: ViewportResizeParams): Promise<ViewportConfig> {
    const client = this.client();
    const current = this.manager.getViewportConfig();
    const mobile = params.mobile ?? current?.mobile ?? false;
    const config: ViewportConfig = {
      width: params.width,
      height: params.height,
      deviceScaleFactor:
        params.deviceScaleFactor ?? current?.deviceScaleFactor ?? 1,
      mobile,
      responsive: false,
      ...(mobile && current?.userAgent && { userAgent: current.userAgent })
    };
    await applyViewport(client, config);
    this.manager.setViewportConfig(config);
    return config;
  }

  snapshot() {
    return executeSnapshot(this.client(), this.session.elementRefMap);
  }

  find(query: FindQuery) {
    return executeFind(this.client(), this.session.elementRefMap, query);
  }

  styles(params: StylesParams) {
    return executeStyles(this.client(), this.session.elementRefMap, params);
  }

  click(params: ClickParams) {
    return executeClick(this.client(), params, this.session.elementRefMap);
  }

  type(params: TypeParams) {
    return executeType(this.client(), params, this.session.elementRefMap);
  }

  fill(params: FillParams) {
    return executeFill(this.client(), this.session.elementRefMap, params);
  }

  hover(params: HoverParams) {
    return executeHover(this.client(), this.session.elementRefMap, params);
  }

  pressKey(params: PressKeyParams) {
    return executePressKey(this.client(), params);
  }

  select(params: SelectParams) {
    return executeSelect(this.client(), this.session.elementRefMap, params);
  }

  check(params: CheckParams) {
    return executeCheck(this.client(), this.session.elementRefMap, params);
  }

  scroll(params: ScrollParams) {
    return executeScroll(this.client(), this.session.elementRefMap, params);
  }

  dialog(params: DialogParams) {
    return executeDialog(this.client(), this.session.dialogQueue, params);
  }

  upload(params: UploadParams) {
    return executeUpload(this.client(), this.session.elementRefMap, params);
  }

  network(params: NetworkParams) {
    return executeNetwork(this.client(), this.session.networkBuffer, params);
  }

  performance(params: PerformanceParams) {
    return executePerformance(this.client(), this.session.traceState, params);
  }
}
