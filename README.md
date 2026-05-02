# ai-agent-browser

[![CI](https://github.com/markcallen/ai-agent-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/ci.yml)
[![E2E](https://github.com/markcallen/ai-agent-browser/actions/workflows/e2e.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/e2e.yml)
[![Smoke](https://github.com/markcallen/ai-agent-browser/actions/workflows/smoke.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/smoke.yml)
[![License](https://img.shields.io/github/license/markcallen/ai-agent-browser)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/markcallen/ai-agent-browser)](https://github.com/markcallen/ai-agent-browser/releases)
[![npm version](https://img.shields.io/npm/v/ai-agent-browser.svg)](https://www.npmjs.com/package/ai-agent-browser)
[![npm downloads](https://img.shields.io/npm/dm/ai-agent-browser.svg)](https://www.npmjs.com/package/ai-agent-browser)

A lightweight Node.js/TypeScript service that gives AI agents DevTools-grade control over a running Chrome instance. Connects to Chrome via the Chrome DevTools Protocol (CDP) and exposes a **WebSocket API** for screenshots, navigation, clicks, typing, JavaScript evaluation, and live console/network event streaming.

## Prerequisites

- **Node.js**: Use the version in `.nvmrc`. Supported: Node 22 (LTS) or 24 (Active LTS).
- [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager)
- [pnpm](https://pnpm.io) package manager
- [pre-commit](https://pre-commit.com) for Git hooks (optional but recommended)

```bash
nvm install   # installs the version from .nvmrc (Node 24)
nvm use
pnpm install

# Optional: Install Git hooks
pre-commit install
pre-commit install --hook-type pre-push
```

## Quick Start

```bash
# Build
pnpm run build

# Run (requires Chrome with --remote-debugging-port=9222)
pnpm start

# Development (hot reload)
pnpm run dev
```

### With Docker Compose

Using Make (recommended):

```bash
make up          # Build and start the production stack
make down        # Stop the stack
make logs        # Follow logs

make up-local    # Build and start with hot reload (dev mode)
make down-local  # Stop the dev stack
make logs-local  # Follow dev logs
```

Or using Docker Compose directly:

```bash
# Production stack
docker compose up --build

# Development with hot reload
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build --watch
```

## Configuration

| Env var         | CLI flag      | Default     | Description                   |
| --------------- | ------------- | ----------- | ----------------------------- |
| `AAB_PORT`      | `--port`      | `8765`      | HTTP/WS listen port           |
| `AAB_HOST`      | `--host`      | `127.0.0.1` | Bind address                  |
| `AAB_CDP_PORT`  | `--cdp-port`  | `9222`      | Chrome DevTools Protocol port |
| `AAB_CDP_HOST`  | `--cdp-host`  | `127.0.0.1` | CDP host                      |
| `AAB_LOG_LEVEL` | `--log-level` | `info`      | Pino log level                |

Copy `.env.example` to `.env` and adjust as needed.

## WebSocket Protocol

Connect to `ws://127.0.0.1:8765/ws`. All messages are JSON text frames.

### Commands (client → server)

```json
{ "id": "1", "method": "screenshot", "params": { "format": "png" } }
```

### Response (server → client)

```json
{
  "id": "1",
  "ok": true,
  "result": {
    "dataUrl": "data:image/png;base64,...",
    "width": 1280,
    "height": 800
  }
}
```

### Available Commands

| Command      | Description                                    |
| ------------ | ---------------------------------------------- |
| `screenshot` | Capture viewport or full page                  |
| `navigate`   | Navigate to URL with load wait                 |
| `click`      | Click element (by CSS selector or coordinates) |
| `type`       | Type text into focused element                 |
| `evaluate`   | Execute JavaScript in page context             |
| `wait`       | Wait for selector, network idle, or fixed ms   |
| `page_info`  | Get current URL, title, readyState             |

### Events (server → client, automatic)

| Event                  | Description                    |
| ---------------------- | ------------------------------ |
| `console_message`      | Browser console output         |
| `network_request`      | Outgoing network request       |
| `network_response`     | Network response received      |
| `network_failed`       | Network request failed         |
| `page_navigated`       | Main frame navigation complete |
| `browser_connected`    | CDP connection (re)established |
| `browser_disconnected` | CDP connection lost            |

## HTTP Endpoints

| Endpoint          | Description                     |
| ----------------- | ------------------------------- |
| `GET /health`     | Service health check            |
| `GET /screenshot` | PNG screenshot (no WS required) |

## Testing

```bash
# Unit tests
pnpm run test

# With coverage (50% threshold enforced)
pnpm run test:coverage

# E2E tests (requires Chrome installed)
pnpm run test:e2e

# E2E tests via Docker (no local Chrome needed)
pnpm run test:e2e:docker

# Smoke test (builds Docker image and tests health endpoint)
pnpm run test:smoke
```

## Project Structure

```
src/
├── index.ts           # Entry point, CLI arg parsing
├── server.ts          # Fastify HTTP + WS server
├── session.ts         # Single-session WS handler
├── browser.ts         # CDP connection + reconnect logic
├── cli/               # CLI commands
│   ├── init.ts        # Init command (creates skill)
│   └── skill-template.ts  # SKILL.md template
├── commands/          # WebSocket command implementations
│   ├── screenshot.ts
│   ├── navigate.ts
│   ├── click.ts
│   ├── type.ts
│   ├── evaluate.ts
│   ├── wait.ts
│   └── page_info.ts
├── mcp/               # MCP server for Claude Code
│   ├── index.ts       # MCP entry point (stdio)
│   ├── server.ts      # MCP server setup
│   ├── ws-client.ts   # WebSocket client
│   ├── console-buffer.ts  # Console message buffer
│   └── tools/
│       ├── browser.ts # Browser control tools
│       └── errors.ts  # Error monitoring tools
└── util/
    ├── config.ts      # Configuration loading
    └── logger.ts      # Pino logger setup
```

## MCP Server (Claude Code Integration)

The MCP server allows Claude Code to control the browser directly via MCP tools. It connects to the ai-agent-browser WebSocket API and exposes browser control and error monitoring tools.

### Setup

1. Build the project: `pnpm run build`
2. Start ai-agent-browser: `pnpm start`
3. Add to Claude Code:

```bash
claude mcp add ai-agent-browser -- node /path/to/ai-agent-browser/dist/mcp/index.js
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "ai-agent-browser": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/mcp/index.js"],
      "env": {
        "AAB_WS_URL": "ws://127.0.0.1:8765/ws"
      }
    }
  }
}
```

### MCP Tools

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

### Error Watching Workflow

1. Ask Claude: "Watch for errors while I test the checkout flow"
2. Claude clears the error buffer and tells you to proceed
3. You interact with the app in Chrome
4. Claude periodically checks for errors and can fix them in your source code

### MCP Configuration

| Env var               | Default                  | Description             |
| --------------------- | ------------------------ | ----------------------- |
| `AAB_WS_URL`          | `ws://127.0.0.1:8765/ws` | ai-agent-browser WS URL |
| `AAB_MCP_BUFFER_SIZE` | `1000`                   | Console message buffer  |

## Claude Code Skill

The `init` command creates a Claude Code skill in your project that automates the entire browser debugging workflow.

### Initialize the Skill

```bash
# Using npx (no installation required)
npx ai-agent-browser init

# If installed globally
aab init

# Overwrite existing skill
aab init --force
```

This creates `.claude/skills/debug-browser/SKILL.md` in your project.

### Using the Skill

In Claude Code, say **"debug in browser"** or use **/debug-browser**. The skill will:

1. Detect your OS (macOS, Linux, Windows)
2. Start Chrome with `--remote-debugging-port=9222`
3. Launch ai-agent-browser service
4. Add the MCP server to your Claude Code session
5. Spawn a background sub-agent to watch for console errors

### Example Session

```
You: "debug in browser"

Claude: [Detects macOS, starts Chrome, starts ai-agent-browser, adds MCP]
        "Browser debugging environment ready! Navigate to your app and I'll watch for errors."

You: "go to localhost:3000"

Claude: [Uses browser_navigate to go to http://localhost:3000]

[You interact with the app, a JavaScript error occurs]

Claude: "Error detected: TypeError: Cannot read property 'map' of undefined at App.tsx:42"
        [Reads the file, analyzes the bug, suggests a fix]
```

## Systemd Service

```bash
# Install to /opt/aab and enable per-display service
sudo systemctl enable aab@1.service
sudo systemctl start aab@1.service
```

See `systemd/aab@.service` for the template unit file.

## License

MIT License - see [LICENSE](LICENSE) file for details.
