# Task: Use castoff for release notes

## Context

- Owner: mark
- Date: 2026-10-01
- Mode: Autonomous
- Issue: https://github.com/everydaydevopsio/pilot/issues/37

## Scope

- In scope: `.github/workflows/publish.yml` — generate release notes and the
  `CHANGELOG.md` entry with castoff, drop `softprops/action-gh-release`.
- Out of scope: the inconsistent tag convention (see Risks).

## Acceptance Criteria

- AC1: `bump_and_tag` runs `castoff/castoff@v2` before the release commit and
  exposes `release_notes` as a job output.
- AC2: The release commit includes the `CHANGELOG.md` entry written by
  `castoff/changelog@v2`.
- AC3: `softprops/action-gh-release` is gone; the release body is the castoff
  notes, falling back to `--generate-notes` on the tag-push path.
- AC4: A patch release published from `main` produces a GitHub Release whose
  body carries the Castoff attribution footer.

## Risks and Tradeoffs

- Risk: `workflow_dispatch` tags are unprefixed (`0.6.1`) while `push` only
  triggers on `v*`, so the tag-push path is unreachable for workflow-produced
  tags. Pre-existing; the `--generate-notes` fallback keeps it correct if the
  trigger is ever fixed. Tracked separately.
- Tradeoff: the release now hard-fails without `OPENAI_API_KEY` rather than
  silently falling back, matching `ballast` and `bosun`.

## Execution Checklist

- [x] Add castoff + changelog steps to `bump_and_tag`
- [x] Replace `softprops/action-gh-release` with `gh release create`
- [x] `actionlint` clean on `publish.yml`
- [ ] Patch release published and release body verified

## Test Strategy

- Static: `actionlint .github/workflows/publish.yml`
- Live: publish a patch release and inspect the resulting GitHub Release body
  and `CHANGELOG.md` entry.

## Rollback Strategy

- Trigger: castoff step fails, or the release body is empty/malformed.
- Rollback: revert the `publish.yml` commit; the previous `softprops` step
  restores GitHub-generated notes.
- Validation after rollback: re-run the publish workflow.

## Outcome

- Result: pending live release verification.
