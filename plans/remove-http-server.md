# Plan: Remove HTTP Server — MCP-Only Mode

## Goal

Strip every HTTP/WebSocket concern from the codebase so there is exactly one
startup mode: MCP over stdio. `src/mcp/index.ts` becomes the sole entry point.
`src/index.ts`, `src/server.ts`, `src/session.ts`, and everything that exists
only to serve HTTP are deleted.

## Context

The project was originally a WebSocket/HTTP server that AI agents polled via a
custom protocol. PR #20 added an MCP layer. PR #14 aligned the project with
Ballast rules and fixed the CI. Now that all checks are green, the HTTP layer is
surplus — the only supported integration path going forward is MCP.

---

## Files to Delete

| File                     | Reason                                                  |
| ------------------------ | ------------------------------------------------------- |
| `src/index.ts`           | HTTP server entry point; replaced by `src/mcp/index.ts` |
| `src/server.ts`          | Fastify HTTP + WebSocket server                         |
| `src/session.ts`         | WebSocket session handler                               |
| `e2e/` (whole directory) | Tests the WebSocket API; no HTTP surface will remain    |
| `scripts/smoke-test.sh`  | Hits HTTP health + screenshot endpoints                 |
| `test/server.test.ts`    | Unit tests for the HTTP server                          |
| `test/session.test.ts`   | Unit tests for the WebSocket session                    |

---

## Files to Modify

### `package.json`

- Change `bin` entry from `dist/index.js` → `dist/mcp/index.js`
- Update `main` to `dist/mcp/index.js`
- Remove scripts: `start`, `test:e2e`, `test:e2e:docker`
- Keep scripts: `test:e2e:mcp`, `test:e2e:mcp:docker`
- Add `"start": "node dist/mcp/index.js"` for the compose use case

### `src/mcp/index.ts`

- Verify it has a `#!/usr/bin/env node` shebang
- Add SIGTERM/SIGINT handlers for graceful shutdown (currently in `src/index.ts`)
- This file becomes the only CLI entry point

### `src/util/config.ts`

- Remove HTTP-only fields: `host`, `port`, `launchChrome`
- Remove the `no-launch` / `--port` / `--host` parsing
- Keep: `cdpPort`, `cdpHost`, `cdpRetryMs`, `cdpMaxRetryMs`, `logLevel`
- Update `ConfigSchema` and `loadConfig` accordingly

### `src/browser.ts`

- Remove `stop()` method — added only to make the HTTP session's
  `browser_stop` reversible; MCP creates a fresh manager per `browser_start`
  so `destroy()` is always the right call there
- Remove any `config.launchChrome` references (field is being removed)
- `destroy()`, `launch()`, `connect()`, `cleanupUserDataDir()` all stay

### `src/mcp/server.ts`

- The `loadConfig` call inside `makeBrowserManager` uses `McpConfig`'s
  `cdpPort`/`cdpHost` — this is fine; no changes required here unless
  the config refactor changes what `loadConfig` accepts

### `Dockerfile`

- Keep the `chromium` apt install (needed for `browser_start` inside a container)
- Change `CMD` from `["pnpm", "start"]` to `["node", "dist/mcp/index.js"]`
  or remove CMD entirely (MCP servers are usually host-invoked, not standalone)

### `docker-compose.yml`

- Remove `AAB_HOST`, `AAB_PORT`, and the `ports` mapping — no HTTP port
- The file's purpose becomes running the MCP server for local testing
- Consider whether this file is useful at all once HTTP is gone; if not, delete it

### `docker-compose.e2e.yml`

- Remove the `http` profile (`e2e` service) entirely
- Keep the `mcp` profile (`e2e-mcp` service)
- Rename `e2e-mcp` service to `e2e` and remove `profiles: [mcp]` so it is the
  default (no profile flag needed)

### `.github/workflows/e2e.yml`

- Remove the `e2e` job (HTTP E2E)
- Keep the `e2e-mcp` job; rename it to `e2e`
- Update the `docker compose` command to match the renamed service

### `.github/workflows/smoke.yml`

- Replace the HTTP curl-based checks with MCP smoke validation
- Simplest approach: run `pnpm run test:e2e:mcp` (the existing MCP E2E suite)
  as the smoke gate, or invoke a minimal `browser_start` + `browser_screenshot`
  via the MCP protocol

### `README.md`

- Remove the HTTP/WebSocket API reference section
- Remove CLI flags: `--port`, `--host`, `--no-launch`, `--cdp-port`, `--cdp-host`
- Update "Getting started" to show only the MCP config block for Claude Code,
  Cursor, etc.
- Update any badges that reference removed workflows

### `src/cli/init.ts` (the `aab init` command)

- Review the generated skill file — if it references WebSocket commands
  (`screenshot`, `navigate`, etc.) update it to the MCP tool names
  (`browser_screenshot`, `browser_navigate`, etc.)

---

## What Stays Untouched

- `src/browser.ts` (core CDP management)
- `src/commands/` (all command implementations)
- `src/mcp/tools/` (all MCP tool registrations)
- `src/mcp/server.ts` (MCP server factory)
- `src/mcp/console-buffer.ts`
- `src/util/logger.ts`
- Unit tests under `test/` that do not relate to HTTP server/session

---

## Implementation Sequence

Execute in this order to keep the build green at each step:

1. **Delete HTTP files** — `src/server.ts`, `src/session.ts`; run `pnpm run build`
   to confirm no remaining imports. Fix any compile errors before continuing.

2. **Update config** — remove HTTP fields from `src/util/config.ts`; update
   all callers. Run build again.

3. **Swap entry point** — delete `src/index.ts`; update `package.json` `bin`
   and `main` to `dist/mcp/index.js`; add SIGTERM/SIGINT to `src/mcp/index.ts`.
   Run build + `pnpm run test`.

4. **Clean up `src/browser.ts`** — remove `stop()` and `launchChrome` refs.

5. **Update Dockerfile and compose files** — `CMD`, `docker-compose.yml`,
   `docker-compose.e2e.yml`.

6. **Delete E2E HTTP tests** — `e2e/` directory, `test/server.test.ts`,
   `test/session.test.ts`, `scripts/smoke-test.sh`. Run `pnpm run test`.

7. **Update CI workflows** — `e2e.yml`, `smoke.yml`. Rename jobs/services.

8. **Update README** — remove HTTP API docs, update usage and badges.

9. **Review `src/cli/init.ts`** — update generated skill file if needed.

10. **Final verification** — `pnpm run build && pnpm run test:coverage`;
    open a PR and confirm all CI jobs (lint, build-and-test, e2e, smoke) pass.

---

## Open Questions to Discuss Before Starting

1. **`docker-compose.yml`** — Keep it (for running the MCP server locally in a
   container) or delete it entirely? MCP servers are typically host-invoked
   via stdio, making a long-running compose stack unusual.

2. **`aab init` skill file** — The generated file currently targets the WebSocket
   API. Should it be updated to reference MCP tools, or should `aab init` be
   removed entirely since Claude Code discovers MCP tools automatically?

3. **`--cdp-port` / `--cdp-host` CLI flags** — These are currently on the HTTP
   server entry point. Should the MCP server expose equivalent flags
   (for connecting to an externally managed Chrome), or should that be
   environment-variable-only (`AAB_CDP_HOST`, `AAB_CDP_PORT`)?
