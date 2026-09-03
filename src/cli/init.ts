import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SKILL_CONTENT } from './skill-template.js';

export type SkillAgent = 'claude' | 'codex' | 'both';

const SKILL_DIRS: Record<Exclude<SkillAgent, 'both'>, string> = {
  claude: '.claude/skills/pilot',
  codex: '.agents/skills/pilot'
};

export async function runInit(
  options: { force?: boolean; agent?: SkillAgent; cwd?: string } = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const agent = options.agent ?? 'claude';
  const agents: Array<Exclude<SkillAgent, 'both'>> =
    agent === 'both' ? ['claude', 'codex'] : [agent];
  const skillPaths = agents.map((target) => ({
    target,
    path: join(cwd, SKILL_DIRS[target], 'SKILL.md')
  }));

  for (const skill of skillPaths) {
    try {
      await stat(skill.path);
      if (!options.force) {
        throw new Error(
          `Skill already exists: ${skill.path}\nUse --force to overwrite.`
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue;
      }
      throw error;
    }
  }

  for (const skill of skillPaths) {
    await mkdir(dirname(skill.path), { recursive: true });
    await writeFile(skill.path, SKILL_CONTENT, 'utf8');
    console.log(
      `\x1b[32m✓ Installed Pilot skill for ${skill.target}:\x1b[0m ${skill.path}`
    );
  }

  console.log('');
  console.log('\x1b[1mNext steps:\x1b[0m');
  console.log('  1. Configure the pilot MCP server for your agent.');
  console.log('  2. Restart the agent so it discovers the installed skill.');
  console.log('  3. Ask it to use Pilot to open or debug a web page.');
}
