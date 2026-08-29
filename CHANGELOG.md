# Changelog

## 0.6.0

Agent-oriented browser debugging and interaction release. Adds structured accessibility snapshots, element ref-based interaction, network/console/CSS inspection, file operations, performance tracing, security controls, and existing Chrome connection support.

### New Tools (18)

- **`browser_snapshot`** — Structured accessibility snapshot with element refs (e1, e2, ...)
- **`browser_find`** — Find elements by role, name, or text
- **`browser_fill`** — Replace form field value (React/Vue/Svelte compatible)
- **`browser_hover`** — Hover over element by ref or coordinates
- **`browser_press_key`** — Press key or combo (Enter, Tab, Control+a, Meta+c)
- **`browser_select`** — Select option by value, label, or index
- **`browser_check`** — Toggle checkbox/radio
- **`browser_scroll`** — Scroll element into view, by direction, or absolute
- **`browser_network`** — List/get/clear captured network requests with header redaction
- **`browser_console`** — List/clear console messages with stack traces
- **`browser_errors`** — List/clear runtime errors and exceptions
- **`browser_styles`** — Inspect computed styles, CSS rules, and box model
- **`browser_dialog`** — Handle alert/confirm/prompt dialogs
- **`browser_upload`** — Upload files with path validation
- **`browser_downloads`** — Track file downloads (list/wait/clear)
- **`browser_performance`** — Start/stop tracing; analyze navigation timing, long tasks
- **`browser_connect`** — Connect to existing Chrome with remote debugging
- **`browser_tabs`** — Consolidated tab management (list/new/select/close)

### Enhanced Tools

- **`browser_click`** — Now accepts `ref` parameter alongside selector/coordinates
- **`browser_type`** — Now accepts `ref` parameter alongside selector
- **`browser_navigate`** — Origin security check before and after navigation (redirect protection)

### Architecture

- Split `src/browser.ts` (799 lines) into cohesive modules under `src/browser/`
- Element ref system: `ElementRefMap` with generation tracking, `STALE_ELEMENT_REFERENCE` errors
- Network buffer: ring buffer (~1000 records) with lazy body retrieval and header redaction
- Runtime exceptions: `Runtime.exceptionThrown` capture with full stack frames
- CSS inspection: lazy `CSS.enable()` per client via `WeakRef` tracking
- Dialog queue, download tracker, upload validation with allowed-root security
- Performance tracing: CDP Tracing + Performance.getMetrics with bounded analysis
- External Chrome lifecycle: `browser_stop` disconnects without killing external Chrome

### Security

- `PILOT_ALLOWED_ORIGINS` / `PILOT_BLOCKED_ORIGINS` — origin allow/block lists with wildcard support
- Block wins over allow; scheme-less patterns match host only
- Post-navigation redirect check — navigate to `about:blank` on violation
- `PILOT_REDACT_HEADERS` — configurable header redaction (default: Authorization, Cookie, Set-Cookie, X-Api-Key, Proxy-Authorization)
- `PILOT_UPLOAD_ROOTS` — allowed directories for file uploads

### Backward Compatibility

All 17 original 0.5.x tools remain working unchanged. Legacy tab tools (`browser_list_tabs`, `browser_new_tab`, `browser_close_tab`, `browser_switch_tab`) and error tools (`browser_get_console_logs`, `browser_get_errors`, `browser_clear_errors`) are preserved.

## 0.5.2

- Upgraded Ballast to v5.17.2
- Fixed headless default behavior

## 0.5.1

- Initial public release
