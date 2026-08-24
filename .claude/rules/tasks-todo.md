# Branch-Local TODO Tracking

Manage `tasks/TODO.md` during branch work. Triage all unchecked items before creating a PR.

---

# Branch-Local TODO Tracking Rules

These rules define how to use `tasks/TODO.md` for branch-scoped working notes and what must happen before a PR is completed.

---

You are a branch task tracking specialist. Your role is to keep `tasks/TODO.md` accurate during a branch and ensure all outstanding items are triaged before the PR is merged.

## Repository Tool Policy

- Check `.rulesrc.json` `tools` before adding, installing, or running language tooling.
- Configured tools: typescript=pnpm,corepack.
- For TypeScript commands, prefer `pnpm`/`pnpm exec` over `npm`/`npx` when the command is project-scoped.

## What `tasks/todo.md` Is For

`tasks/todo.md` is the canonical branch-local task artifact. Use it to capture:
- Context, scope, constraints, risks, and acceptance criteria for the current branch.
- Execution checklist items with observable outcomes.
- Test strategy, failure-path coverage, rollback strategy, and completion evidence.
- Small discovered follow-ups that are expected to be resolved in the current branch.

`tasks/todo.md` is not durable external issue tracking. Work that must survive beyond the current branch belongs in the configured task system, with the issue link recorded in `tasks/todo.md`.

## Lightweight Use

Lightweight tasks may omit optional sections that do not apply, but the file must remain a subset of the structured template. Do not switch to a separate flat checklist format. Keep the sections needed to preserve acceptance criteria, execution checklist, test evidence, and outcome.

## When to Add Items Here vs. Create a Ticket Immediately

Add to `tasks/TODO.md` when:

- The item is small and likely to be resolved within the current branch.
- The item is a reminder for yourself mid-implementation.
- You are not sure yet whether it warrants a tracked issue.

Create a ticket in the configured task system immediately when:

- The item is clearly out of scope for the current branch.
- The item would block another team member or another piece of work.
- The item is a bug that could affect users now or after release.
- You know you will not resolve it in this branch.

## `tasks/todo.md` Template

```markdown
# Task: <title>

## Context
- Owner:
- Date:
- Mode: <Autonomous|Approval-Required>
- PRD Section:
- Requirement IDs:

## Scope
- In scope:
- Out of scope:

## Acceptance Criteria
- AC1:
- AC2:

## Constraints
- Constraint 1

## Risks and Tradeoffs
- Risk:
- Tradeoff:

## Execution Checklist
- [ ] Step 1 with observable outcome
- [ ] Step 2 with observable outcome

## Test Strategy
- Unit:
- Integration:
- E2E:
- Failure-path tests:
- Requirement-to-test mapping:

## Rollback Strategy
- Trigger:
- Rollback steps:
- Validation after rollback:

## Outcome
- Result:
- Evidence links/commands:
- PRD updates:
```

## `tasks/lessons.md` Template

Use `tasks/lessons.md` for durable learning after corrections, regressions, or repeated failure patterns.

```markdown
# Lessons

## <YYYY-MM-DD> <Short Title>
- Incident/bug:
- Root cause pattern:
- Early signal missed:
- Preventative rule:
- Validation added (test/check/alert):
- Next trigger to detect sooner:
```

## Issue Output Template

Use this strict issue output format when presenting work that needs a decision or durable external tracking.

```markdown
### Issue #N: <Short Description>

**Severity:** <Critical|High|Medium|Low>
**User Impact:** <who is affected and how>
**Likelihood:** <High|Medium|Low>
**Time Sensitivity:** <Immediate|This sprint|Backlog>

**Problem**
Concrete explanation with file/line references and example behavior.

**Option A (Recommended)**
- Effort:
- Risk:
- Code Impact:
- Maintenance:

**Option B**
- Effort:
- Risk:
- Code Impact:
- Maintenance:

**Option C (Optional / Do Nothing)**
- Effort:
- Risk:
- Code Impact:
- Maintenance:

**Recommendation**
Explain why Option A is best based on correctness, risk, testability, and maintenance.

**Decision Request**
Proceed with: A (recommended), B, C, or alternate direction?
```

## Before Creating a PR

When the user is about to create a PR or asks you to help prepare one, check whether `tasks/TODO.md` exists and has any unchecked items (`- [ ]`).

If unchecked items remain, **do not proceed with creating the PR** until each item has been triaged. For each unchecked item, ask the user to choose one of:

1. **Resolve it now** — implement or address it before the PR is opened.
2. **Create a task** — open an issue in the configured task system and replace the TODO entry with a link to that issue.
3. **Delete it** — remove it from `tasks/TODO.md` because it is no longer relevant.

Only proceed with the PR once every item is either checked off, linked to a tracked issue, or removed.

## Important Notes

- `tasks/TODO.md` merges into `main` intentionally — it is not gitignored.
- Items that get promoted to tracked issues should have the issue URL noted in the file before the PR is merged.
- Keep entries short and actionable — this is a scratchpad, not a design document.
- If `tasks/TODO.md` does not exist at PR time, that is fine; no triage is needed.

## What `tasks/TODO.md` Is For

`tasks/TODO.md` is a branch-scoped scratchpad for work that comes up during implementation. Use it to capture:

- Sub-tasks discovered while working that are too small to warrant a ticket right now but must not be forgotten.
- Deferred decisions or follow-up questions for the current branch.
- Small cleanup items that should happen before the PR is done.

`tasks/TODO.md` is **not** a substitute for the configured task system. It is working memory for the current branch, not durable issue tracking.

## File Format

Keep `tasks/TODO.md` as a simple markdown checklist:

```markdown
# TODO

- [ ] Add input validation to the config parser
- [ ] Follow up: confirm rate limit behavior with the API team
- [x] Write tests for the new agent content path
```

Mark items done with `[x]` as you complete them. Leave unchecked items visible so they are not forgotten.

## After Triage

Once all items are resolved, the `tasks/TODO.md` file may be:

- Left as a fully checked list (all `[x]`) — this is fine and gives a useful record of what was done.
- Cleared to an empty checklist if there are no remaining items worth keeping.

Do **not** delete `tasks/TODO.md` from the branch. It should merge into `main` so the record of branch work is preserved.
