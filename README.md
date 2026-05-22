# ai-agent-browser

[![CI](https://github.com/markcallen/ai-agent-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/ci.yml)
[![E2E](https://github.com/markcallen/ai-agent-browser/actions/workflows/e2e.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/e2e.yml)
[![Smoke](https://github.com/markcallen/ai-agent-browser/actions/workflows/smoke.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/smoke.yml)
[![License](https://img.shields.io/github/license/markcallen/ai-agent-browser)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/markcallen/ai-agent-browser)](https://github.com/markcallen/ai-agent-browser/releases)

A lightweight Node.js/TypeScript MCP server that gives AI agents DevTools-grade control over a running Chrome instance. Connects to Chrome via the Chrome DevTools Protocol (CDP) and exposes MCP tools for screenshots, navigation, clicks, typing, JavaScript evaluation, and live console/network event monitoring.

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

### With Docker

To use the MCP server from a Docker container, pass `-i` so stdin stays open for stdio communication:

```bash
docker build -t ai-agent-browser .
claude mcp add ai-agent-browser -- docker run -i --rm ai-agent-browser
```

## Claude Code Integration

Add the MCP server to Claude Code:

```bash
# Via npx (no install required)
claude mcp add ai-agent-browser -- npx @markcallen/ai-agent-browser

# Or from a local build
claude mcp add ai-agent-browser -- node /path/to/ai-agent-browser/dist/mcp/index.js
```

Or add to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "ai-agent-browser": {
      "type": "stdio",
      "command": "npx",
      "args": ["@markcallen/ai-agent-browser"]
    }
  }
}
```

## MCP Tools

**Browser Lifecycle:**

| Tool            | Description   |
| --------------- | ------------- |
| `browser_start` | Launch Chrome |
| `browser_stop`  | Stop Chrome   |

**Browser Control:**

| Tool                 | Description                                     |
| -------------------- | ----------------------------------------------- |
| `browser_screenshot` | Capture viewport or full page screenshot        |
| `browser_navigate`   | Navigate to URL and wait for load               |
| `browser_click`      | Click element by CSS selector or coordinates    |
| `browser_type`       | Type text into focused element or selector      |
| `browser_evaluate`   | Execute JavaScript and return result            |
| `browser_wait`       | Wait for selector, network idle, or fixed delay |
| `browser_page_info`  | Get current URL, title, and ready state         |

**Error Monitoring:**

| Tool                       | Description                                  |
| -------------------------- | -------------------------------------------- |
| `browser_get_console_logs` | Get buffered console messages with filters   |
| `browser_get_errors`       | Get console errors (and optionally warnings) |
| `browser_clear_errors`     | Clear the console message buffer             |

## Configuration

All configuration via environment variables.

| Env var                 | Default     | Description                                                                                                                                                                                   |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AAB_CDP_PORT`          | `9222`      | CDP port when connecting to an existing Chrome (ignored when `browser_start` launches Chrome)                                                                                                 |
| `AAB_CDP_HOST`          | `127.0.0.1` | CDP host when connecting to an existing Chrome (ignored when `browser_start` launches Chrome)                                                                                                 |
| `AAB_LOG_LEVEL`         | `info`      | Pino log level                                                                                                                                                                                |
| `AAB_CHROME_PATH`       | (auto)      | Path to Chrome executable                                                                                                                                                                     |
| `AAB_HEADLESS`          | `true`      | Run Chrome headless                                                                                                                                                                           |
| `AAB_MCP_BUFFER_SIZE`   | `1000`      | Console message buffer size                                                                                                                                                                   |
| `AAB_CHROME_NO_SANDBOX` | (auto)      | Force `--no-sandbox` on/off. Accepts `true`/`1` or `false`/`0`. When unset, the flag is auto-applied only when running as root on Linux/Windows. See [Chrome sandbox](#chrome-sandbox) below. |

> **Tip — seeing the browser window:** By default Chrome runs headless (no visible window). To watch the browser while the agent works, ask the AI agent: _"set headless to false"_ (or _"run Chrome with a visible window"_). The agent will set `AAB_HEADLESS=false` before calling `browser_start`, and a Chrome window will appear on your desktop.

### Chrome sandbox

The Chrome renderer sandbox is the primary defense against a compromised page (or page content reaching the agent via prompt injection) running code with the privileges of this process. An AI agent that visits arbitrary URLs is precisely the case where the sandbox matters most, so the server keeps it enabled by default.

`--no-sandbox` is auto-applied only when the server is running as **root** on Linux or Windows — the most common case where Chrome's user-namespace sandbox fails to initialize. In every other case (non-root user, macOS, non-root inside a container) the sandbox stays on.

Override the auto-detection with `AAB_CHROME_NO_SANDBOX`:

- `AAB_CHROME_NO_SANDBOX=true` — force the flag on (e.g. an environment where the sandbox cannot work and you have accepted the risk).
- `AAB_CHROME_NO_SANDBOX=false` — force the flag off, even when running as root.

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
├── browser.ts         # CDP connection + reconnect logic
├── cli/               # CLI commands
│   ├── init.ts        # Init command (creates skill)
│   └── skill-template.ts  # SKILL.md template
├── commands/          # CDP command implementations
│   ├── screenshot.ts
│   ├── navigate.ts
│   ├── click.ts
│   ├── type.ts
│   ├── evaluate.ts
│   ├── wait.ts
│   └── page_info.ts
├── mcp/               # MCP server (sole entry point)
│   ├── index.ts       # Entry point (stdio)
│   ├── server.ts      # MCP server setup
│   ├── console-buffer.ts  # Console message buffer
│   └── tools/
│       ├── browser.ts # Browser control tools
│       └── errors.ts  # Error monitoring tools
└── util/
    ├── config.ts      # Configuration loading
    └── logger.ts      # Pino logger setup
```

## Claude Code Skill

The `init` command creates a Claude Code skill in your project that automates the browser debugging workflow.

### Initialize the Skill

```bash
# Using npx (no installation required)
npx @markcallen/ai-agent-browser init

# If installed globally
aab init

# Overwrite existing skill
aab init --force
```

This creates `.claude/skills/debug-browser/SKILL.md` in your project.

### Using the Skill

In Claude Code, say **"debug in browser"** or use **/debug-browser**. The skill will:

1. Add the MCP server to your Claude Code session
2. Call `browser_start` to launch Chrome
3. Spawn a background sub-agent to watch for console errors

### Error Watching Workflow

1. Ask Claude: "Watch for errors while I test the checkout flow"
2. Claude clears the error buffer and tells you to proceed
3. You interact with the app in Chrome
4. Claude periodically checks for errors and can fix them in your source code

## License

MIT License - see [LICENSE](LICENSE) file for details.
