# PRD — ai-agent-browser (aab) v0.1

## Overview

`ai-agent-browser` is a lightweight Node.js/TypeScript service that gives AI agents
DevTools-grade control over a running Chrome instance. It connects to Chrome via the
Chrome DevTools Protocol (CDP) and exposes a **WebSocket API** that lets an agent take
screenshots, navigate, click, type, run JavaScript, and receive a live stream of console
and network events — all over a single persistent connection.

It is designed to run as a systemd service (`aab@.service`) alongside each desktop
provisioned by `ai-agent-desktop-manager`. One instance per desktop, one agent connection
at a time.

---

## Context and motivation

`ai-agent-desktop-manager` provisions isolated desktops for AI agents:

```
noVNC (human view)       ←  websockify  ←  Xvnc
ai-agent-browser (agent view)  ←  CDP  ←  Chrome
```

noVNC is the human operator window. `ai-agent-browser` is the machine-readable window.
Agents need more than screenshots: they need to act (click, type, navigate) and observe
passively (console errors, network failures, DOM changes) — all without screen-scraping
the VNC stream.

---

## Goals

- Provide a single WebSocket endpoint that an agent connects to once and uses for the
  lifetime of a task.
- Push browser events (console, network) to the agent without polling.
- Accept agent commands (screenshot, navigate, click, type, JS eval, wait) and return
  structured results.
- Stay stateless between WS reconnections — Chrome state persists; aab state does not.
- Be simple enough that any agent (Claude, Codex, custom) can use it with a short system
  prompt description of the protocol.

## Non-goals (v0.1)

- Multi-tab management (single active tab only)
- Multiple simultaneous agent connections (one at a time)
- Authentication (localhost is the security boundary)
- DOM diffing or accessibility tree export
- Video/audio capture
- Proxy or traffic interception
- Browser automation recording / playback

---

## Users and consumers

| Consumer | How they use aab |
|---|---|
| AI agent (Claude, Codex, etc.) | Connects via WS, sends commands, reads events |
| `ai-agent-desktop-manager` | Starts/stops the service; returns `aabUrl` to the caller |
| Human operator | Calls `/health` to verify the service is up; reads logs |

---

## Architecture

### Deployment

```
aadm (desktop manager)
  └─ systemctl start aab@<display>.service
        └─ node aab --cdp-port <cdpPort> --port <aabPort>
              └─ WebSocket server on 127.0.0.1:<aabPort>
                    └─ CDP connection to Chrome on 127.0.0.1:<cdpPort>
```

Each desktop gets its own `aab` process. Ports are derived from the display number by
the desktop manager and passed in at startup.

### Single session model

Only one WebSocket client may be connected at a time. A second connection attempt is
rejected with close code `4409 Conflict`. The service does **not** queue connections.

### Chrome connection lifecycle

On startup, `aab` connects to Chrome via CDP. If Chrome is not yet reachable it retries
with exponential backoff (max ~30 s). Once connected, `aab` attaches to the first
available page target and begins streaming events. If Chrome disconnects, `aab` attempts
reconnect and re-attaches. The agent's WS connection is preserved during Chrome reconnect
but receives a `browser_disconnected` event.

---

## WebSocket protocol

### Transport

- **URL**: `ws://127.0.0.1:<aabPort>/ws`
- **Encoding**: JSON text frames (UTF-8)
- **Framing**: one JSON object per frame

### Message envelope

All messages share a common envelope:

```jsonc
// Client → Server (command)
{
  "id": "string",         // unique per request, echoed in response
  "method": "string",     // command name
  "params": { ... }       // method-specific, may be omitted
}

// Server → Client (response)
{
  "id": "string",         // matches the request id
  "ok": true | false,
  "result": { ... },      // present when ok=true
  "error": "string"       // present when ok=false
}

// Server → Client (event, no id)
{
  "event": "string",
  "data": { ... }
}
```

---

## Commands (client → server)

### `screenshot`

Capture the current viewport.

**Params**

| Field | Type | Default | Description |
|---|---|---|---|
| `format` | `"png"` \| `"jpeg"` | `"png"` | Image format |
| `quality` | number (1–100) | 80 | JPEG quality (ignored for PNG) |
| `fullPage` | boolean | false | Capture full scrollable page |

**Result**

| Field | Type | Description |
|---|---|---|
| `dataUrl` | string | `data:<mime>;base64,<data>` |
| `width` | number | Pixel width |
| `height` | number | Pixel height |

---

### `navigate`

Navigate the active page to a URL.

**Params**

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | Target URL |
| `waitUntil` | `"load"` \| `"domcontentloaded"` \| `"networkidle"` | no | Default: `"load"` |
| `timeoutMs` | number | no | Default: 30000 |

