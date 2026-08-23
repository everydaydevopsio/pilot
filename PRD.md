# PRD — pilot v0.5

## Overview

`pilot` is a lightweight Node.js/TypeScript MCP (Model Context Protocol)
server that gives AI agents DevTools-grade control over a Chrome instance. It launches
and manages Chrome via the Chrome DevTools Protocol (CDP) and exposes browser automation
as **MCP tools** that let an agent take screenshots, navigate, click, type, manage tabs,
run JavaScript, and inspect console logs — all through the standard MCP stdio transport.

It is published as `@everydaydevopsio/pilot` on npmjs and can be used
directly with Claude Code, or any MCP-compatible AI agent.

---

## Context and motivation

AI agents that interact with web applications need more than screenshots: they need to
act (click, type, navigate) and observe (console errors, page state) —
all without screen-scraping a VNC stream or relying on browser extensions.

`pilot` bridges this gap by wrapping Chrome DevTools Protocol in an
MCP-native interface. Any MCP-compatible agent can launch a browser, interact with web
pages, and inspect results using standard tool calls.

```
AI Agent (Claude Code, etc.)
  └─ MCP stdio transport
        └─ pilot (MCP server)
              └─ CDP connection
                    └─ Chrome (headless or headed)
```

---

## Goals

- Provide a complete set of MCP tools for browser automation that any MCP-compatible
  agent can use.
- Launch and manage Chrome lifecycle (start, stop, reconnect) without external setup.
- Support multi-tab browsing with tab creation, switching, and closing.
- Provide viewport presets for testing responsive designs across desktop, tablet, and
  mobile form factors.
- Buffer console events for poll-based retrieval (since MCP stdio does not
  support push events).
- Be simple enough that any agent can use it with a short system prompt description.

## Non-goals

- DOM diffing or accessibility tree export
- Video/audio capture
- Proxy or traffic interception
- Browser automation recording / playback
- WebSocket server mode (the original v0.1 PRD described a WS architecture; the
  implementation uses MCP stdio exclusively)

---

## Users and consumers

| Consumer                     | How they use pilot                                                    |
| ---------------------------- | --------------------------------------------------------------------- |
| AI agent (Claude Code, etc.) | Uses MCP tools to control the browser                                 |
| Developer using Claude Code  | Runs `pilot init` to install the debug-browser skill, then uses tools |
| `ai-agent-desktop-manager`   | Can start pilot as a managed process alongside a desktop              |
| Human operator               | Reads logs; uses `pilot --version` to verify installation             |

---

## Architecture

### MCP server model

`pilot` runs as an MCP server communicating over stdio. The AI agent (e.g. Claude Code)
launches the process and sends tool calls via the MCP protocol. Results are returned
as structured tool responses.

```
claude mcp add pilot -- npx @everydaydevopsio/pilot
  └─ MCP stdio transport (stdin/stdout)
        └─ pilot process
              ├─ BrowserManager (Chrome lifecycle)
              │     ├─ Chrome launcher (auto-detect path, find free port)
              │     ├─ CDP connection + reconnect with exponential backoff
              │     └─ Profile management (~/.local/share/pilot/<name>/)
              ├─ ConsoleBuffer (ring buffer, default 1000 entries)
              └─ Pino logger (stderr, stdout reserved for MCP)
```

### Chrome lifecycle

The agent explicitly starts and stops Chrome through MCP tools:

1. Agent calls `browser_start` → pilot launches Chrome, connects via CDP, applies viewport.
2. Agent uses browser tools (`browser_navigate`, `browser_click`, etc.).
3. Agent calls `browser_stop` → pilot kills Chrome and cleans up.

If Chrome disconnects unexpectedly, pilot attempts reconnect with exponential backoff
(starting at `cdpRetryMs`, doubling up to `cdpMaxRetryMs`). CDP domains (`Network`,
`Console`, `Page`, `Runtime`) are re-enabled on reconnect.

### Profile management

Chrome user data is stored in `$XDG_DATA_HOME/pilot/<profileName>/` (default
`~/.local/share/pilot/profile1/`). Profile names are validated against
`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`.

Stale lock detection: on launch, pilot checks Chrome's `SingletonLock` symlink. If the
lock references a PID on the current host that is no longer running, the lock is
automatically cleaned up so the profile can be reused.

### Console buffer

Since MCP stdio does not support server-initiated push events, console and error
messages are captured in a ring buffer (configurable size via `PILOT_MCP_BUFFER_SIZE`,
default 1000). Agents poll for messages using `browser_get_console_logs`,
`browser_get_errors`, and `browser_clear_errors`.

