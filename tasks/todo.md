# Task: BrowserDriver interface with CdpDriver and capability gating

## Context

- Owner: mark
- Date: 2026-11-04
- Mode: Autonomous (refactor, no behaviour change for Chrome)
- PRD Section: Architecture → Browser drivers
- Issue: https://github.com/everydaydevopsio/pilot/issues/62

## Scope

- In scope: `BrowserDriver` interface, `CdpDriver`, capability model and gate,
  driver factory, `session.browser` in `browser_status`, tests.
- Out of scope: Firefox/Safari/WebKit drivers (#58–#61), user-facing browser
  selection.

## Acceptance Criteria

- AC1: MCP tools do not import `chrome-remote-interface` or receive a CDP client.
- AC2: `CdpDriver` supports every capability; existing tools behave as before.
- AC3: Missing capabilities fail with `<tool> is not supported by <browser>`
  before the driver is called.
- AC4: `createDriver` builds chrome and links tracking issues for the others.
- AC5: `browser_status` includes `session.browser`.
- AC6: Unit tests for driver, gate, factory, and tool delegation; E2E for every
  browser-dependent tool.

## Execution Checklist

- [x] Driver types, capabilities, factory, `CdpDriver`
- [x] Port every MCP tool to `requireDriver` + capability gate
- [x] Unit tests (driver, gate, factory, tools, network, navigate, runtime)
- [x] E2E suite for previously uncovered tools (`e2e/mcp/driver-tools.test.ts`)
- [x] PRD and README updated

## Test Strategy

- Unit: `test/browser/driver/*`, `test/mcp/driver-context.test.ts`,
  `test/mcp/tools.test.ts`.
- E2E: full MCP suite against real Chrome, plus `driver-tools.test.ts`.
- Failure paths: missing capability, no browser, unsupported browser kind,
  failed connect, invalid tab actions.
- Requirement-to-test mapping: tests reference `#62 ACn` in describe comments.

## Rollback Strategy

- Trigger: any Chrome tool regression after release.
- Rollback steps: revert the merge commit; no data or config migration.
- Validation after rollback: E2E suite green.

## Outcome

- Result: unit 489 passed, 77.3% line coverage (main: 49.7%); E2E 85 passed.
- Evidence: `pnpm run test:coverage`, `PILOT_HEADLESS=true pnpm exec jest --config jest.e2e-mcp.config.js`.
- PRD updates: Architecture → Browser drivers; acceptance criterion 18.
