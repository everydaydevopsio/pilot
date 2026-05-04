import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const ENTRY = join(ROOT, 'dist/mcp/index.js');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
  version: string;
};

describe('CLI flags', () => {
  it('--version prints the version and exits 0', () => {
    const result = spawnSync('node', [ENTRY, '--version'], {
      encoding: 'utf-8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
    expect(result.stderr).toBe('');
  });

  it('-v prints the version and exits 0', () => {
    const result = spawnSync('node', [ENTRY, '-v'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
    expect(result.stderr).toBe('');
  });

  it('--help prints usage info and exits 0', () => {
    const result = spawnSync('node', [ENTRY, '--help'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: aab');
    expect(result.stdout).toContain('--version');
    expect(result.stdout).toContain('--help');
    expect(result.stdout).toContain('AAB_CDP_PORT');
    expect(result.stderr).toBe('');
  });

  it('-h prints usage info and exits 0', () => {
    const result = spawnSync('node', [ENTRY, '-h'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: aab');
    expect(result.stderr).toBe('');
  });

  it('--version outputs exactly one line with no MCP protocol content', () => {
    const result = spawnSync('node', [ENTRY, '--version'], {
      encoding: 'utf-8'
    });
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(pkg.version);
  });
});