Console events are sourced from both `Runtime.consoleAPICalled` and
`Console.messageAdded`. CDP's `"warning"` level is normalized to `"warn"`.

---

## MCP tools

### Browser lifecycle

#### `browser_start`

Launch Chrome and connect via CDP.

**Params**

| Field               | Type    | Default       | Description                                |
| ------------------- | ------- | ------------- | ------------------------------------------ |
| `headless`          | boolean | `true`        | Run Chrome in headless mode                |
| `chromePath`        | string  | auto-detected | Path to Chrome executable                  |
| `profileName`       | string  | `"profile1"`  | Named profile directory                    |
| `viewport`          | enum    | `"desktop"`   | Viewport preset (see Viewport presets)     |
| `viewportWidth`     | integer | —             | Custom viewport width (overrides preset)   |
| `viewportHeight`    | integer | —             | Custom viewport height (overrides preset)  |
| `deviceScaleFactor` | number  | —             | Device pixel ratio (overrides preset)      |
| `responsive`        | boolean | —             | Responsive mode (page reflows with window) |

**Result**: Confirmation with headless mode and viewport name.

#### `browser_stop`

Kill Chrome and clean up resources.

**Params**: none

---

### Navigation and page state

#### `browser_navigate`

Navigate the active page to a URL.

**Params**

| Field       | Type                                                | Required | Default  |
| ----------- | --------------------------------------------------- | -------- | -------- |
| `url`       | string (URL)                                        | yes      | —        |
| `waitUntil` | `"load"` \| `"domcontentloaded"` \| `"networkidle"` | no       | `"load"` |
| `timeoutMs` | integer                                             | no       | `30000`  |

**Result**: Text confirmation including the final URL and HTTP status code
(e.g. `Navigated to https://example.com (status: 200)`).

#### `browser_page_info`

Return current page metadata.

**Params**: none

**Result**

| Field        | Type   | Description           |
| ------------ | ------ | --------------------- |
| `url`        | string | Current URL           |
| `title`      | string | Page title            |
| `readyState` | string | `document.readyState` |

#### `browser_wait`

Wait for a condition before responding.

**Params** (one of the following must be set)

| Field             | Type    | Description                                            |
| ----------------- | ------- | ------------------------------------------------------ |
| `selector`        | string  | Wait until selector is present in DOM                  |
| `selectorVisible` | string  | Wait until selector is visible (non-zero bounding box) |
| `networkIdle`     | boolean | Wait until no network requests for 500 ms              |
| `ms`              | integer | Fixed delay in milliseconds                            |
| `timeoutMs`       | integer | Overall timeout. Default: `10000`                      |

**Result**: Text confirmation with elapsed time (e.g. `Wait completed in 250ms`).

---

### Interaction

#### `browser_click`

Click an element or coordinates.

**Params** (one of `selector` or `x`/`y` required)

| Field        | Type                                | Default  | Description                  |
| ------------ | ----------------------------------- | -------- | ---------------------------- |
| `selector`   | string                              | —        | CSS selector                 |
| `x`          | number                              | —        | Viewport X coordinate        |
| `y`          | number                              | —        | Viewport Y coordinate        |
| `button`     | `"left"` \| `"right"` \| `"middle"` | `"left"` | Mouse button                 |
| `clickCount` | integer                             | `1`      | Number of clicks             |
| `timeoutMs`  | integer                             | `5000`   | Timeout waiting for selector |

**Result**: Text confirmation with click coordinates (e.g. `Clicked at (150, 300)`).

#### `browser_type`

Type text into the focused element or a given selector.

**Params**

| Field        | Type    | Required | Default | Description                       |
| ------------ | ------- | -------- | ------- | --------------------------------- |
| `text`       | string  | yes      | —       | Text to type                      |
| `selector`   | string  | no       | —       | Focus this element first          |
| `clearFirst` | boolean | no       | `false` | Select-all + delete before typing |
| `delayMs`    | integer | no       | `0`     | Delay between keystrokes (ms)     |

#### `browser_evaluate`

Execute JavaScript in the page context.

**Params**

| Field          | Type    | Required | Default | Description                  |
| -------------- | ------- | -------- | ------- | ---------------------------- |
| `expression`   | string  | yes      | —       | JS expression to evaluate    |
| `awaitPromise` | boolean | no       | `true`  | Await if result is a Promise |
| `timeoutMs`    | integer | no       | `10000` | Evaluation timeout           |

**Result**

