# Repository agent instructions

## Local setup

- Run `make setup` before building, testing, or committing in a fresh clone or a new local shell environment. It installs the pinned Node and pnpm versions, project dependencies, and the `pre-commit` and `pre-push` Git hooks.
- Re-run `make setup` if `.nvmrc`, the `packageManager` field in `package.json`, or `.pre-commit-config.yaml` changes, or if `.git/hooks/pre-commit` or `.git/hooks/pre-push` is missing.
- Do not bypass the hooks with `--no-verify`; fix the reported lint, format, build, or test failure instead.

## Local Pilot MCP configuration

- Keep `.codex/config.toml` and `.mcp.json` configured to run the compiled local Pilot server with `node dist/mcp/index.js`. Do not replace the local command with the published npm package in this repository.
- Keep `.codex/config.toml` synchronized with every tool exported by `src/mcp/tools/names.ts`. All listed Pilot tools must remain enabled and use the already-approved approval mode.
- When adding, renaming, or removing a Pilot MCP tool, update the Codex tool allowlist and verify the Claude `.mcp.json` local-server configuration in the same change.
- Build Pilot with `pnpm run build` before testing either MCP configuration so `dist/mcp/index.js` reflects the current source.
- Preserve environment entries needed by the local development session, such as the Linux `DISPLAY` value. Do not assume one display number works on every machine or remote session.

## Releases

- Always release by running the `publish.yml` workflow with a `release_type` of `patch`, `minor`, or `major`, for example `gh workflow run publish.yml -f release_type=patch`. The workflow computes the version, updates `package.json` and `CHANGELOG.md`, creates and pushes the tag, publishes to npm, and creates the GitHub release.
- Do not create or push release tags directly, and do not bump the version in `package.json` or edit the release entries in `CHANGELOG.md` by hand.
