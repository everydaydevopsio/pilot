export const SKILL_CONTENT = `---
name: debug-browser
description: Start Chrome with remote debugging, launch ai-agent-browser, and watch for console errors. Use this skill when the user wants to debug a web application, watch for JavaScript errors, or test their app with AI assistance.
tools:
  - Bash
  - Task
---

# Debug Browser Skill

This skill sets up a browser debugging environment for AI-assisted development.

## What This Skill Does

1. Detects your operating system (macOS, Linux, Windows)
2. Starts Chrome with remote debugging enabled on port 9222
3. Launches the ai-agent-browser service
4. Adds the MCP server to your Claude Code session
5. Spawns a sub-agent to watch for console errors

## Instructions

Follow these steps in order. Use the Bash tool for shell commands.

### Step 1: Detect Operating System

Determine the operating system to use the correct Chrome launch command:

\`\`\`bash
uname -s
\`\`\`

This returns:
- \`Darwin\` for macOS
- \`Linux\` for Linux
- \`MINGW*\` or \`CYGWIN*\` for Windows (Git Bash)

### Step 2: Start Chrome with Remote Debugging

Based on the OS detected, start Chrome with remote debugging enabled.

**macOS (Darwin):**
\`\`\`bash
/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &
\`\`\`

**Linux:**
\`\`\`bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &
\`\`\`

**Windows (run in PowerShell or adjust path):**
\`\`\`bash
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &
\`\`\`

**Alternative: Chromium (any OS):**
\`\`\`bash
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug &
\`\`\`

Wait 2-3 seconds for Chrome to fully start before proceeding.

### Step 3: Start ai-agent-browser Service

Start the ai-agent-browser service. It will connect to Chrome via CDP:

\`\`\`bash
npx ai-agent-browser --port 8765 --cdp-port 9222 &
\`\`\`

Or if installed globally:
\`\`\`bash
aab --port 8765 --cdp-port 9222 &
\`\`\`

Wait 1-2 seconds for the service to start. You can verify it's running:
\`\`\`bash
curl -s http://127.0.0.1:8765/health | head -c 100
\`\`\`

### Step 4: Add MCP Server to Claude Code Session

Add the ai-agent-browser MCP server to the current Claude Code session:

\`\`\`bash
claude mcp add ai-agent-browser --scope session -- npx ai-agent-browser-mcp
\`\`\`

This gives you access to browser control tools like:
- \`browser_screenshot\` - Capture screenshots
- \`browser_navigate\` - Navigate to URLs
- \`browser_click\` - Click elements
- \`browser_type\` - Type text
- \`browser_evaluate\` - Run JavaScript
- \`browser_get_errors\` - Get console errors
- \`browser_clear_errors\` - Clear error buffer

### Step 5: Spawn Error-Watching Sub-Agent

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

### Step 6: Inform the User

Tell the user:
- The browser debugging environment is ready
- They can navigate to their app in the Chrome window
- You will be notified of any console errors automatically
- They can ask you to take screenshots, click elements, or run JavaScript

## Cleanup

When done debugging, clean up the background processes:

\`\`\`bash
# Stop ai-agent-browser
pkill -f "ai-agent-browser" || true

# Close the debug Chrome instance
pkill -f "chrome-debug" || true
\`\`\`

## Troubleshooting

### Chrome won't start
- Check if port 9222 is already in use: \`lsof -i :9222\`
- Try a different user-data-dir path
- Verify Chrome is installed at the expected path

### ai-agent-browser can't connect to Chrome
- Wait a few more seconds for Chrome to start
- Verify Chrome is running with debugging: \`curl http://localhost:9222/json\`
- Check the CDP port matches (default: 9222)

### MCP server not responding
- Verify ai-agent-browser is healthy: \`curl http://localhost:8765/health\`
- Check WebSocket connectivity: \`curl http://localhost:8765/\`
- Restart the service if needed

### No errors detected
- Errors are only captured while connected
- Try \`browser_get_console_logs\` to see all console output
- Verify the page has loaded: \`browser_page_info\`

## Example Session

User: "debug in browser"

Claude executes:
1. \`uname -s\` → Darwin (macOS)
2. Starts Chrome with remote debugging
3. Starts ai-agent-browser
4. Adds MCP server to session
5. Spawns error-watching sub-agent
6. Reports: "Browser debugging environment ready! Navigate to your app in Chrome and I'll watch for errors."

User: "go to localhost:3000"
Claude: Uses \`browser_navigate\` to go to http://localhost:3000

[User interacts with the app, an error occurs]

Sub-agent reports: "Error detected: TypeError: Cannot read property 'map' of undefined at App.tsx:42"

Claude: Reads App.tsx, identifies the bug, suggests a fix.
`;