| Field   | Type   | Description                    |
| ------- | ------ | ------------------------------ |
| `value` | any    | JSON-serializable return value |
| `type`  | string | CDP `RemoteObject.type`        |

---

### Screenshots

#### `browser_screenshot`

Capture the current viewport.

**Params**

| Field      | Type                | Default | Description                    |
| ---------- | ------------------- | ------- | ------------------------------ |
| `format`   | `"png"` \| `"jpeg"` | `"png"` | Image format                   |
| `quality`  | integer (1–100)     | `80`    | JPEG quality (ignored for PNG) |
| `fullPage` | boolean             | `false` | Capture full scrollable page   |

**Result**: Base64-encoded image returned as MCP image content.

---

### Tab management

#### `browser_list_tabs`

List all open browser tabs.

**Params**: none

**Result**: Array of `{ targetId, url, title, active }`.

#### `browser_new_tab`

Open a new tab and switch to it.

**Params**

| Field | Type   | Required | Description                      |
| ----- | ------ | -------- | -------------------------------- |
| `url` | string | no       | URL to open (default: blank tab) |

**Result**: Text confirmation with target ID and URL
(e.g. `New tab opened (targetId: ABC123, url: https://example.com)`).

#### `browser_close_tab`

Close a tab by target ID. Cannot close the currently active tab.

**Params**

| Field      | Type   | Required | Description  |
| ---------- | ------ | -------- | ------------ |
| `targetId` | string | yes      | Tab to close |

#### `browser_switch_tab`

Switch the active tab. Disconnects from the current target and connects to the new
one, re-enabling CDP domains.

**Params**

| Field      | Type   | Required | Description      |
| ---------- | ------ | -------- | ---------------- |
| `targetId` | string | yes      | Tab to switch to |

---

### Viewport

#### `browser_viewport_resize`

Resize the browser viewport at runtime. Forces locked (non-responsive) mode.

**Params**

| Field               | Type    | Required | Description        |
| ------------------- | ------- | -------- | ------------------ |
| `width`             | integer | yes      | Viewport width     |
| `height`            | integer | yes      | Viewport height    |
| `deviceScaleFactor` | number  | no       | Device pixel ratio |
| `mobile`            | boolean | no       | Enable mobile mode |

---

### Console and error inspection

#### `browser_get_console_logs`

Retrieve console messages from the ring buffer.

**Params**

| Field     | Type    | Default | Description                                  |
| --------- | ------- | ------- | -------------------------------------------- |
| `level`   | enum    | —       | Filter by single level                       |
| `levels`  | enum[]  | —       | Filter by multiple levels                    |
| `sinceMs` | integer | —       | Return messages from the last N milliseconds |
| `limit`   | integer | `100`   | Max messages to return                       |

**Result**: `{ messages, count, total, hasMore }`

#### `browser_get_errors`

Retrieve error-level console messages.

**Params**

| Field             | Type    | Default | Description                                |
| ----------------- | ------- | ------- | ------------------------------------------ |
| `sinceMs`         | integer | —       | Return errors from the last N milliseconds |
| `limit`           | integer | `50`    | Max errors to return                       |
| `includeWarnings` | boolean | `false` | Also include warning-level messages        |

**Result**: `{ errors, count, hasMore }` or `"No errors found."`

#### `browser_clear_errors`

Clear the entire console buffer.

**Params**: none

**Result**: Count of entries cleared.

---

## Viewport presets

Viewport presets configure the browser window size, device pixel ratio, mobile
emulation, and touch emulation. They are specified at launch via the `viewport`
parameter of `browser_start` or the `PILOT_VIEWPORT` environment variable.

| Preset             | Width × Height | DPR   | Mobile | Description              |
| ------------------ | -------------- | ----- | ------ | ------------------------ |
| `desktop`          | 1920 × 1080    | 1     | no     | Standard Full HD         |
| `desktop-small`    | 1366 × 768     | 1     | no     | Common laptop resolution |
| `desktop-scaled`   | 1536 × 864     | 1.25  | no     | Scaled laptop display    |
| `desktop-qhd`      | 2560 × 1440    | 1     | no     | QHD / 2K monitor         |
| `tablet`           | 768 × 1024     | 2     | yes    | Tablet portrait          |
| `tablet-landscape` | 1024 × 768     | 2     | yes    | Tablet landscape         |
| `mobile`           | 390 × 844      | 3     | yes    | iPhone 15 / 16           |
| `mobile-landscape` | 844 × 390      | 3     | yes    | Mobile landscape         |
| `mobile-small`     | 360 × 800      | 3     | yes    | Smaller Android phones   |
| `mobile-pro`       | 393 × 852      | 3     | yes    | iPhone 15 Pro            |
| `mobile-large`     | 430 × 932      | 3     | yes    | iPhone 15 Pro Max        |
| `mobile-android`   | 412 × 915      | 2.625 | yes    | Pixel 8                  |

