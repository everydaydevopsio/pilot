/**
 * Canonical list of MCP tool names registered by this server.
 * Shared between the smoke test and e2e test suite so both stay in sync.
 */
export const EXPECTED_TOOLS = [
  'browser_start',
  'browser_stop',
  'browser_screenshot',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_evaluate',
  'browser_wait',
  'browser_page_info',
  'browser_list_tabs',
  'browser_new_tab',
  'browser_close_tab',
  'browser_switch_tab',
  'browser_viewport_resize',
  'browser_get_console_logs',
  'browser_get_errors',
  'browser_clear_errors',
  'browser_snapshot',
  'browser_find',
  'browser_fill',
  'browser_hover',
  'browser_press_key',
  'browser_select',
  'browser_check',
  'browser_scroll',
  'browser_network',
  'browser_console',
  'browser_errors',
  'browser_styles'
] as const;

export type ToolName = (typeof EXPECTED_TOOLS)[number];