**Result**

| Field | Type | Description |
|---|---|---|
| `url` | string | Final URL after redirects |
| `status` | number | HTTP status of the main frame response |

---

### `click`

Click an element or coordinates.

**Params** (one of `selector` or `x`/`y` required)

| Field | Type | Description |
|---|---|---|
| `selector` | string | CSS selector |
| `x` | number | Viewport X coordinate |
| `y` | number | Viewport Y coordinate |
| `button` | `"left"` \| `"right"` \| `"middle"` | Default: `"left"` |
| `clickCount` | number | Default: 1 |
| `timeoutMs` | number | Timeout waiting for selector. Default: 5000 |

**Result**

| Field | Type | Description |
|---|---|---|
| `x` | number | Actual click X |
| `y` | number | Actual click Y |

---

### `type`

Type text into the focused element or a given selector.

**Params**

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Text to type |
| `selector` | string | no | Focus this element first |
| `clearFirst` | boolean | no | Select-all + delete before typing. Default: false |
| `delayMs` | number | no | Delay between keystrokes (ms). Default: 0 |

**Result**

```json
{ "ok": true }
```

---

### `evaluate`

Execute JavaScript in the page context.

**Params**

| Field | Type | Required | Description |
|---|---|---|---|
| `expression` | string | yes | JS expression to evaluate |
| `awaitPromise` | boolean | no | Await if result is a Promise. Default: true |
| `timeoutMs` | number | no | Default: 10000 |

**Result**

| Field | Type | Description |
|---|---|---|
| `value` | any | JSON-serializable return value |
| `type` | string | CDP `RemoteObject.type` |

---

### `wait`

Wait for a condition before responding.

**Params** (one of the following must be set)

| Field | Type | Description |
|---|---|---|
| `selector` | string | Wait until selector is present in DOM |
| `selectorVisible` | string | Wait until selector is visible (non-zero bounding box) |
| `networkIdle` | boolean | Wait until no network requests for 500 ms |
| `ms` | number | Fixed delay in milliseconds |
| `timeoutMs` | number | Overall timeout. Default: 10000 |

**Result**

```json
{ "ok": true, "elapsed": 312 }
```

---

### `page_info`

Return current page metadata.

**Params**: none

**Result**

| Field | Type | Description |
|---|---|---|
| `url` | string | Current URL |
| `title` | string | Page title |
| `readyState` | string | `document.readyState` |

---

## Events (server → client, unsolicited)

Events are pushed to the connected agent as they occur. The agent does not need to
subscribe; all events are enabled by default on connect.

### `console_message`

```jsonc
{
  "event": "console_message",
  "data": {
    "level": "log" | "warn" | "error" | "info" | "debug",
    "text": "string",
    "url": "string",          // source URL if available
    "lineNumber": 42,
    "timestamp": 1710000000000
  }
}
```

### `network_request`

```jsonc
{
  "event": "network_request",
  "data": {
    "requestId": "string",
    "url": "string",
    "method": "GET" | "POST" | ...,
    "timestamp": 1710000000000
  }
}
```

### `network_response`

```jsonc
{
  "event": "network_response",
  "data": {
    "requestId": "string",
    "url": "string",
    "status": 200,
    "mimeType": "text/html",
    "fromCache": false,
    "timestamp": 1710000000000
  }
}
```

### `network_failed`

```jsonc
{
  "event": "network_failed",
  "data": {
    "requestId": "string",
    "url": "string",
    "errorText": "net::ERR_NAME_NOT_RESOLVED",
    "timestamp": 1710000000000
  }
}
```

### `page_navigated`

Fired when the main frame finishes navigating.

```jsonc
{
  "event": "page_navigated",
  "data": {
    "url": "string",
    "timestamp": 1710000000000
  }
}
```

### `browser_disconnected`

Fired if Chrome disconnects. aab will attempt to reconnect.

```jsonc
{
  "event": "browser_disconnected",
  "data": {
    "reason": "string"
  }
}
```

### `browser_connected`

Fired when aab successfully (re)connects to Chrome.

```jsonc
{
  "event": "browser_connected",
  "data": {
    "targetId": "string",
    "url": "string"
  }
}
```

---

## HTTP endpoints

Even though the primary interface is WebSocket, aab exposes two lightweight HTTP routes
for operator tooling:

### `GET /health`

```json
{
  "ok": true,
  "version": "0.1.0",
  "uptimeSec": 42,
  "chromeConnected": true,
  "agentConnected": false
}
```

### `GET /screenshot` (convenience, no WS required)

