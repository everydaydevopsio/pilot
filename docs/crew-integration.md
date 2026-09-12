# Crew deterministic acceptance contract

Tracked by Linear MAR-47.

Pilot remains the browser-control/evidence tool. Crew needs a deterministic non-interactive wrapper around Pilot primitives so browser acceptance is a gate, not an agent-authored claim.

## Proposed invocation

A command or API equivalent to:

```sh
pilot accept --spec acceptance.json --output evidence/
```

The specification should contain a target URL, ordered actions/assertions, timeout policy, and requested evidence. It should not contain arbitrary LLM instructions.

Example:

```json
{
  "url": "https://preview.example.com",
  "assertions": [
    {"type": "text", "value": "Dashboard"},
    {"type": "console_errors", "max": 0},
    {"type": "failed_requests", "max": 0}
  ],
  "screenshots": ["final"]
}
```

## Result

Pilot should emit structured JSON and a process exit code:

```json
{
  "status": "passed",
  "started_at": "...",
  "completed_at": "...",
  "assertions": [],
  "console_errors": [],
  "failed_requests": [],
  "runtime_errors": [],
  "artifacts": [
    {"kind": "screenshot", "path": "evidence/final.png"}
  ]
}
```

A failed required assertion exits non-zero. Crew stores the structured summary and artifact references in its evidence bundle.

## Determinism boundary

The coding agent may propose or update acceptance specifications in the PR when the work packet permits it. Crew decides which approved specification is required. Pilot executes it mechanically. The agent cannot report browser success in place of Pilot evidence.

## Initial evidence

- assertion outcomes
- final/requested screenshots
- console errors
- runtime errors
- failed network requests
- target URL and timestamps

## Implementation plan

1. Reuse existing CDP/MCP primitives behind a small acceptance runner.
2. Define a versioned JSON acceptance schema.
3. Implement headless execution and deterministic timeouts.
4. Add JSON result output and meaningful exit codes.
5. Add artifact directory handling.
6. Test success, assertion failure, console-error failure, and network failure.
7. Wire Crew's `AcceptanceProvider` adapter.

Interactive Pilot and MCP behavior should remain unchanged.