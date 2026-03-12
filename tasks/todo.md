# Task: ai-agent-browser v0.1 Implementation

## Context

- Owner: Claude
- Date: 2026-03-11
- Mode: Autonomous

## Scope

- In scope: Full v0.1 per PRD — WebSocket server, CDP bridge, all commands/events, HTTP endpoints, tests, E2E, CI
- Out of scope: Multi-tab, authentication, MCP wrapper, streaming screenshots

## Execution Checklist

- [x] tasks/todo.md created
- [ ] package.json + pnpm init
- [ ] tsconfig.json (strict)
- [ ] .nvmrc (node 24)
- [ ] ESLint + Prettier config
- [ ] Husky + lint-staged
- [ ] MIT LICENSE
- [ ] .env.example
- [ ] src/util/config.ts
- [ ] src/util/logger.ts
- [ ] src/browser.ts
- [ ] src/events/console.ts
- [ ] src/events/network.ts
- [ ] src/commands/\*.ts (7 commands)
- [ ] src/session.ts
- [ ] src/server.ts
- [ ] src/index.ts
- [ ] systemd/aab@.service
- [ ] Jest tests (50%+ coverage)
- [ ] E2E docker-compose + tests
- [ ] GitHub Actions (lint, build, test)
- [ ] README.md with badges
- [ ] Dockerfile + docker-compose.yml

## Test Strategy

- Unit: commands, config, session logic
- Integration: server + mock CDP
- E2E: real Chrome headless via Docker
- Failure-path: timeout, malformed JSON, session conflict, Chrome disconnect

## Rollback Strategy

- Single git branch; revert commit if tests fail