Returns a PNG image directly (`Content-Type: image/png`). Useful for the desktop doctor
check and human spot-checking. No JSON body.

---

## Configuration

All configuration via environment variables or CLI flags (CLI flags take precedence).

| Env var | CLI flag | Default | Description |
|---|---|---|---|
| `AAB_PORT` | `--port` | `8765` | HTTP/WS listen port |
| `AAB_HOST` | `--host` | `127.0.0.1` | Bind address |
| `AAB_CDP_PORT` | `--cdp-port` | `9222` | Chrome DevTools Protocol port |
| `AAB_CDP_HOST` | `--cdp-host` | `127.0.0.1` | CDP host |
| `AAB_CDP_RETRY_MS` | — | `2000` | Initial CDP reconnect interval |
| `AAB_CDP_MAX_RETRY_MS` | — | `30000` | Max CDP reconnect interval |
| `AAB_LOG_LEVEL` | `--log-level` | `info` | Pino log level |

---

## Systemd integration

The desktop manager template unit (`aab@.service`) passes display-derived ports:

```ini
[Service]
ExecStart=/usr/bin/node /opt/aab/dist/index.js \
  --port 876%i \
  --cdp-port 922%i
```

(Actual port math is handled by the manager; the `%i` specifier passes the display number
which the manager uses to compute final port values before writing the unit or passing
env vars.)

---

## Error handling

| Scenario | Behavior |
|---|---|
| Chrome not reachable on startup | Retry with backoff; log each attempt; service stays up |
| Command times out | Respond `{ ok: false, error: "timeout" }` |
| Unknown method | Respond `{ ok: false, error: "unknown_method" }` |
| Second WS connection attempt | Close with code `4409`, message `"session_conflict"` |
| Chrome crashes during command | Respond `{ ok: false, error: "browser_disconnected" }` and emit event |
| Malformed JSON from client | Close WS with code `4400`, message `"invalid_json"` |

---

## Non-functional requirements

| Requirement | Target |
|---|---|
| Screenshot latency (viewport) | < 500 ms p95 |
| Navigate + screenshot round-trip | < 3 s p95 (excluding page load) |
| Memory footprint | < 100 MB RSS at idle |
| Startup time (Chrome reachable) | < 2 s |
| Node.js version | 20 LTS |
| TypeScript strict mode | required |

---

## Project structure (proposed)

```
ai-agent-browser/
├── src/
│   ├── index.ts           # entry point, CLI arg parsing
│   ├── server.ts          # Fastify HTTP + WS server
│   ├── session.ts         # single-session WS handler
│   ├── browser.ts         # CDP connection + reconnect logic
│   ├── commands/
│   │   ├── screenshot.ts
│   │   ├── navigate.ts
│   │   ├── click.ts
│   │   ├── type.ts
│   │   ├── evaluate.ts
│   │   ├── wait.ts
│   │   └── page_info.ts
│   ├── events/
│   │   ├── console.ts
│   │   └── network.ts
│   └── util/
│       ├── config.ts
│       └── logger.ts
├── test/
├── systemd/
│   └── aab@.service
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Dependencies (planned)

| Package | Purpose |
|---|---|
| `fastify` | HTTP server (consistent with desktop manager) |
| `@fastify/websocket` | WebSocket upgrade via ws |
| `chrome-remote-interface` | CDP client |
| `pino` | Structured logging |
| `zod` | Command parameter validation |

---

## Acceptance criteria (v0.1 MVP)

1. Service starts, connects to Chrome on configured CDP port, and `/health` returns
   `{ ok: true, chromeConnected: true }`.
2. WS client connects, sends `{ "id": "1", "method": "screenshot" }`, receives a
   response with a valid `dataUrl`.
3. `navigate` to `https://example.com` succeeds and `page_navigated` event is emitted.
4. `click` and `type` commands execute without error on a simple form page.
5. `evaluate` can return `document.title` as a string.
6. Console errors and network failures on the page are pushed as events without the
   agent asking.
7. A second WS connection is rejected with code `4409`.
8. If Chrome is killed and restarted, aab reconnects and subsequent commands succeed.
9. `GET /screenshot` returns a PNG with correct `Content-Type`.
10. All tests pass; TypeScript builds clean in strict mode.

---

## Open questions / future work

- Should `wait.networkIdle` use a configurable quiet period (currently 500 ms hard-coded)?
- Accessibility tree snapshot command for agents that prefer structured DOM over visual?
- Multi-tab support: expose a `tabs.list` / `tabs.switch` command set in v0.2?
- MCP server wrapper in v0.2 to allow Claude Code to use aab as a native tool?
- Streaming screenshot mode (MJPEG or periodic frames) for agents that need continuous
  visual feedback?
