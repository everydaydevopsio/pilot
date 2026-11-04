# Task: Firefox support on macOS via WebDriver BiDi

## Context

- Owner: mark
- Date: 2026-11-04
- Mode: Autonomous
- PRD Section: Architecture → Firefox driver
- Issue: https://github.com/everydaydevopsio/pilot/issues/58

## Scope

- In scope: `BidiDriver`, BiDi transport, Firefox launcher (profile dir,
  `pilot.lock`, macOS discovery, `PILOT_FIREFOX_PATH`), `browser` option on
  `browser_start`/`browser_connect` with `PILOT_BROWSER` default, JS-injected
  snapshot, Firefox profiles in `browser_status`/`browser_stop_all`, docs.
- Out of scope: Firefox on Linux/Windows (#59), Safari (#60), WebKit (#61),
  performance tracing on Firefox.

## Acceptance Criteria

- AC1: `browser_start({ browser: 'firefox' })` launches Firefox on macOS and
  every supported tool works end to end.
- AC2: Unsupported tools return a capability error naming the browser.
- AC3: E2E suite runs against Firefox with `PILOT_BROWSER=firefox`.
- AC4: README and docs list the Firefox capability matrix and setup.

## Execution Checklist

- [x] BiDi transport, value conversion, keys, network monitor
- [x] Firefox launcher and Pilot profile lock
- [x] `BidiDriver` implementing every capability except `performanceTrace`
- [x] DOM-walk accessibility snapshot shared for future WebKit driver
- [x] Browser selection in MCP tools, config, and CLI help
- [x] Firefox profiles in `browser_status` and `browser_stop_all`
- [x] Unit tests; E2E suite browser-aware plus Firefox-only cases
- [x] README, PRD, and skill updated

## Test Strategy

- Unit: `test/browser/driver/bidi-driver.test.ts` (fake transport),
  `test/browser/bidi/*`, `test/browser/firefox-launcher.test.ts`,
  `test/browser-sessions.test.ts` (Firefox profiles), factory/config/tools.
- E2E: full MCP suite with `PILOT_BROWSER=firefox`, plus Firefox-only cases in
  `e2e/mcp/driver-tools.test.ts` (capability error, styles, response body,
  `browser_connect` to a user-started Firefox).
- Failure paths: locked profile, BiDi session refused, unreachable port,
  optional BiDi commands missing, stale shared ids, blocked origins, timeouts,
  Firefox that will not exit.
- Requirement-to-test mapping: tests reference #58 in header comments; AC2 in
  `driver-tools.test.ts`.

## Rollback Strategy

- Trigger: Chrome regression or broken Firefox launch after release.
- Rollback steps: revert the merge commit; Chrome stays the default, so users
  who never set `browser`/`PILOT_BROWSER` are unaffected.
- Validation after rollback: Chrome E2E suite green.

## Outcome

- Result: unit 577 passed, 83.6% line coverage; E2E Chrome 85 passed (4
  Firefox-only skipped), E2E Firefox 154 on macOS 88 passed (1 Chrome-only
  skipped). E2E ran headless; visible Firefox was not exercised by the suite.
- Evidence: `pnpm run test:coverage`,
  `PILOT_HEADLESS=true pnpm exec jest --config jest.e2e-mcp.config.js`,
  `PILOT_BROWSER=firefox PILOT_HEADLESS=true pnpm exec jest --config jest.e2e-mcp.config.js`.
- PRD updates: Architecture → Browser drivers and Firefox driver; configuration;
  acceptance criterion 19.
