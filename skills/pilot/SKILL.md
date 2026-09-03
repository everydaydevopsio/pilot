---
name: pilot
description: Control and debug web pages with the Pilot MCP browser tools. Use when the user asks to open, inspect, test, or troubleshoot a site in Chrome with Pilot.
---

# Pilot browser workflow

Use the `pilot` MCP tools to operate Chrome through the Chrome DevTools Protocol.

## Start and inspect

1. Call `browser_start` before any other Pilot browser tool. Use visible mode unless the user requests headless operation or the environment has no graphical display.
2. Navigate with `browser_navigate`, then confirm the result with `browser_page_info` or `browser_snapshot`.
3. Use refs returned by `browser_snapshot` or `browser_find` for interaction. Take a fresh snapshot after navigation or substantial DOM changes because refs can become stale.
4. For debugging, clear errors before reproducing the problem, then inspect `browser_errors`, `browser_console`, and `browser_network`. Use performance tracing only when the user asks about load or runtime performance.
5. Call `browser_stop` when the browser is no longer needed.

Do not enter credentials, submit consequential forms, upload files, or make other externally visible changes unless the user authorized that action.

## Troubleshooting

### Visible Chrome on Linux

Run `pilot check` when `browser_start` fails. Visible Chrome requires `DISPLAY` or `WAYLAND_DISPLAY` in the Pilot MCP server process. Headless operation does not.

If desktop applications open but Pilot reports that the display is missing, inspect the graphical session with `printenv DISPLAY`. Forward the returned value through the MCP server configuration and restart the agent so Pilot is relaunched. For Codex:

```toml
[mcp_servers.pilot]
command = "npx"
args = ["-y", "@everydaydevopsio/pilot"]
env = { DISPLAY = ":1" }
```

Replace `:1` with the actual value. If the X server requires a cookie, forward `XAUTHORITY` in the same map. For SSH, use trusted X11 forwarding (`ssh -Y`) when policy permits, or use a remote desktop session and its display value. Use `PILOT_HEADLESS=true` on systems without a desktop. In CI, use headless mode or run Pilot under Xvfb.

### Other Linux preflight failures

- If the profile directory is not writable, set `XDG_DATA_HOME` to a writable directory.
- If loopback binding fails with `EPERM`, the host or container must allow binding on `127.0.0.1`; disabling Chrome's renderer sandbox does not fix it.
- If Chrome is not detected, set `PILOT_CHROME_PATH` to its executable.
- Avoid `PILOT_CHROME_NO_SANDBOX=true` unless the runtime genuinely cannot support Chrome's sandbox and the user accepts the security tradeoff.

### Connection and page failures

- Confirm the active page with `browser_page_info` and list tabs if Pilot controls the wrong tab.
- Inspect failed document, script, XHR, and fetch requests with `browser_network`.
- If element refs stop resolving after a page update, take another snapshot and retry with the new refs.
