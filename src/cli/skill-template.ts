export const SKILL_CONTENT = `---
name: debug-browser
description: Add the ai-agent-browser MCP server and watch for console errors. Use this skill when the user wants to debug a web application, watch for JavaScript errors, or test their app with AI assistance.
tools:
  - Bash
  - Task
---

# Debug Browser Skill

This skill sets up a browser debugging environment for AI-assisted development using the ai-agent-browser MCP server. The MCP server manages the Chrome lifecycle automatically via \`browser_start\`.

## What This Skill Does

1. Adds the ai-agent-browser MCP server to your Claude Code session
2. Starts the browser via \`browser_start\`
3. Spawns a sub-agent to watch for console errors

## Instructions

Follow these steps in order.

### Step 1: Add MCP Server to Claude Code Session

Add the ai-agent-browser MCP server to the current Claude Code session:

\`\`\`bash
claude mcp add ai-agent-browser --scope session -- npx @markcallen/ai-agent-browser
\`\`\`

This gives you access to browser control tools like:
- \`browser_start\` - Launch Chrome
- \`browser_stop\` - Stop Chrome
- \`browser_screenshot\` - Capture screenshots
- \`browser_navigate\` - Navigate to URLs
- \`browser_click\` - Click elements
- \`browser_type\` - Type text
- \`browser_evaluate\` - Run JavaScript
- \`browser_get_errors\` - Get console errors
- \`browser_clear_errors\` - Clear error buffer

### Step 2: Start the Browser

Use the \`browser_start\` MCP tool to launch Chrome:

\`\`\`
Call browser_start with headless: false to open a visible Chrome window.
\`\`\`

### Step 3: Spawn Error-Watching Sub-Agent

Use the Task tool to spawn a background sub-agent that monitors for console errors:

\`\`\`
Spawn a sub-agent with subagent_type "general-purpose" and run_in_background: true with this prompt:

"You are an error-watching agent monitoring the browser for console errors.

Your job:
1. First, call browser_clear_errors to start with a clean slate
2. Report back that monitoring has started
3. Every 15-20 seconds, call browser_get_errors with includeWarnings: true
4. If you find errors, report them with:
   - The error message
   - The source file and line number
   - A brief analysis of what might be wrong
5. Continue monitoring until the main conversation ends

Be concise but informative when reporting errors."
\`\`\`

### Step 4: Inform the User

Tell the user:
- The browser debugging environment is ready
- They can navigate to their app using \`browser_navigate\`
- You will be notified of any console errors automatically
- They can ask you to take screenshots, click elements, or run JavaScript

## Cleanup

When done debugging, call \`browser_stop\` to shut down Chrome cleanly.

## Troubleshooting

### browser_start fails
- Check if Chrome is installed: the MCP server auto-detects common paths
- Set \`AAB_CHROME_PATH\` env var to the Chrome executable if auto-detect fails

### No errors detected
- Errors are only captured while connected
- Try \`browser_get_errors\` with \`includeWarnings: true\` to see all console output
- Verify the page has loaded: \`browser_page_info\`

## Example Session

User: "debug in browser"

Claude executes:
1. Adds MCP server to session
2. Calls \`browser_start\` (headless: false)
3. Spawns error-watching sub-agent
4. Reports: "Browser debugging environment ready! Navigate to your app and I'll watch for errors."

User: "go to localhost:3000"
Claude: Uses \`browser_navigate\` to go to http://localhost:3000

[User interacts with the app, an error occurs]

Sub-agent reports: "Error detected: TypeError: Cannot read property 'map' of undefined at App.tsx:42"

Claude: Reads App.tsx, identifies the bug, suggests a fix.
`;