Mobile presets enable touch emulation and set a mobile user agent string (Pixel 8,
Android 14, Chrome 125). Presets with `responsive: true` skip
`Emulation.setDeviceMetricsOverride` so the page reflows naturally with the actual
window size.

---

## Browser events

Events are captured from Chrome via CDP. Only `console_message` events are
stored in the ring buffer and retrievable via MCP tools (`browser_get_console_logs`,
`browser_get_errors`). Other events are emitted internally for lifecycle
management but are not currently exposed to agents.

| Event                  | Source                                             | Description                             | Buffered |
| ---------------------- | -------------------------------------------------- | --------------------------------------- | -------- |
| `console_message`      | `Runtime.consoleAPICalled`, `Console.messageAdded` | Console log/warn/error/info/debug       | yes      |
| `network_request`      | `Network.requestWillBeSent`                        | Outgoing HTTP request                   | no       |
| `network_response`     | `Network.responseReceived`                         | HTTP response received                  | no       |
| `network_failed`       | `Network.loadingFailed`                            | Network request failure                 | no       |
| `page_navigated`       | `Page.frameNavigated`                              | Main frame navigation completed         | no       |
| `browser_connected`    | CDP connect                                        | Successfully (re)connected to Chrome    | no       |
| `browser_disconnected` | CDP disconnect                                     | Chrome disconnected; reconnect starting | no       |

---

## CLI

### Binary names

The package provides four equivalent binary entry points:
`pilot`

### Commands

| Command        | Description                                 |
| -------------- | ------------------------------------------- |
| (default)      | Start the MCP server on stdio               |
| `init`         | Install the Claude Code debug-browser skill |
| `init --force` | Overwrite existing skill file               |
| `--version`    | Print version                               |
| `--help`       | Print usage                                 |

### `pilot init`

Writes a Claude Code skill file to `.claude/skills/debug-browser/SKILL.md`. The skill
template instructs Claude Code to:

1. Add the MCP server: `claude mcp add pilot --scope session -- npx @everydaydevopsio/pilot`
2. Start the browser with `browser_start`
3. Spawn a background error-watching sub-agent

---

## Configuration

All configuration via environment variables. CLI flags are limited to `--version`,
`--help`, and the `init` subcommand.

| Env var                   | Type            | Default       | Description                                        |
| ------------------------- | --------------- | ------------- | -------------------------------------------------- |
| `PILOT_CDP_PORT`          | integer         | `9222`        | Chrome DevTools Protocol port                      |
| `PILOT_CDP_HOST`          | string          | `127.0.0.1`   | CDP host                                           |
| `PILOT_CDP_RETRY_MS`      | integer (≥100)  | `2000`        | Initial CDP reconnect interval (ms)                |
| `PILOT_CDP_MAX_RETRY_MS`  | integer (≥1000) | `30000`       | Max CDP reconnect interval (ms)                    |
| `PILOT_LOG_LEVEL`         | enum            | `info`        | Pino log level (trace/debug/info/warn/error/fatal) |
| `PILOT_CHROME_PATH`       | string          | auto-detected | Path to Chrome executable                          |
| `PILOT_HEADLESS`          | boolean         | `false`       | Run Chrome in headless mode                        |
| `PILOT_CHROME_NO_SANDBOX` | boolean         | `false`       | Disable Chrome sandbox (auto-enabled as root)      |
| `PILOT_PROFILE_NAME`      | string          | `profile1`    | Chrome profile directory name                      |
| `PILOT_VIEWPORT`          | string          | `desktop`     | Default viewport preset                            |
| `PILOT_RESPONSIVE`        | boolean         | —             | Enable responsive mode                             |
| `PILOT_MCP_BUFFER_SIZE`   | integer         | `1000`        | Console ring buffer size                           |

Chrome path auto-detection checks platform-specific default locations:

- **macOS**: `/Applications/Google Chrome.app/...`
- **Linux**: `google-chrome`, `google-chrome-stable`, `chromium-browser`, `chromium`
- **Windows**: Program Files Chrome paths

Sandbox is automatically disabled when running as root on Linux/Windows, or when
`PILOT_CHROME_NO_SANDBOX=true`.

---

## Error handling

