<p align="center">
  <img src=".github/assets/icon.svg" alt="Pilot project icon" width="128">
</p>

<h1 align="center">Pilot</h1>

<p align="center">
  <strong>DevTools-grade browser control for AI agents through MCP.</strong>
</p>

<p align="center">
  <a href="https://github.com/everydaydevopsio/pilot/actions/workflows/ci.yml"><img src="https://github.com/everydaydevopsio/pilot/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/everydaydevopsio/pilot/actions/workflows/e2e.yml"><img src="https://github.com/everydaydevopsio/pilot/actions/workflows/e2e.yml/badge.svg" alt="End-to-end tests"></a>
  <a href="https://github.com/everydaydevopsio/pilot/actions/workflows/smoke.yml"><img src="https://github.com/everydaydevopsio/pilot/actions/workflows/smoke.yml/badge.svg" alt="Smoke tests"></a>
  <a href="https://github.com/everydaydevopsio/pilot/releases"><img src="https://img.shields.io/github/v/release/everydaydevopsio/pilot" alt="GitHub release"></a>
  <a href="https://www.npmjs.com/package/@everydaydevopsio/pilot"><img src="https://img.shields.io/npm/v/@everydaydevopsio/pilot.svg" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/everydaydevopsio/pilot" alt="License"></a>
</p>

Pilot is a local Model Context Protocol server that lets an AI agent launch or connect to Chrome, interact with pages, and inspect the browser through the Chrome DevTools Protocol.

It combines semantic element references with lower-level DevTools access. An agent can fill a form, capture a screenshot, inspect failed requests, read console errors, diagnose CSS, or record a performance trace without switching browser tools.

## What Pilot provides

- Browser lifecycle management for visible or headless Chrome.
- Accessibility snapshots with stable element references.
- Ref-based clicks, typing, form filling, selection, keyboard input, hovering, and scrolling.
- Screenshots, JavaScript evaluation, page metadata, waiting, and viewport control.
- Network, console, runtime-error, computed-style, and box-model inspection.
- Upload, download, dialog, tab, and performance-tracing tools.
- Origin allow/block rules, header redaction, and upload-root restrictions.
- A published npm package that works with any MCP client using stdio.

Pilot is not a hosted browser service. It runs beside your AI client and controls a Chrome process on that machine or another explicitly configured CDP endpoint.

## Quick start

Pilot requires Node.js 22 or newer and Chrome or Chromium.

### Codex

```bash
codex mcp add pilot -- npx -y @everydaydevopsio/pilot
codex mcp list
```

Restart Codex, run `/mcp`, and confirm that `pilot` is connected.

### Claude Code

```bash
claude mcp add pilot -- npx -y @everydaydevopsio/pilot
```

Or add a project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "pilot": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@everydaydevopsio/pilot"]
    }
  }
}
```

Then ask the agent to use Pilot:

```text
Start a browser, open https://example.com, and return the page title.
Take an accessibility snapshot and list the interactive elements.
Show failed network requests and browser console errors.
```

Pilot opens a visible browser by default. Set `PILOT_HEADLESS=true` for servers and CI.

## How it works

```text
AI agent
   |
   | MCP over stdio
   v
Pilot
   |
   | Chrome DevTools Protocol
   v
