export default async function globalTeardown(): Promise<void> {
  // Each test manages its own MCP server process via McpTestClient.
  // Nothing to clean up globally.
}