| Scenario                          | Behavior                                                 |
| --------------------------------- | -------------------------------------------------------- |
| Chrome not reachable on startup   | Retry with exponential backoff; log each attempt         |
| Chrome crashes during command     | Return error; attempt reconnect with backoff             |
| Command times out                 | Return MCP tool error with timeout message               |
| Browser not started               | Return MCP tool error: browser not started               |
| Invalid tool parameters           | Return MCP tool error with validation details            |
| Stale profile lock                | Auto-detect dead PID, clean up lock, proceed with launch |
| Profile lock held by live process | Return error: profile in use                             |

---

## Non-functional requirements

| Requirement                      | Target                                       |
| -------------------------------- | -------------------------------------------- |
| Screenshot latency (viewport)    | < 500 ms p95                                 |
| Navigate + screenshot round-trip | < 3 s p95 (excluding page load)              |
| Memory footprint                 | < 100 MB RSS at idle                         |
| Startup time (Chrome reachable)  | < 2 s                                        |
| Node.js version                  | ≥ 22 LTS                                     |
| TypeScript strict mode           | required                                     |
| Test coverage threshold          | 50% (lines, functions, branches, statements) |

---

## Project structure

```
pilot/
├── src/
│   ├── browser.ts              # BrowserManager: Chrome lifecycle, CDP, reconnect
│   ├── viewport.ts             # Viewport presets and emulation
│   ├── commands/
│   │   ├── screenshot.ts
│   │   ├── navigate.ts
│   │   ├── click.ts
│   │   ├── type.ts
│   │   ├── evaluate.ts
│   │   ├── wait.ts
│   │   ├── page_info.ts
│   │   └── tabs.ts             # list, new, close, switch
│   ├── mcp/
│   │   ├── index.ts            # Entry point, CLI parsing, MCP server setup
│   │   ├── console-buffer.ts   # Ring buffer for console/error messages
│   │   └── tools/
│   │       ├── names.ts        # Tool name constants
│   │       ├── browser.ts      # Browser lifecycle + interaction tools
│   │       └── errors.ts       # Console log + error inspection tools
│   └── util/
│       ├── config.ts           # Environment variable parsing
│       └── logger.ts           # Pino logger (stderr)
├── test/
├── package.json
├── tsconfig.json
└── PRD.md
```

---

## Dependencies

| Package                     | Purpose                                |
| --------------------------- | -------------------------------------- |
| `@modelcontextprotocol/sdk` | MCP server framework (stdio transport) |
| `chrome-remote-interface`   | CDP client                             |
| `pino`                      | Structured logging                     |
| `zod`                       | Parameter validation                   |

---

## Acceptance criteria

1. `npx @everydaydevopsio/pilot` starts the MCP server on stdio successfully.
2. `browser_start` launches Chrome, connects via CDP, and returns confirmation.
3. `browser_screenshot` returns a valid base64-encoded image.
4. `browser_navigate` to `https://example.com` succeeds with status `200`.
5. `browser_click` and `browser_type` execute without error on a simple form page.
6. `browser_evaluate` can return `document.title` as a string.
7. `browser_wait` with `selector`, `selectorVisible`, `networkIdle`, and `ms` all work.
8. `browser_list_tabs`, `browser_new_tab`, `browser_switch_tab`, and `browser_close_tab`
   manage multiple tabs correctly.
9. `browser_viewport_resize` changes the viewport and subsequent screenshots reflect
   the new dimensions.
10. `browser_get_console_logs` returns buffered console messages with level filtering.
11. `browser_get_errors` returns error-level messages; `browser_clear_errors` clears them.
12. `browser_stop` kills Chrome and cleans up resources.
13. If Chrome crashes, pilot reconnects automatically with exponential backoff.
14. Stale profile locks from dead processes are detected and cleaned up.
15. All viewport presets produce correct device emulation (DPR, mobile UA, touch).
16. `pilot init` writes a valid Claude Code skill file.
17. All tests pass; TypeScript builds clean in strict mode; coverage meets 50% threshold.

---

## Open questions / future work

- Should `wait.networkIdle` use a configurable quiet period (currently 500 ms hard-coded)?
- Accessibility tree snapshot command for agents that prefer structured DOM over visual?
- HTTP health and screenshot endpoints for operator monitoring?
- WebSocket server mode for non-MCP agents?
- Streaming screenshot mode for agents that need continuous visual feedback?
- DOM query/selection tool to reduce reliance on `browser_evaluate` for common tasks?
- Cookie and localStorage management tools?
- File upload/download handling via CDP?