Chrome or Chromium
```

Pilot can launch an isolated browser profile or connect to an existing Chrome instance with remote debugging enabled. MCP responses return structured page state and compact element references such as `e1` and `e2`, which agents can reuse for later actions.

A common interaction loop is:

1. Call `browser_start`.
2. Navigate with `browser_navigate`.
3. Read the page with `browser_snapshot`.
4. Interact through `browser_click`, `browser_fill`, or another ref-based tool.
5. Inspect `browser_network`, `browser_console`, or `browser_errors` when something fails.
6. Stop the managed browser with `browser_stop`.

## Tool families

| Family | Primary tools |
| --- | --- |
| Browser lifecycle | `browser_start`, `browser_stop`, `browser_connect` |
| Page understanding | `browser_snapshot`, `browser_find`, `browser_page_info` |
| Interaction | `browser_click`, `browser_type`, `browser_fill`, `browser_hover`, `browser_press_key`, `browser_select`, `browser_check`, `browser_scroll` |
| Inspection | `browser_screenshot`, `browser_evaluate`, `browser_wait`, `browser_styles`, `browser_viewport_resize` |
| Diagnostics | `browser_network`, `browser_console`, `browser_errors`, `browser_performance` |
| Files and dialogs | `browser_upload`, `browser_downloads`, `browser_dialog` |
| Tabs | `browser_tabs` |

Legacy tab and console tools remain available for backward compatibility.

## Configuration

Pilot reads configuration from environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PILOT_CDP_HOST` | `127.0.0.1` | Host used when connecting to an existing Chrome instance |
| `PILOT_CDP_PORT` | `9222` | Port used when connecting to an existing Chrome instance |
| `PILOT_CHROME_PATH` | auto-detected | Explicit Chrome or Chromium executable |
| `PILOT_HEADLESS` | `false` | Launch Chrome without a visible window |
| `PILOT_PROFILE_NAME` | `profile1` | Persistent profile name below `$XDG_DATA_HOME/pilot/` |
| `PILOT_RESPONSIVE` | preset-dependent | Use natural desktop resizing instead of a locked emulated viewport |
| `PILOT_LOG_LEVEL` | `info` | Pino log level |
| `PILOT_MCP_BUFFER_SIZE` | `1000` | Console-message buffer size |
| `PILOT_ALLOWED_ORIGINS` | none | Comma-separated navigation allow list; supports wildcards |
| `PILOT_BLOCKED_ORIGINS` | none | Comma-separated navigation block list; takes precedence |
| `PILOT_REDACT_HEADERS` | sensitive defaults | Additional network headers to redact |
| `PILOT_UPLOAD_ROOTS` | current directory | Directories from which browser uploads are allowed |
| `PILOT_DOWNLOAD_DIR` | `<tmpdir>/pilot-downloads` | Directory for tracked downloads |
| `PILOT_CHROME_NO_SANDBOX` | auto | Force Chrome's `--no-sandbox` flag on or off |

Example project-level Codex configuration:

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
env = { PILOT_HEADLESS = "true", PILOT_ALLOWED_ORIGINS = "example.com,*.example.com" }
```

## Connect to an existing Chrome process

Start Chrome with a dedicated remote-debugging profile:

```bash
google-chrome \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/pilot-chrome
```

Configure `PILOT_CDP_HOST` and `PILOT_CDP_PORT` when needed, then ask the agent to call `browser_connect`.

Do not expose the CDP port to an untrusted network. A client with CDP access can control the browser and read data available to its profile.

## Linux and remote sessions

Run the preflight before troubleshooting Chrome:

```bash
npx -y @everydaydevopsio/pilot check
```

The check verifies the Chrome executable, profile directory, loopback binding, outbound HTTPS, and graphical display requirements.

For a headless server:

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
env = { PILOT_HEADLESS = "true" }
```

For a visible remote desktop, pass the display used by that session:

```bash
printenv DISPLAY
```

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
env = { DISPLAY = ":1" }
```

Replace `:1` with the actual value. Forward `XAUTHORITY` as well when the X server requires it.

An `EPERM` error while Pilot binds a loopback CDP socket usually indicates a host sandbox or container policy. Allow loopback binding instead of disabling Chrome's renderer sandbox. When the home directory is read-only, point profiles at a writable location:

```bash
export XDG_DATA_HOME=/tmp/pilot-data
```

## Docker

MCP over stdio requires an interactive stdin:

```bash
docker build -t pilot .
claude mcp add pilot-docker -- docker run -i --rm pilot
```

For production-like containers, run as a non-root user and retain a working Chrome sandbox.

## Security

Browser automation crosses a strong trust boundary. A page can contain hostile content, while a browser profile may contain authenticated sessions.

Pilot provides guardrails, but the caller remains responsible for the environment:

- Use `PILOT_ALLOWED_ORIGINS` for bounded automation.
- Keep the default header redaction and add application-specific secrets when needed.
- Restrict `PILOT_UPLOAD_ROOTS`.
- Use a dedicated browser profile instead of a personal profile.
- Keep CDP bound to loopback or a trusted private network.
- Leave the Chrome renderer sandbox enabled whenever possible.

Pilot adds `--no-sandbox` automatically only when running as root on Linux. Any sandbox-disabled launch produces a warning.

## Development

The repository pins Node and pnpm versions.

```bash
git clone https://github.com/everydaydevopsio/pilot.git
cd pilot

make setup
pnpm test
pnpm run test:coverage
```

Useful Docker test targets:

```bash
make smoke
make e2e
make e2e-mcp
```

Run the server from source with:

```bash
pnpm dev
```

Build and run the published entry point locally with:

```bash
pnpm build
pnpm start
```

## License

Pilot is available under the [MIT License](LICENSE).
