# pilot

[![CI](https://github.com/everydaydevopsio/pilot/actions/workflows/ci.yml/badge.svg)](https://github.com/everydaydevopsio/pilot/actions/workflows/ci.yml)
[![E2E](https://github.com/everydaydevopsio/pilot/actions/workflows/e2e.yml/badge.svg)](https://github.com/everydaydevopsio/pilot/actions/workflows/e2e.yml)
[![Smoke](https://github.com/everydaydevopsio/pilot/actions/workflows/smoke.yml/badge.svg)](https://github.com/everydaydevopsio/pilot/actions/workflows/smoke.yml)
[![License](https://img.shields.io/github/license/everydaydevopsio/pilot)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/everydaydevopsio/pilot)](https://github.com/everydaydevopsio/pilot/releases)
[![npm version](https://img.shields.io/npm/v/@everydaydevopsio/pilot.svg)](https://www.npmjs.com/package/@everydaydevopsio/pilot)

A lightweight Node.js/TypeScript MCP server that gives AI agents DevTools-grade control over a running Chrome instance. Connects to Chrome via the Chrome DevTools Protocol (CDP) and exposes 35 MCP tools for browser automation, inspection, and debugging — including structured accessibility snapshots, element ref-based interaction, network/console/CSS inspection, file operations, performance tracing, and security controls.

Use pilot to open a URL, interact with it using semantic element refs, inspect network traffic, diagnose CSS issues, and watch for errors — all from any AI agent that speaks MCP.

## Prerequisites

- **Node.js**: Use the version in `.nvmrc`. Supported: Node 22 (LTS) or 24 (Active LTS).
- [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager)
- [pnpm](https://pnpm.io) package manager (managed via Corepack)
- [pre-commit](https://pre-commit.com) for Git hooks (optional but recommended)

### Install nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

After installation, restart your shell (or `source` your shell profile) so the `nvm` command is available. See the [nvm repository](https://github.com/nvm-sh/nvm) for the latest install script and platform-specific notes.

### Install dependencies

```bash
nvm install   # installs the version from .nvmrc (Node 24)
nvm use

# Enable Corepack and activate the pnpm version pinned in package.json
corepack enable
corepack prepare --activate

pnpm install

# Optional: Install Git hooks
pre-commit install
pre-commit install --hook-type pre-push
```

Corepack ships with Node.js and uses the `packageManager` field in `package.json` to pin the pnpm version, so every contributor and CI run uses the same one.

## Quick Start

```bash
# Build
pnpm run build

# Run as MCP server (stdio)
pnpm start
```

### Linux preflight

Before launching Chrome on Linux, verify the browser environment:

```bash
pilot check
```

The command checks that Chrome is executable, the Pilot profile directory is
writable, an ephemeral CDP port can bind on `127.0.0.1`, outbound HTTPS works,
and a graphical display is available when `PILOT_HEADLESS=false`.

Visible Chrome requires `DISPLAY` or `WAYLAND_DISPLAY`. On a Linux server or in
CI, use `PILOT_HEADLESS=true`. To exercise visible-mode behavior without a real
desktop, run Pilot under Xvfb:

```bash
xvfb-run -a npx @everydaydevopsio/pilot
```

#### Remote Linux sessions

When Codex or Claude runs over SSH or in a remote desktop session, the agent's
MCP process may not inherit the remote display even though applications such as
`xterm` open successfully. Check the display inside that session with
`printenv DISPLAY`, forward the value to the Pilot MCP server, and restart the
agent. With Codex, for example:

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
env = { DISPLAY = ":1" }
```

Replace `:1` with the value from the remote session. Forward `XAUTHORITY` too if
the X server requires it. For SSH-based display forwarding, start the agent from
the `ssh -Y` session so it inherits the forwarded display; forwarded display
values can change between sessions.

Sandboxed environments must allow loopback socket binding for Chrome DevTools.
An `EPERM` error while binding `127.0.0.1` is a host sandbox or container-policy
restriction, not a Chrome renderer-sandbox failure. Do not work around it with
`PILOT_CHROME_NO_SANDBOX=true`; allow loopback binding instead. If the home
directory is read-only, point profiles at a writable location, for example:

```bash
export XDG_DATA_HOME=/tmp/pilot-data
```

### With Docker

To use the MCP server from a Docker container, pass `-i` so stdin stays open for stdio communication:

```bash
docker build -t pilot .
claude mcp add pilot -- docker run -i --rm pilot
```

## Codex Integration

Codex reads MCP server configuration from `config.toml`. Use
`~/.codex/config.toml` for a user-level install that follows you across repos,
or `.codex/config.toml` for a project-level install that applies when Codex is
started from this trusted repo.

### User-level install

Add pilot to your user Codex config with the Codex CLI:

```bash
codex mcp add pilot -- npx -y @everydaydevopsio/pilot
```

Verify the server is configured:

```bash
codex mcp list
```

Restart Codex, then run `/mcp` in the Codex TUI to confirm that `pilot` is
connected.

### Project-level install

To make pilot available for this repo only, add a project-scoped Codex config at
`.codex/config.toml`:

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
```

Project-scoped config is loaded only after you trust the project in Codex. Commit
`.codex/config.toml` only when it is portable for all contributors, such as the
`npx` example above. Keep local-build configs with absolute paths in your user
config or an uncommitted local override.

### Visible Chrome cannot find the Linux display

If desktop applications open normally but `browser_start` reports that
`DISPLAY` or `WAYLAND_DISPLAY` is missing, the Codex MCP process did not inherit
the graphical session environment. Check the display used by the desktop
session:

```bash
printenv DISPLAY
```

Forward that value to Pilot in the applicable Codex `config.toml`. For example,
if the command prints `:1`:

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
env = { DISPLAY = ":1" }
```

Restart Codex after changing the configuration so the Pilot MCP server starts
with the updated environment. If the graphical session requires an Xauthority
cookie, forward `XAUTHORITY` in the same `env` map.

### Local build

When developing pilot itself, build the package first and point Codex at the
compiled server:

```bash
pnpm run build
codex mcp add pilot-local -- node /path/to/pilot/dist/mcp/index.js
```

Or use the equivalent project-scoped config:

```toml
[mcp_servers.pilot]
command = "node"
args = ["/path/to/pilot/dist/mcp/index.js"]
```

Do not commit project-scoped local-build configs with absolute paths; they are
machine-specific.

## Claude Code Integration

Add the MCP server to Claude Code:

```bash
# Via npx (no install required)
claude mcp add pilot -- npx @everydaydevopsio/pilot

# Or from a local build
claude mcp add pilot -- node /path/to/pilot/dist/mcp/index.js
```

Or add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "pilot": {
      "type": "stdio",
      "command": "npx",
      "args": ["@everydaydevopsio/pilot"]
    }
  }
}
```

## MCP Tools

**Browser Lifecycle:**

| Tool              | Description                                         |
| ----------------- | --------------------------------------------------- |
| `browser_start`   | Launch Chrome                                       |
| `browser_stop`    | Stop Chrome (or disconnect from external Chrome)    |
| `browser_connect` | Connect to an existing Chrome with remote debugging |

**Snapshot & Find:**

| Tool               | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `browser_snapshot` | Accessibility snapshot with element refs (e1, e2, ...) |
| `browser_find`     | Find elements by role, name, or text                   |

**Interaction (ref-based):**

| Tool                | Description                                         |
| ------------------- | --------------------------------------------------- |
| `browser_click`     | Click by ref, CSS selector, or coordinates          |
| `browser_type`      | Type text into ref, selector, or focused element    |
| `browser_fill`      | Replace field value (React/Vue/Svelte compatible)   |
| `browser_hover`     | Hover over element by ref or coordinates            |
| `browser_press_key` | Press key or combo (Enter, Tab, Control+a, etc.)    |
| `browser_select`    | Select option by value, label, or index             |
| `browser_check`     | Toggle checkbox/radio                               |
| `browser_scroll`    | Scroll element into view, by direction, or absolute |

**Inspection:**

| Tool                      | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `browser_screenshot`      | Capture viewport or full page screenshot          |
| `browser_navigate`        | Navigate to URL (with origin security check)      |
| `browser_evaluate`        | Execute JavaScript and return result              |
| `browser_wait`            | Wait for selector, network idle, or fixed delay   |
| `browser_page_info`       | Get current URL, title, and ready state           |
| `browser_viewport_resize` | Resize the viewport to new dimensions             |
| `browser_styles`          | Inspect computed styles, CSS rules, and box model |

**Network & Console:**

| Tool              | Description                                   |
| ----------------- | --------------------------------------------- |
| `browser_network` | List/get/clear captured network requests      |
| `browser_console` | List/clear console messages with stack traces |
| `browser_errors`  | List/clear runtime errors and exceptions      |

**Files & Dialogs:**

| Tool                | Description                            |
| ------------------- | -------------------------------------- |
| `browser_dialog`    | Handle alert/confirm/prompt dialogs    |
| `browser_upload`    | Upload files to file input elements    |
| `browser_downloads` | Track file downloads (list/wait/clear) |

**Performance:**

| Tool                  | Description                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| `browser_performance` | Start/stop tracing; analyze navigation timing, long tasks, slow requests |

**Tab Management:**

| Tool           | Description                               |
| -------------- | ----------------------------------------- |
| `browser_tabs` | List/new/select/close tabs (consolidated) |

<details>
<summary>Legacy tools (backward compatible)</summary>

| Tool                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| `browser_list_tabs`        | List all open tabs                           |
| `browser_new_tab`          | Open a new tab                               |
| `browser_close_tab`        | Close a tab                                  |
| `browser_switch_tab`       | Switch to a tab                              |
| `browser_get_console_logs` | Get buffered console messages with filters   |
| `browser_get_errors`       | Get console errors (and optionally warnings) |
| `browser_clear_errors`     | Clear the console message buffer             |

</details>

## Configuration

All configuration via environment variables.

| Env var                   | Default                    | Description                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PILOT_CDP_PORT`          | `9222`                     | CDP port when connecting to an existing Chrome (ignored when `browser_start` launches Chrome)                                                                                                                                                                        |
| `PILOT_CDP_HOST`          | `127.0.0.1`                | CDP host when connecting to an existing Chrome (ignored when `browser_start` launches Chrome)                                                                                                                                                                        |
| `PILOT_LOG_LEVEL`         | `info`                     | Pino log level                                                                                                                                                                                                                                                       |
| `PILOT_CHROME_PATH`       | (auto)                     | Path to Chrome executable                                                                                                                                                                                                                                            |
| `PILOT_HEADLESS`          | `false`                    | Run Chrome headless. Accepts `true`/`1` or `false`/`0`.                                                                                                                                                                                                              |
| `PILOT_MCP_BUFFER_SIZE`   | `1000`                     | Console message buffer size                                                                                                                                                                                                                                          |
| `PILOT_PROFILE_NAME`      | `profile1`                 | Persistent browser profile name. Profiles are stored under `$XDG_DATA_HOME/pilot/<name>` (default `~/.local/share/pilot/<name>`).                                                                                                                                    |
| `PILOT_RESPONSIVE`        | (preset)                   | Responsive viewport mode. When `true`, the page uses real window dimensions and reflows on resize. Desktop presets default to `true`; mobile/tablet presets leave this unset (locked viewport). Set to `false` to lock the viewport with `setDeviceMetricsOverride`. |
| `PILOT_CHROME_NO_SANDBOX` | (auto)                     | Force `--no-sandbox` on/off. Accepts `true`/`1` or `false`/`0`. When unset, the flag is auto-applied only when running as root on Linux. See [Chrome sandbox](#chrome-sandbox) below.                                                                                |
| `PILOT_ALLOWED_ORIGINS`   | (none)                     | Comma-separated origin allow list. Supports wildcards (`*.example.com`). When set, only matching origins can be navigated to.                                                                                                                                        |
| `PILOT_BLOCKED_ORIGINS`   | (none)                     | Comma-separated origin block list. Block wins over allow. Supports wildcards.                                                                                                                                                                                        |
| `PILOT_REDACT_HEADERS`    | (defaults)                 | Additional headers to redact in network inspection. Default: Authorization, Cookie, Set-Cookie, X-Api-Key, Proxy-Authorization.                                                                                                                                      |
| `PILOT_UPLOAD_ROOTS`      | (cwd)                      | Comma-separated allowed directories for file uploads.                                                                                                                                                                                                                |
| `PILOT_DOWNLOAD_DIR`      | `<tmpdir>/pilot-downloads` | Directory for tracked downloads. Defaults to a `pilot-downloads` subdirectory under the OS temp dir.                                                                                                                                                                 |

> **Tip — running headless:** By default Chrome opens a visible browser window. To run headless (no visible window), set `PILOT_HEADLESS=true` or ask the AI agent: _"set headless to true"_ (or _"run Chrome headless"_). The agent will set `PILOT_HEADLESS=true` before calling `browser_start`.

### Responsive viewport mode

Desktop presets (`desktop`, `desktop-small`) default to **responsive mode**. In responsive mode, the page uses the real browser window dimensions and reflows naturally when the window is resized — just like a normal browser. This is useful for testing responsive websites where you want the layout to react to window changes.

Mobile and tablet presets use a **locked viewport** (via `setDeviceMetricsOverride`) to emulate exact device dimensions regardless of the actual window size.

To lock the viewport on desktop (the old behavior), set `responsive: false` in `browser_start` or `PILOT_RESPONSIVE=false`.

#### Resizing at runtime

Use `browser_viewport_resize` to change the viewport dimensions while the browser is running:

```
browser_viewport_resize({ width: 1024, height: 768 })
```

This sets both the window size and the rendering viewport, and disables responsive mode so the page stays locked at the specified dimensions. Useful for testing specific breakpoints or device sizes without restarting the browser.

### Chrome sandbox

The Chrome renderer sandbox is the primary defense against a compromised page (or page content reaching the agent via prompt injection) running code with the privileges of this process. An AI agent that visits arbitrary URLs is precisely the case where the sandbox matters most, so the server keeps it enabled by default.

`--no-sandbox` is auto-applied only when the server is running as **root** on Linux — the most common case where Chrome's user-namespace sandbox fails to initialize. In every other case (non-root user, macOS, Windows, non-root inside a container) the sandbox stays on.

Override the auto-detection with `PILOT_CHROME_NO_SANDBOX`:

- `PILOT_CHROME_NO_SANDBOX=true` — force the flag on (e.g. an environment where the sandbox cannot work and you have accepted the risk).
- `PILOT_CHROME_NO_SANDBOX=false` — force the flag off, even when running as root.

When the flag is applied, the server emits a `warn`-level log on launch so operators can see that the agent is browsing without the renderer sandbox. The safest Docker setup is to run the container as a non-root user with a working Chrome sandbox helper, rather than relying on `--no-sandbox`.

## Testing

```bash
# Unit tests
pnpm run test

# With coverage (50% threshold enforced)
pnpm run test:coverage

# MCP E2E tests (requires Chrome installed)
pnpm run test:e2e:mcp

# MCP E2E tests via Docker (no local Chrome needed)
pnpm run test:e2e:mcp:docker
```

## Project Structure

```
src/
├── browser.ts              # Backward-compatible re-export barrel
├── browser/                # Core browser modules
│   ├── browser-manager.ts  # BrowserManager orchestrator
│   ├── chrome-launcher.ts  # Chrome process management
│   ├── connection.ts       # CDP connection + reconnect
│   ├── events.ts           # CDP event listeners
│   ├── tabs.ts             # Tab management
│   ├── types.ts            # Shared types
│   ├── inspect/            # Snapshot, styles, element refs
│   ├── interaction/        # Dialogs, uploads, downloads, ref resolver
│   ├── network/            # Network buffer, monitor, header redaction
│   ├── performance/        # Tracing + analysis
│   └── security/           # Origin allow/block lists
├── cli/                    # CLI commands (init, Linux preflight)
├── commands/               # Tool command implementations
├── mcp/                    # MCP server + tool registrations
└── util/                   # Config, logger
```

## Pilot Skill for Claude Code and Codex

The `init` command installs a project skill that teaches Claude Code or Codex how
to run and troubleshoot Pilot.

### Initialize the Skill

```bash
# Using npx (no installation required)
npx @everydaydevopsio/pilot init --agent claude
npx @everydaydevopsio/pilot init --agent codex

# Install for both agents
npx @everydaydevopsio/pilot init --agent both

# If installed globally
pilot init --agent codex

# Overwrite existing skill
pilot init --agent codex --force
```

The Claude target is `.claude/skills/pilot/SKILL.md`; the Codex target is
`.agents/skills/pilot/SKILL.md`. Omitting `--agent` continues to default to
Claude for compatibility. Restart the agent after installation if it does not
detect the skill immediately.

### Using the Skill

Ask Claude or Codex to **"use Pilot to open and debug this page"**, or invoke the
`pilot` skill explicitly. The skill teaches the agent to:

1. Start Chrome and navigate with the Pilot MCP tools
2. Use accessibility snapshots and stable element refs for interaction
3. Inspect console errors, failed requests, styles, and performance data
4. Diagnose Linux display, profile, Chrome, and loopback preflight failures

### Error Watching Workflow

1. Ask the agent: "Use pilot to open localhost:3000 and watch for errors"
2. The agent clears the error buffer and tells you to proceed
3. You interact with the app in Chrome
4. The agent checks for errors and can fix them in your source code

## License

MIT License - see [LICENSE](LICENSE) file for details.
