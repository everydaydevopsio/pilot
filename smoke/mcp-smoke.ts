/**
 * MCP Smoke Test
 *
 * Verifies the MCP server starts and exposes the expected tool list.
 * Does NOT require a running browser — no Chrome/Chromium needed.
 *
 * Output: one [PASS] / [FAIL] line per use case, then a final summary.
 * Exit code: 0 if all checks pass, 1 on any failure.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

const EXPECTED_TOOLS = [
  'browser_start',
  'browser_stop',
  'browser_screenshot',
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_evaluate',
  'browser_wait',
  'browser_page_info',
  'browser_get_console_logs',
  'browser_get_errors',
  'browser_clear_errors'
];

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function pass(name: string, detail?: string): void {
  results.push({ name, passed: true, detail });
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`[PASS] ${name}${suffix}`);
}

function fail(name: string, detail?: string): void {
  results.push({ name, passed: false, detail });
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`[FAIL] ${name}${suffix}`);
}

function printSummary(): void {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`\n=== Results: ${passed}/${total} passed ===`);
  if (failed === 0) {
    console.log('SMOKE TEST PASSED');
  } else {
    const failures = results
      .filter((r) => !r.passed)
      .map((r) => `  - ${r.name}${r.detail ? `: ${r.detail}` : ''}`)
      .join('\n');
    console.log(`Failures:\n${failures}`);
    console.log('SMOKE TEST FAILED');
  }
}

async function main(): Promise<void> {
  console.log('=== MCP Smoke Test ===\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [resolve('dist/mcp/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });

  const client = new Client({ name: 'mcp-smoke-test', version: '1.0.0' });

  // ── Use case 1: server starts and accepts a connection ─────────────────────
  try {
    await client.connect(transport);
    pass('MCP server starts and accepts connections');
  } catch (err) {
    fail('MCP server starts and accepts connections', String(err));
    printSummary();
    process.exit(1);
  }

  // ── Use case 2: tools/list returns a non-empty list ────────────────────────
  let toolNames: string[] = [];
  try {
    const response = await client.listTools();
    toolNames = response.tools.map((t) => t.name);
    if (toolNames.length > 0) {
      pass('Tool list is non-empty', `${toolNames.length} tools returned`);
    } else {
      fail('Tool list is non-empty', 'server returned 0 tools');
    }
  } catch (err) {
    fail('Tool list is non-empty', String(err));
    await client.close().catch(() => undefined);
    printSummary();
    process.exit(1);
  }

  // ── Use case 3: expected tool count matches ────────────────────────────────
  if (toolNames.length === EXPECTED_TOOLS.length) {
    pass(
      `Tool count matches expected`,
      `${toolNames.length} of ${EXPECTED_TOOLS.length}`
    );
  } else {
    fail(
      `Tool count matches expected`,
      `got ${toolNames.length}, want ${EXPECTED_TOOLS.length}`
    );
  }

  // ── Use case 4: each expected tool is present ──────────────────────────────
  for (const name of EXPECTED_TOOLS) {
    if (toolNames.includes(name)) {
      pass(`Tool registered: ${name}`);
    } else {
      fail(`Tool registered: ${name}`, 'missing from tool list');
    }
  }

  // ── Use case 5: no unrecognised extra tools ────────────────────────────────
  const extra = toolNames.filter((t) => !EXPECTED_TOOLS.includes(t));
  if (extra.length === 0) {
    pass('No unrecognised tools registered');
  } else {
    fail('No unrecognised tools registered', `unexpected: ${extra.join(', ')}`);
  }

  await client.close().catch(() => undefined);

  printSummary();

  const anyFailed = results.some((r) => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
