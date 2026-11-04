# Changelog

## [0.7.0] - 2026-11-04

### Highlights

- Browser MCP tools now run through a shared `BrowserDriver`, with capability checks to gate tool access based on driver support. (#63)

### Fixes

- No standalone bug fixes are included in this release.

### Changes

- Updated agent guidance to require releases through the `publish.yml` workflow. (#57)

**Full changelog:** [0.6.3...0.7.0](../../compare/0.6.3...0.7.0)

## [0.6.3] - 2026-11-03

This release adds browser session management tools and improves Chrome startup, recovery, and shutdown reliability.

### Highlights

- **New MCP tools:** `browser_status` and `browser_stop_all` let you inspect browser session status and stop all browser sessions. Both tools are included in the tool allowlist. (#56)
- **More resilient startup:** Chrome startup now fails promptly if the process exits, while a longer default timeout gives slower launches more time to complete. (#53)

### Fixes

- **Safer session shutdown:** Verify the Chrome executable and recheck process identity before each signal. A browser is reported as stopped only after its exit is confirmed, and lock cleanup failures are surfaced. (#56)
- **Better startup recovery:** Clean up failed launches, clear launch state when Chrome cannot be spawned, and provide clearer explanations of profile conflicts. (#53, #55)

### Changes

- Strengthened tests for launch-timeout cleanup on slow machines and removal of dangling `SingletonLock` symlinks. (#55, #56)
- Updated `make setup` to install pre-commit hooks and corrected changelog formatting to pass CI checks. (#51, #52)
- Updated runtime dependencies:
  - `@modelcontextprotocol/sdk`: 1.30.1 → 1.32.2
  - `pino`: 10.3.1 → 10.4.0
  - `zod`: 4.6.5 → 4.6.7
- Refreshed development tooling, including `ts-jest`, `globals`, and `pino-pretty`.

**Full changelog:** [0.6.2…0.6.3](../../compare/0.6.2...0.6.3)

## [0.6.2] - 2026-10-01

### Highlights

- Added release-note generation with **Castoff**. (#38; addresses #37)

### Fixes

- No standalone bug fixes were recorded in this release.

### Changes

- **Runtime dependencies:** Updated `@modelcontextprotocol/sdk` from 1.30.0 to 1.30.1 and `zod` from 4.4.3 to 4.6.5. (#36, #21, #31)
- **Testing:** Updated Jest from 30.4.2 to 30.5.1, alongside additional testing dependency updates. (#19, #27, #35)
- **Development tooling:** Updated `tsx` from 4.23.12 to 4.23.15 and `globals` from 17.11.0 to 17.12.0, alongside a grouped update to three development dependencies. (#22, #33, #28, #34)
- **CI:** Upgraded `actions/upload-artifact` from v6 to v7. (#26)

**Full changelog:** [0.6.1 → 0.6.2](../../compare/0.6.1...0.6.2)

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
