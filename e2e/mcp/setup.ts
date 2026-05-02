export default async function globalSetup(): Promise<void> {
  // MCP E2E tests run inside Docker (pnpm run test:e2e:mcp:docker).
  // Chrome and the built dist are both available in the container image.
  // Nothing to set up here.
}
