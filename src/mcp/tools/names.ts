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
  'browser_get_console_logs',
  'browser_get_errors',
  'browser_clear_errors'
] as const;

export type ToolName = (typeof EXPECTED_TOOLS)[number];
