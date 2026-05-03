# AGENTS.md

This file provides project-specific overrides for agents working in this repository.
See [~/.agents/AGENTS.md](~/.agents/AGENTS.md) for the global execution framework.

## Publishing Override

**This repository publishes to GitHub Packages, not npmjs.**

The `publishing-apps` and `publishing-libraries` rules default to npmjs for TypeScript/Node packages.
That default does **not** apply here. Apply the following rules instead:

- Registry: `https://npm.pkg.github.com`
- Package name must be scoped: `@markcallen/ai-agent-browser`
- Authentication uses `GITHUB_TOKEN` (automatic in Actions) — no `NPM_TOKEN` secret is needed.
- The publish job must have `packages: write` permission.
- Do **not** add `--provenance` or `--access public` flags; GitHub Packages does not support them for org-scoped packages via GITHUB_TOKEN.
- Do **not** reference `secrets.NPM_TOKEN` anywhere in publish workflows.

### .npmrc for local publish (if needed)

```
@markcallen:registry=https://npm.pkg.github.com
```

### Workflow reference

The release workflow is `.github/workflows/publish.yml`. It uses the bump-and-tag pattern
(patch/minor/major via `workflow_dispatch`) and publishes from the created tag.
