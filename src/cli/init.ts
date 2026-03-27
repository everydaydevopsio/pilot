import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SKILL_CONTENT } from './skill-template.js';

const SKILL_DIR = '.claude/skills/debug-browser';
const SKILL_FILE = 'SKILL.md';

export async function runInit(
  options: { force?: boolean } = {}
): Promise<void> {
  const cwd = process.cwd();
  const skillDir = join(cwd, SKILL_DIR);
  const skillPath = join(skillDir, SKILL_FILE);

  // Check if skill already exists
  try {
    await stat(skillPath);
    if (!options.force) {
      console.log(`\x1b[33mSkill already exists:\x1b[0m ${skillPath}`);
      console.log('Use --force to overwrite.');
      process.exit(1);
    }
  } catch {
    // File doesn't exist, continue
  }

  // Create directory structure
  try {
    await mkdir(skillDir, { recursive: true });
  } catch (err) {
    console.error(`\x1b[31mFailed to create directory:\x1b[0m ${skillDir}`);
    console.error(err);
    process.exit(1);
  }

  // Write SKILL.md
  try {
    await writeFile(skillPath, SKILL_CONTENT, 'utf-8');
  } catch (err) {
    console.error(`\x1b[31mFailed to write skill file:\x1b[0m ${skillPath}`);
    console.error(err);
    process.exit(1);
  }

  // Success message
  console.log(`\x1b[32m✓ Created Claude Code skill:\x1b[0m ${skillPath}`);
  console.log('');
  console.log('\x1b[1mUsage:\x1b[0m');
  console.log('  In Claude Code, say "debug in browser" or use /debug-browser');
  console.log('');
  console.log('\x1b[1mThe skill will:\x1b[0m');
  console.log('  1. Start Chrome with remote debugging');
  console.log('  2. Launch the ai-agent-browser service');
  console.log('  3. Add the MCP server to your session');
  console.log('  4. Spawn an error-watching sub-agent');
  console.log('');
  console.log('\x1b[1mPrerequisites:\x1b[0m');
  console.log('  - Google Chrome installed');
  console.log(
    '  - ai-agent-browser (install with: npm install -g ai-agent-browser)'
  );
}
