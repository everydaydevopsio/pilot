# Repository agent instructions

## Local Pilot MCP configuration

- Keep `.codex/config.toml` and `.mcp.json` configured to run the compiled local Pilot server with `node dist/mcp/index.js`. Do not replace the local command with the published npm package in this repository.
- Keep `.codex/config.toml` synchronized with every tool exported by `src/mcp/tools/names.ts`. All listed Pilot tools must remain enabled and use the already-approved approval mode.
- When adding, renaming, or removing a Pilot MCP tool, update the Codex tool allowlist and verify the Claude `.mcp.json` local-server configuration in the same change.
- Build Pilot with `pnpm run build` before testing either MCP configuration so `dist/mcp/index.js` reflects the current source.
- Preserve environment entries needed by the local development session, such as the Linux `DISPLAY` value. Do not assume one display number works on every machine or remote session.
