# ai-agent-browser

[![CI](https://github.com/markcallen/ai-agent-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/ci.yml)
[![Lint](https://github.com/markcallen/ai-agent-browser/actions/workflows/lint.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/lint.yml)
[![E2E](https://github.com/markcallen/ai-agent-browser/actions/workflows/e2e.yml/badge.svg)](https://github.com/markcallen/ai-agent-browser/actions/workflows/e2e.yml)
[![License](https://img.shields.io/github/license/markcallen/ai-agent-browser)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/markcallen/ai-agent-browser)](https://github.com/markcallen/ai-agent-browser/releases)

A lightweight Node.js/TypeScript service that gives AI agents DevTools-grade control over a running Chrome instance. Connects to Chrome via the Chrome DevTools Protocol (CDP) and exposes a **WebSocket API** for screenshots, navigation, clicks, typing, JavaScript evaluation, and live console/network event streaming.

## Prerequisites

- **Node.js**: Use the version in `.nvmrc`. Supported: Node 22 (LTS) or 24 (Active LTS).
- [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager)
- [pnpm](https://pnpm.io) package manager

```bash
nvm install   # installs the version from .nvmrc (Node 24)
nvm use
pnpm install
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

```bash
docker compose build
docker compose up
```

For local development with hot reload:

```bash
docker compose up --watch
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

# With coverage
pnpm run test:coverage

# E2E tests (requires Chrome installed)
pnpm run test:e2e

# E2E tests via Docker (no local Chrome needed)
pnpm run test:e2e:docker
```

## Project Structure

```
src/
├── index.ts           # Entry point, CLI arg parsing
├── server.ts          # Fastify HTTP + WS server
├── session.ts         # Single-session WS handler
├── browser.ts         # CDP connection + reconnect logic
├── commands/          # Command implementations
│   ├── screenshot.ts
│   ├── navigate.ts
│   ├── click.ts
│   ├── type.ts
│   ├── evaluate.ts
│   ├── wait.ts
│   └── page_info.ts
└── util/
    ├── config.ts      # Configuration loading
    └── logger.ts      # Pino logger setup
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
