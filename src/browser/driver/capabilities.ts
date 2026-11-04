import type { ToolName } from '../../mcp/tools/names.js';
import type { BrowserKind, Capability } from './types.js';

/**
 * Capabilities each MCP tool needs from the active driver. Tools mapped to an
 * empty list either manage the session itself (start/stop/status) or only read
 * buffers that every driver fills.
 */
export const TOOL_CAPABILITIES: Readonly<
  Record<ToolName, readonly Capability[]>
> = {
  browser_start: [],
  browser_stop: [],
  browser_status: [],
  browser_stop_all: [],
  browser_connect: ['connectExisting'],
  browser_screenshot: ['screenshot'],
  browser_navigate: ['navigation'],
  browser_click: ['input'],
  browser_type: ['input'],
  browser_evaluate: ['evaluate'],
  browser_wait: ['evaluate'],
  browser_page_info: ['evaluate'],
  browser_list_tabs: ['tabs'],
  browser_new_tab: ['tabs'],
  browser_close_tab: ['tabs'],
  browser_switch_tab: ['tabs'],
  browser_tabs: ['tabs'],
  browser_viewport_resize: ['viewport'],
  browser_get_console_logs: ['console'],
  browser_get_errors: ['console'],
  browser_clear_errors: ['console'],
  browser_console: ['console'],
  browser_errors: ['console'],
  browser_snapshot: ['accessibilitySnapshot'],
  browser_find: ['accessibilitySnapshot'],
  browser_fill: ['input'],
  browser_hover: ['input'],
  browser_press_key: ['input'],
  browser_select: ['input'],
  browser_check: ['input'],
  browser_scroll: ['input'],
  browser_network: ['network'],
  browser_styles: ['styles'],
  browser_dialog: ['dialogs'],
  browser_upload: ['uploads'],
  browser_downloads: ['downloads'],
  browser_performance: ['performanceTrace']
};

export class CapabilityError extends Error {
  constructor(
    readonly tool: ToolName,
    readonly browser: BrowserKind,
    readonly missing: readonly Capability[]
  ) {
    super(
      `${tool} is not supported by ${browser} (missing capabilities: ${missing.join(', ')}).`
    );
    this.name = 'CapabilityError';
  }
}

export function missingCapabilities(
  tool: ToolName,
  capabilities: ReadonlySet<Capability>
): Capability[] {
  return TOOL_CAPABILITIES[tool].filter((c) => !capabilities.has(c));
}

export function assertToolSupported(
  tool: ToolName,
  driver: { kind: BrowserKind; capabilities: ReadonlySet<Capability> }
): void {
  const missing = missingCapabilities(tool, driver.capabilities);
  if (missing.length > 0) {
    throw new CapabilityError(tool, driver.kind, missing);
  }
}

/** Tools the given capability set cannot run, for status and docs output. */
export function unsupportedTools(
  capabilities: ReadonlySet<Capability>
): ToolName[] {
  return (Object.keys(TOOL_CAPABILITIES) as ToolName[]).filter(
    (tool) => missingCapabilities(tool, capabilities).length > 0
  );
}
