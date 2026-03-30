# Firefox DevTools MCP

[![npm version](https://badge.fury.io/js/firefox-devtools-mcp.svg)](https://www.npmjs.com/package/firefox-devtools-mcp)
[![CI](https://github.com/mozilla/firefox-devtools-mcp/workflows/CI/badge.svg)](https://github.com/mozilla/firefox-devtools-mcp/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mozilla/firefox-devtools-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/mozilla/firefox-devtools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<a href="https://glama.ai/mcp/servers/@mozilla/firefox-devtools-mcp"><img src="https://glama.ai/mcp/servers/@mozilla/firefox-devtools-mcp/badge" height="223" alt="Glama"></a>

Model Context Protocol server for automating Firefox via WebDriver BiDi (through Selenium WebDriver). Works with Claude Code, Claude Desktop, Cursor, Cline and other MCP clients.

Repository: https://github.com/mozilla/firefox-devtools-mcp

> **Note**: This MCP server requires a local Firefox browser installation and cannot run on cloud hosting services like glama.ai. Use `npx firefox-devtools-mcp@latest` to run locally, or use Docker with the provided Dockerfile.

## Requirements

- Node.js ≥ 20.19.0
- Firefox 100+ installed (auto‑detected, or pass `--firefox-path`)

## Install and use with Claude Code (npx)

Recommended: use npx so you always run the latest published version from npm.

Option A — Claude Code CLI

```bash
claude mcp add firefox-devtools npx firefox-devtools-mcp@latest
```

Pass options either as args or env vars. Examples:

```bash
# Headless + viewport via args
claude mcp add firefox-devtools npx firefox-devtools-mcp@latest -- --headless --viewport 1280x720

# Or via environment variables
claude mcp add firefox-devtools npx firefox-devtools-mcp@latest \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true
```

Option B — Edit Claude Code settings JSON

Add to your Claude Code config file:

- macOS: `~/Library/Application Support/Claude/Code/mcp_settings.json`
- Linux: `~/.config/claude/code/mcp_settings.json`
- Windows: `%APPDATA%\Claude\Code\mcp_settings.json`

```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "npx",
      "args": ["-y", "firefox-devtools-mcp@latest", "--headless", "--viewport", "1280x720"],
      "env": {
        "START_URL": "about:home"
      }
    }
  }
}
```

Option C — Helper script (local dev build)

```bash
npm run setup
# Choose Claude Code; the script saves JSON to the right path
```

## Try it with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx firefox-devtools-mcp@latest --start-url https://example.com --headless
```

Then call tools like:

- `list_pages`, `select_page`, `navigate_page`
- `take_snapshot` then `click_by_uid` / `fill_by_uid`
- `list_network_requests` (always‑on capture), `get_network_request`
- `screenshot_page`, `list_console_messages`

## CLI options

You can pass flags or environment variables (names on the right):

- `--firefox-path` — absolute path to Firefox binary
- `--headless` — run without UI (`FIREFOX_HEADLESS=true`)
- `--viewport 1280x720` — initial window size
- `--profile-path` — use a specific Firefox profile
- `--firefox-arg` — extra Firefox arguments (repeatable)
- `--start-url` — open this URL on start (`START_URL`)
- `--accept-insecure-certs` — ignore TLS errors (`ACCEPT_INSECURE_CERTS=true`)
- `--connect-existing` — attach to an already-running Firefox instead of launching a new one (`CONNECT_EXISTING=true`)
- `--marionette-port` — Marionette port for connect-existing mode, default 2828 (`MARIONETTE_PORT`)
- `--pref name=value` — set Firefox preference at startup via `moz:firefoxOptions` (repeatable)
- `--enable-script` — enable the `evaluate_script` tool, which executes arbitrary JavaScript in the page context (`ENABLE_SCRIPT=true`)
- `--enable-privileged-context` — enable privileged context tools: list/select privileged contexts, evaluate privileged scripts, get/set Firefox prefs, and list extensions. Requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (`ENABLE_PRIVILEGED_CONTEXT=true`)

> **Note on `--pref`:** When Firefox runs in automation, it applies [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs) that modify browser behavior for testing. The `--pref` option allows overriding these defaults when needed.

### Connect to existing Firefox

Use `--connect-existing` to automate your real browsing session — with cookies, logins, and open tabs intact:

```bash
# Start Firefox with Marionette enabled
firefox --marionette

# Run the MCP server
npx firefox-devtools-mcp --connect-existing --marionette-port 2828
```

Or set `marionette.enabled` to `true` in `about:config` (or `user.js`) to enable Marionette on every launch.

BiDi-dependent features (console events, network events) are not available in connect-existing mode; all other features work normally.

> **Warning:** Do not leave Marionette enabled during normal browsing. It sets
> `navigator.webdriver = true` and changes other browser fingerprint signals,
> which can trigger bot detection on sites protected by Cloudflare, Akamai, etc.
> Only enable Marionette when you need MCP automation, then restart Firefox
> normally afterward.

## Tool overview

- Pages: list/new/navigate/select/close
- Snapshot/UID: take/resolve/clear
- Input: click/hover/fill/drag/upload/form fill
- Network: list/get (ID‑first, filters, always‑on capture)
- Console: list/clear
- Screenshot: page/by uid (with optional `saveTo` for CLI environments)
- Script: evaluate_script
- Privileged Context: list/select privileged ("chrome") contexts, evaluate_privileged_script (requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`)
- WebExtension: install_extension, uninstall_extension, list_extensions (list requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`)
- Firefox Management: get_firefox_info, get_firefox_output, restart_firefox, set_firefox_prefs, get_firefox_prefs
- Utilities: accept/dismiss dialog, history back/forward, set viewport

### Screenshot optimization for Claude Code

When using screenshots in Claude Code CLI, the base64 image data can consume significant context.
Use the `saveTo` parameter to save screenshots to disk instead:

```
screenshot_page({ saveTo: "/tmp/page.png" })
screenshot_by_uid({ uid: "abc123", saveTo: "/tmp/element.png" })
```

The file can then be viewed with Claude Code's `Read` tool without impacting context size.

## Local development

```bash
npm install
npm run build

# Run with Inspector against local build
npx @modelcontextprotocol/inspector node dist/index.js --headless --viewport 1280x720

# Or run in dev with hot reload
npm run inspector:dev
```

## Troubleshooting

- Firefox not found: pass `--firefox-path "/Applications/Firefox.app/Contents/MacOS/firefox"` (macOS) or the correct path on your OS.
- First run is slow: Selenium sets up the BiDi session; subsequent runs are faster.
- Stale UIDs after navigation: take a fresh snapshot (`take_snapshot`) before using UID tools.
- Windows 10: Error during discovery for MCP server 'firefox-devtools': MCP error -32000: Connection closed
  - **Solution 1** Call using `cmd` (For more info https://github.com/modelcontextprotocol/servers/issues/1082#issuecomment-2791786310)

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "cmd",
        "args": ["/c", "npx", "-y", "firefox-devtools-mcp@latest"]
      }
    }
    ```

    > **The Key Change:** On Windows, running a Node.js package via `npx` often requires the `cmd /c` prefix to be executed correctly from within another process like VSCode's extension host. Therefore, `"command": "npx"` was replaced with `"command": "cmd"`, and the actual `npx` command was moved into the `"args"` array, preceded by `"/c"`. This fix allows Windows to interpret the command correctly and launch the server.
  
  - **Solution 2** Instead of another layer of shell you can write the absolute path to `npx`:

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "C:\\nvm4w\\nodejs\\npx.ps1",
        "args": ["-y", "firefox-devtools-mcp@latest"]
      }
    }
    ```

    Note: The path above is an example. You must adjust it to match the actual location of `npx` on your machine. Depending on your setup, the file extension might be `.cmd`, `.bat`, or `.exe` rather than `.ps1`. Also, ensure you use double backslashes (`\\`) as path delimiters, as required by the JSON format.

## Versioning

- Pre‑1.0 API: versions start at `0.x`. Use `@latest` with npx for the newest release.

## CI and Release

- GitHub Actions for CI, Release, and npm publish are included. See docs/ci-and-release.md for details and required secrets.

## Issues and Contributing

Issues are tracked on [Bugzilla](https://bugzilla.mozilla.org) under **product: Developer Infrastructure**, **component: AI for Development**.

- [File a new issue](https://bugzilla.mozilla.org/enter_bug.cgi?format=__default__&blocked=2026717&product=Developer%20Infrastructure&component=AI%20for%20Development)
- [Meta bug (tracks all firefox-devtools-mcp issues)](https://bugzilla.mozilla.org/show_bug.cgi?id=2026717)

For questions and discussion, join the [#firefox-devtools-mcp Matrix room](https://chat.mozilla.org/#/room/#firefox-devtools-mcp:mozilla.org).

## Author

Maintained by [Mozilla](https://www.mozilla.org).
