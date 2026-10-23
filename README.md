# Firefox DevTools MCP

[![npm version](https://badge.fury.io/js/@mozilla%2Ffirefox-devtools-mcp.svg)](https://www.npmjs.com/package/@mozilla/firefox-devtools-mcp)
[![CI](https://github.com/mozilla/firefox-devtools-mcp/workflows/CI/badge.svg)](https://github.com/mozilla/firefox-devtools-mcp/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mozilla/firefox-devtools-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/mozilla/firefox-devtools-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE-MIT) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE-APACHE)

<a href="https://glama.ai/mcp/servers/@mozilla/firefox-devtools-mcp"><img src="https://glama.ai/mcp/servers/@mozilla/firefox-devtools-mcp/badge" height="223" alt="Glama"></a>

Model Context Protocol server that lets AI agents use Firefox. It has two main use cases:

- **Agentic browsing**: the agent uses the browser for regular tasks, such as reading pages, filling forms and going through multi-step flows on websites.
- **Agent-assisted web development**: the agent loads the page you are working on and inspects it with developer tools, such as the console, network requests, the debugger and the profiler.

It controls Firefox through WebDriver BiDi (via Selenium WebDriver) and works with Claude Code, Claude Desktop, Cursor, Cline and other MCP clients.

Repository: https://github.com/mozilla/firefox-devtools-mcp

> **Note**: This MCP server requires a local Firefox browser installation and cannot run on cloud hosting services like glama.ai. Use `npx @mozilla/firefox-devtools-mcp@latest` to run locally, or use Docker with the provided Dockerfile.

## Security

Browser MCP servers carry inherent risks. A few key practices:

- **Use a dedicated Firefox profile.** Never run the server against your regular profile — the agent has access to whatever the browser can reach, including cookies and saved sessions.
- **Be cautious about which sites you visit.** Pages can return content designed to manipulate the agent (prompt injection). Stick to sites you control or trust.
- **Enable only the tool modules you need.** The default `basic` preset already includes `evaluate_script`; `--tool-preset slim` drops it. Higher presets such as `--tool-preset developer` (debugging, network, console, profiler) and `--tool-preset mozilla` (privileged context) expand what the agent can do further.

See [SECURITY.md](SECURITY.md) for a full breakdown of risks and how to report vulnerabilities.

## Requirements

- Node.js ≥ 20.19.0
- Firefox 100+ installed (auto‑detected, or pass `--firefox-path`)

## Install and use with Claude Code or Codex (npx)

Recommended: use `npx` so you run the latest published version from npm.

### Option A — CLI

#### Claude Code

```bash
claude mcp add firefox-devtools npx @mozilla/firefox-devtools-mcp@latest

# Headless + viewport via args
claude mcp add firefox-devtools npx @mozilla/firefox-devtools-mcp@latest -- --headless --viewport 1280x720

# Or via environment variables
claude mcp add firefox-devtools npx @mozilla/firefox-devtools-mcp@latest \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true
```

#### Codex

```bash
codex mcp add firefox-devtools -- npx @mozilla/firefox-devtools-mcp@latest

# Headless + viewport via args
codex mcp add firefox-devtools -- \
  npx @mozilla/firefox-devtools-mcp@latest -- --headless --viewport 1280x720

# Or via environment variables
codex mcp add firefox-devtools \
  --env START_URL=https://example.com \
  --env FIREFOX_HEADLESS=true \
  -- npx @mozilla/firefox-devtools-mcp@latest
```

### Option B — Edit the configuration file

#### Claude Code

Add to Claude Code’s mcp_settings.json:

```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "npx",
      "args": ["-y", "@mozilla/firefox-devtools-mcp@latest", "--headless", "--viewport", "1280x720"],
      "env": {
        "START_URL": "about:blank"
      }
    }
  }
}
```

#### Codex

Add to ~/.codex/config.toml:

```toml
[mcp_servers.firefox-devtools]
command = "npx"
args = ["-y", "@mozilla/firefox-devtools-mcp@latest", "--headless", "--viewport", "1280x720"]

[mcp_servers.firefox-devtools.env]
START_URL = "about:blank"
```

### Option C — Helper script (local dev build)

```bash
npm run setup
# Choose Claude Code; the script saves JSON to the right path
```

## Try it with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx @mozilla/firefox-devtools-mcp@latest --start-url https://example.com --headless
```

Then call tools like:

- `list_pages`, `select_page`, `navigate_page`
- `take_snapshot` then `click_by_uid` / `fill_by_uid`
- `list_network_requests` (always‑on capture), `get_network_request`
- `list_downloads` (always‑on capture), `set_download_behavior`
- `screenshot_page`, `list_console_messages`

## CLI options

You can pass flags or environment variables (names on the right):

- `--firefox-path` — absolute path to Firefox binary
- `--headless` — run without UI (`FIREFOX_HEADLESS=true`)
- `--viewport 1280x720` — initial window size
- `--profile-path` — use a specific Firefox profile. Firefox runs in a `firefox_devtools_mcp_profile` subfolder of that path, marked with a `.firefox-devtools-mcp` file; pointing `--profile-path` at a marked profile reuses it directly
- `--firefox-arg` — extra Firefox arguments (repeatable)
- `--start-url` — open this URL on start (`START_URL`)
- `--accept-insecure-certs` — ignore TLS errors (`ACCEPT_INSECURE_CERTS=true`)
- `--connect-existing` — attach to an already-running Firefox instead of launching a new one (`CONNECT_EXISTING=true`)
- `--marionette-port` — Marionette port for connect-existing mode, default 2828 (`MARIONETTE_PORT`)
- `--idle-timeout` — seconds without tool calls after which a connect-existing session releases Firefox, default 1800. Firefox accepts one client at a time, so other clients can only connect once it is released. The next tool call reconnects and selects the tab that is active in Firefox at that moment (`IDLE_TIMEOUT`)
- `--pref name=value` — set Firefox preference at startup via `moz:firefoxOptions` (repeatable)
- `--tool-preset` — select which tool modules to enable: `slim`, `basic` (default), `developer`, `mozilla`, or `all`. See [Tool modules and presets](#tool-modules-and-presets). (`TOOL_PRESET`)
- `--tools` — explicit list of tool modules to enable, overriding `--tool-preset` entirely (e.g. `--tools pages network script`). See [Tool modules and presets](#tool-modules-and-presets).
- `--enable-script` — _deprecated, use `--tool-preset developer` or `--tools ... script debugging`._ Selects the `developer` tool preset. (`ENABLE_SCRIPT=true`)
- `--enable-privileged-context` — _deprecated, use `--tool-preset mozilla` or `--tools ... privileged prefs`._  Selects the `mozilla` tool preset. Requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` (`ENABLE_PRIVILEGED_CONTEXT=true`)
- `--android-device` — enable Firefox for Android mode; value is the ADB device serial (e.g. `emulator-5554`). Run `adb devices` to list connected devices. Omit the value or use `auto` to select the single connected device automatically.
- `--android-wipe-app-data` — confirm that Android mode wipes all data of the target app. Required together with `--android-device`. (`ANDROID_WIPE_APP_DATA=true`)
- `--android-package` — Android app package name, default `org.mozilla.firefox`. Other packages: `org.mozilla.firefox_beta` for Firefox Beta, `org.mozilla.fenix` for Firefox Nightly, `org.mozilla.fenix.debug` for Firefox Nightly Debug, `org.mozilla.geckoview_example` for geckoview (`ANDROID_PACKAGE`)
- `--unrestricted-save-paths` — let the `saveTo` parameter write anywhere on disk instead of the default roots. See [Saving bulky output to disk](#saving-bulky-output-to-disk) and the security note in [SECURITY.md](SECURITY.md). (`UNRESTRICTED_SAVE_PATHS=true`)
- `--log-file` — write MCP server logs to a file instead of stderr. Useful for debugging sessions with MCP clients that hide server output. Set `DEBUG=*` to also include verbose debug logs. Example: `--log-file /tmp/firefox-mcp.log`


### Tool modules and presets

Tools are grouped into modules. You choose which modules to expose either with a named preset
(`--tool-preset`) or with an explicit list (`--tools`). When both are given, `--tools` wins and
the preset is ignored.

Presets (each is a superset of the previous):

- `slim` — the minimum to browse and interact with pages
- `basic` (default) — adds tools for regular browsing
- `developer` — adds tools for web developers
- `mozilla` — adds tools for Firefox developers
- `all` — every module

See [docs/tools.md](docs/tools.md#modules-and-presets) for the list of modules and the modules
in each preset.

Note that `basic`, the default, includes `script` and therefore the `evaluate_script` tool.
See [SECURITY.md](SECURITY.md#tool-modules-and-presets) for what that means for the attack
surface, and use `--tool-preset slim` or an explicit `--tools` list to drop it.

```bash
# Use the developer preset (adds network, console, debugging and profiler tools)
npx @mozilla/firefox-devtools-mcp --tool-preset developer

# Enable only the modules you need
npx @mozilla/firefox-devtools-mcp --tools pages network console
```

The `prefs` and `privileged` modules require `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` and are only
available in the Mozilla-internal build. The `launch` module requires the Mozilla-internal
build too: it restarts Firefox under a caller-chosen binary, profile, environment and set of
preferences, which is a configuration change the operator should own. Use `--pref`,
`--firefox-path` and the other command-line options instead. The `bidi` module also requires
the Mozilla-internal build: it sends any WebDriver BiDi command, so it gives access to what the
other modules expose. The public package skips these modules even if requested and logs a
warning naming the modules it dropped.

### Useful preferences (`--pref`)

- remote.prefs.recommended=false. When Firefox runs in automation, it applies [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs) that modify browser behavior for testing. Set remote.prefs.recommended to false to skip those and have a configuration closer to a regular Firefox instance.
- remote.log.level=Trace. Enable verbose WebDriver protocol logs in Firefox. The MCP server will automatically pass the matching log level to geckodriver so both sides log at the same verbosity.
- app.update.disabledForTesting=false. Allow Firefox to automatically download and apply updates. Note that updates may interrupt your session. Requires also setting remote.prefs.recommended=false.

### Firefox for Android

Use `--android-device` to automate Firefox running on an Android device. Requires `adb` on your PATH and geckodriver, which is managed automatically.

> **Warning:** Android mode wipes all data of the target app before every session.
> Tabs, history, bookmarks, passwords, cookies and settings are all lost. geckodriver runs
> `adb shell pm clear <package>` when creating the session and offers no way to skip it,
> then runs the session on its own temporary profile which is deleted afterwards.
> Because of this, `--android-device` requires `--android-wipe-app-data`, and you should
> install a build dedicated to automation rather than automating the browser you use.
> [Bug 2064088](https://bugzilla.mozilla.org/show_bug.cgi?id=2064088) tracks adding an
> option to geckodriver to keep the existing app data.

```bash
# List connected devices
adb devices

# Launch Firefox for Android on the single connected device
npx @mozilla/firefox-devtools-mcp --android-device auto --android-wipe-app-data

# Target a specific device
npx @mozilla/firefox-devtools-mcp --android-device <serial> --android-wipe-app-data

# Use Firefox Nightly instead
npx @mozilla/firefox-devtools-mcp --android-device <serial> --android-package org.mozilla.fenix --android-wipe-app-data
```

Port forwarding between the host and device is handled automatically by geckodriver.

### Connect to existing Firefox

Use `--connect-existing` to automate your real browsing session, with cookies, logins, and open tabs intact:

```bash
# Start Firefox with Marionette and the Remote Agent (BiDi)
firefox --marionette --remote-debugging-port

# Run the MCP server
npx @mozilla/firefox-devtools-mcp --connect-existing --marionette-port 2828
```

Both flags are required because the MCP uses both WebDriver Classic (`--marionette`) and WebDriver BiDi (`--remote-debugging-port`). If Firefox is only started with `--marionette`, the MCP server fails to connect and asks you to restart Firefox with both flags.

If Firefox is already running with the same profile, the command above only opens a new window in that instance: the flags are ignored, so neither Marionette nor the Remote Agent starts.

To keep your everyday Firefox running without Marionette, give the MCP server its own profile. Firefox runs one process per profile, so both instances run side by side, and the agent only reaches what you sign in to in that profile:

```bash
# Once: create a dedicated profile
firefox -CreateProfile firefox-mcp

# Start it with Marionette and the Remote Agent, next to your everyday Firefox
firefox -P firefox-mcp --marionette --remote-debugging-port
```

> **Warning:** Do not leave Marionette enabled during normal browsing. It sets
> `navigator.webdriver = true` and changes other browser fingerprint signals,
> which can trigger bot detection on sites protected by Cloudflare, Akamai, etc.
> Only enable Marionette when you need MCP automation, then restart Firefox
> normally afterward, or run it in a dedicated profile as shown above.

## Tool overview

See [docs/tools.md](docs/tools.md) for the full list of tools by module, with
descriptions and parameters (generated from the source).

### Saving bulky output to disk

Large tool output can consume significant context in CLI clients like Claude Code. Several
tools accept an optional `saveTo` parameter that writes the result to a file instead of
returning it inline. See [docs/tools.md](docs/tools.md#tools-that-accept-saveto) for the list.
`saveTo` takes one of three forms:

- a file path (relative to the current working directory, or absolute within `~/.firefox-devtools-mcp/output`; parent directories are created). Paths reaching a Firefox profile, or the files this server reads back, are refused
- an existing directory (a timestamped file is generated inside it)
- `true` (a timestamped file is generated under `~/.firefox-devtools-mcp/output/`)

The response returns the path and byte size. The saved file always holds the full,
untruncated data: the inline size safeguards (console message caps, network header
truncation, snapshot line caps) never apply to it.

The text-producing tools also accept `preview`, a number of characters of the saved output to
echo back inline as a short excerpt. The list in docs/tools.md shows which tools support it.

```
screenshot_page({ saveTo: "page.png" })
take_snapshot({ saveTo: true })
list_network_requests({ urlContains: "api", saveTo: "network.json" })
evaluate_script({ function: "() => performance.getEntries()", saveTo: true, preview: 2000 })
```

By default, save paths are restricted: relative paths resolve against the current working
directory, and absolute paths are only allowed within `~/.firefox-devtools-mcp`. Paths that
escape these locations are rejected. Start the server with `--unrestricted-save-paths` to
write to arbitrary locations, including absolute paths outside that directory.

Saved files can then be viewed for instance with Claude Code's `Read` tool without impacting context size.

## Local development

```bash
npm install
npm run build

# Run with Inspector against local build
npx @modelcontextprotocol/inspector node dist/index.js --headless --viewport 1280x720

# Or run in dev with hot reload
npm run inspector:dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details on local development, testing, and CI.

## Troubleshooting

- Firefox not found: pass `--firefox-path "/Applications/Firefox.app/Contents/MacOS/firefox"` (macOS) or the correct path on your OS.
- First run is slow: Selenium sets up the BiDi session; subsequent runs are faster.
- Stale UIDs: a UID stays valid until its element is removed or the page navigates; take a fresh snapshot (`take_snapshot`) when a UID tool reports one is gone.
- Windows 10: Error during discovery for MCP server 'firefox-devtools': MCP error -32000: Connection closed
  - **Solution 1** Wrap with `cmd /c` ([details](https://github.com/modelcontextprotocol/servers/issues/1082#issuecomment-2791786310)):

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "cmd",
        "args": ["/c", "npx", "-y", "@mozilla/firefox-devtools-mcp@latest"]
      }
    }
    ```

  - **Solution 2** Use the absolute path to `npx` (adjust extension — `.cmd`, `.bat`, `.exe`, or `.ps1` — to match your setup):

    ```json
    "mcpServers": {
      "firefox-devtools": {
        "command": "C:\\nvm4w\\nodejs\\npx.ps1",
        "args": ["-y", "@mozilla/firefox-devtools-mcp@latest"]
      }
    }
    ```

## Versioning

- Pre‑1.0 API: versions start at `0.x`. Use `@latest` with npx for the newest release.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to file issues, run tests, and work on the project locally.

## Author

Maintained by [Mozilla](https://www.mozilla.org).

## License

Licensed under either of [MIT](LICENSE-MIT) or [Apache 2.0](LICENSE-APACHE) at your option.
