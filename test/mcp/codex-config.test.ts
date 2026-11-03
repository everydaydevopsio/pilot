import { readFileSync } from 'fs';
import { join } from 'path';
import { EXPECTED_TOOLS } from '../../src/mcp/tools/names.js';

describe('.codex/config.toml', () => {
  it('allowlists every registered Pilot tool', () => {
    const toml = readFileSync(
      join(process.cwd(), '.codex', 'config.toml'),
      'utf8'
    );
    const list = toml.match(/enabled_tools\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    const enabled = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...enabled].sort()).toEqual([...EXPECTED_TOOLS].sort());
  });
});
