import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/cli/init.js';
import { SKILL_CONTENT } from '../src/cli/skill-template.js';

describe('skill installer', () => {
  let cwd: string;
  let logSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'pilot-skill-'));
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    logSpy.mockRestore();
    await rm(cwd, { recursive: true, force: true });
  });

  it.each([
    ['claude', '.claude/skills/pilot/SKILL.md'],
    ['codex', '.agents/skills/pilot/SKILL.md']
  ] as const)('installs for %s', async (agent, relativePath) => {
    await runInit({ agent, cwd });

    await expect(readFile(join(cwd, relativePath), 'utf8')).resolves.toBe(
      SKILL_CONTENT
    );
  });

  it('installs for both agents', async () => {
    await runInit({ agent: 'both', cwd });

    await expect(
      readFile(join(cwd, '.claude/skills/pilot/SKILL.md'), 'utf8')
    ).resolves.toBe(SKILL_CONTENT);
    await expect(
      readFile(join(cwd, '.agents/skills/pilot/SKILL.md'), 'utf8')
    ).resolves.toBe(SKILL_CONTENT);
  });

  it('requires --force before overwriting a skill', async () => {
    await runInit({ agent: 'codex', cwd });

    await expect(runInit({ agent: 'codex', cwd })).rejects.toThrow(
      'Use --force to overwrite.'
    );
    await expect(
      runInit({ agent: 'codex', cwd, force: true })
    ).resolves.toBeUndefined();
  });
});
