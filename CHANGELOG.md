# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.10.4] - 2026-09-22

No changes to the server itself. This release publishes it through additional channels.

### Added
- The server is now published to the official MCP Registry as `io.github.mozilla/firefox-devtools-mcp`, so MCP clients and directories that read the registry can discover and install it
- `gemini-extension.json`, so Gemini CLI can install the server straight from the repository with `gemini extensions install`
- `.cursor-plugin/plugin.json`, describing the server to Cursor. It takes effect once the plugin is accepted into the Cursor marketplace

## [0.10.3] - 2026-09-18

### Added
- `close_firefox_session` tool that ends the browser session: it releases the connection when the server is attached to an existing Firefox, and closes the browser when the server started it
- `fullPage` option on `screenshot_page` to capture the whole scrollable document instead of the viewport
- `downloadFolder` option on `set_download_behavior`, used when `behavior` is `allowed` and defaulting to `~/.firefox-devtools-mcp/output/downloads`, instead of relying on the Firefox default download directory

### Fixed
- No longer fails to find the Firefox binary on Linux with Flatpak
- `restart_firefox` now rejects when used for a server started with `--connectExisting`

### Changed
- Servers connecting to an existing browser will disconnect from Firefox after being idle for 30 minutes without a tool call.
- The `restart_firefox` tool is now part of the mozilla-internal package, and should only be used in controlled environments as it allows the agent to restart the browser with a custom configuration
- Path checks for the `saveTo` parameters have been improved to avoid overlapping with existing profile folders

## [0.10.2] - 2026-09-04

### Added
- `type_text` tool that types text key by key into the focused element, with an optional key to press afterwards
- `press_key` tool that sends a single key, optionally with modifiers, to a snapshot element or to the focused element
- `set_network_cache` tool to bypass or restore the HTTP cache, for the selected tab or browser-wide
- `wait` option on `navigate_page` and `new_page` to pick the readiness state to wait for (`none`, `interactive`, `complete`); omitting it keeps the previous scheme-derived default
- `get_firefox_info` now reports the resolved Firefox binary path

### Fixed
- Windows per-user Firefox installs are now detected (`%LOCALAPPDATA%`, `PATH`, then the App Paths registry key), instead of failing with "unable to find binary in default location"
- geckodriver is now resolved on all platforms, so aarch64 Linux no longer fails with "Unable to obtain browser driver" when a native geckodriver is in `PATH`
- `--output-file` and `--log-file` now create their parent directory instead of throwing `ENOENT` or silently disabling logging
- `saveTo` paths are compared case-insensitively on Windows, so a path that differs only by drive-letter case is no longer rejected as outside the allowed location

### Changed
- Tool handlers now go through a shared error handling path, making failure messages consistent across tools

### Docs
- `docs/tools.md`, generated from the tool definitions, documents every tool and its parameters
- Fixed the npm package link in the README

## [0.10.1] - 2026-08-21

### Added
- `web-performance` plugin skill to capture a Firefox performance profile, analyze it with `profiler-cli`, trace findings to the user's source, and verify fixes by re-profiling
- The server now advertises instructions in the initialize response, describing its capabilities and the enabled tool modules

## [0.10.0] - 2026-08-18

### Added
- `get_page_text` tool returning the text content of a page
- `get_network_request` now returns the response body, and the request body when present; large text bodies are truncated inline, binary bodies are summarized, and `saveTo` still writes the full body
- `sandbox` option on `evaluate_script` to evaluate in an isolated sandbox realm which shares the page DOM but keeps the native built-ins
- `--disable-network-body-collection` option to skip capturing request and response bodies, reducing browser memory and stream-cloning overhead
- `--lookup-marionette-port` option to discover the Marionette port opened by Firefox's AI assistant companion instead of relying on `--marionette-port`

### Changed
- Connecting to Firefox for Android now requires `--android-wipe-app-data`, confirming that the data of the target app is wiped (tabs, history, bookmarks, passwords, settings)
- `evaluate_privileged_script` now targets an explicit privileged context instead of an implicit one
- Element lookups from snapshots now resolve through a uid registry instead of generated selectors, making them more reliable

### Fixed
- `list_pages` now includes the URL of each page
- The server no longer advertises the `resources` capability it does not implement; resource requests now fail with "Method not found" instead of an internal error
- Snapshot attributes are no longer truncated when saving a snapshot to a file
- Clearer truncation messages and tool descriptions

### Docs
- README and SECURITY now describe the tool presets, modules and risky flags that the tool registry actually implements
- Updated installation instructions for CLIs
- `evaluate_script` description steers toward targeted reads

## [0.9.15] - 2026-07-28

### Added
- Screencast recording tools: `screencast_start`, `screencast_stop`
- Download tools exposing download events: `list_downloads`, `clear_downloads`, `set_download_behavior`
- `saveTo` and `preview` parameters for bulky-output tools (`evaluate_script`, `evaluate_privileged_script`, `list_console_messages`, `list_network_requests`, `get_network_request`, `take_snapshot`, and the screenshot tools); saved files always hold the full untruncated data while truncation limits keep applying to inline responses
- MCP configuration can now enable tools by module
- Readonly hints on tools that do not modify browser state
- `--unrestricted-save-paths` CLI option to bypass the absolute save path restriction

### Fixed
- Fall back to an existing or new tab when the current tab was closed
- `connect-existing` now fails early with a clear error when the session has no BiDi endpoint (started without `--remote-debugging-port`)
- `MOZ_DISABLE_UPDATE_PROCESSING=1` is now forced when starting Firefox
- Save paths are restricted to the current working directory or `~/.firefox-devtools-mcp`
- Tool presets and legacy enable flags now match the developer/mozilla presets and actual usage

### Docs
- Document that `connect-existing` requires both `--marionette` and `--remote-debugging-port`

## [0.9.12] - 2026-07-10

### Fixed
- Release script using unauthorized action
- Release archive referencing a nonexistent LICENSE file instead of LICENSE-APACHE and LICENSE-MIT

## [0.9.10] - 2026-07-10

### Added
- `--auto-profile` option to automatically pick and reuse a profile folder based on the Firefox binary path, reducing the risk of mixing profiles across Nightly/Beta/Release
- `mcpb` build target for packaging the MCP server as a `.mcpb` bundle
- Secondary plugin to help troubleshoot installation issues

### Fixed
- Server version and name are now correctly set at build time

### Docs
- Added Cowork plugin installation steps, including the node/npm dependency note and a screenshot

## [0.9.9] - 2026-07-02

### Updated
- Removed strict plugin versioning, plugin should always update to the latest sha
- Removed setup skill, failing for cowork, highlighted using restart instead
- Enabled scripting and disabled automation preferences by default

## [0.9.8] - 2026-07-02

### Updated
- Restructured and cleaned up plugin skills
- Added a marketplace.json, plugin can be installed via the repository's URL

## [0.9.7] - 2026-06-26

### Fixed
- Publish script fixup

## [0.9.6] - 2026-06-26

### Added
- Profiler tools for Firefox 154+: `profiler_start`, `profiler_stop`, `profiler_is_active`
- Logpoint tools for non-breaking debugging: `enable_debugger`, `set_logpoint`, `remove_logpoint`, `get_logpoint_results`
- `get_firefox_info` now returns the Firefox version number
- `--log-file` CLI option to write MCP server logs to a file

### Fixed
- Zombie geckodriver processes are now killed when Firefox is closed while the MCP server is running
- `remote.log.level` can now be set via `--pref`
- `app.update.disabledForTesting` is now forced to `true` when recommended preferences are disabled

## [0.9.5] - 2026-06-11

### Changed
- Updated default start url to about:blank instead of about:home

## [0.9.4] - 2026-06-04

### Added
- Support for connecting to Firefox for Android via `--android` flag

### Fixed
- Navigation to `moz-extension://` URLs no longer hangs; now uses BiDi navigate
- Geckodriver binary detection on Windows

## [0.9.3] - 2026-05-07

### Added
- New `@mozilla/firefox-devtools-mcp-moz` npm package with privileged context support enabled by default
- `--profile-path` now uses a dedicated subfolder to avoid corrupting existing profiles, and warns when reusing a profile that already exists

### Fixed
- Profile reuse warnings are now surfaced as MCP errors so AI assistants can see them
- Network debug command now uses `statusMin=400` instead of `status="failed"` to correctly match 4xx/5xx responses
- Docker image now creates the user home directory

### Changed
- Package renamed from `firefox-devtools-mcp` to `@mozilla/firefox-devtools-mcp`
- License changed to dual MIT OR Apache-2.0
- Reduced emoji usage in MCP log messages

## [0.9.2] - 2026-04-16

### Added
- `evaluate_privileged_script` now detects `const`/`let`/`var` statements and rejects them with a helpful error message suggesting IIFE workaround
- BiDi console and network events now degrade gracefully when Firefox Remote Agent is not running, instead of crashing
- Comprehensive e2e scenario integration tests covering the full `FirefoxClient` API
- Unit tests for privileged context state consistency and statement detection
- Testing documentation (`docs/testing.md`)

### Fixed
- Privileged context state not preserved across tool calls: `set_firefox_prefs` and `list_extensions` no longer silently revert a privileged context selection
- Session cleanup on connection failure: `getFirefox()` now closes the failed instance to prevent zombie geckodriver processes and Marionette session locks

### Changed
- **Breaking:** Removed `--marionette-host` CLI parameter (connect-existing mode now uses localhost only)
- Rewrote connect-existing mode to use Selenium's native `--connect-existing` feature via `ServiceBuilder`, replacing the custom `GeckodriverHttpDriver` HTTP client (~530 lines removed)
- Replaced custom `IDriver`/`IElement`/`IBiDi` interfaces with native `WebDriver`/`WebElement` from selenium-webdriver
- Improved error messages for BiDi-dependent features (console/network) to suggest `--remote-debugging-port`
- Pinned all dependency versions for build reproducibility
- Updated dependencies: `@modelcontextprotocol/sdk` 1.29.0, `tsup` 8.5.0, `tsx` 4.21.0, `typescript-eslint` 8.58.0

## [0.9.1] - 2026-03-29

### Fixed
- `SERVER_VERSION` now reads from `package.json` dynamically instead of hardcoded value
- Connect-existing mode: session cleanup, BiDi support, `--marionette-host` parameter
- Resolved 11 security vulnerabilities in dependencies

### Changed
- Removed fragile `process.on` handlers in test setup that masked real errors
- Added unit tests for connect-existing mode (BiDi, session cleanup, reconnect)

## [0.9.0] - 2026-03-28

### Added
- Merged features from Mozilla's fork (PR #46):
  - Content script evaluation (`--enable-script` flag)
  - Privileged context support (`--enable-privileged-context` flag)
  - WebExtension tools: install, uninstall, and list extensions
  - Firefox restart tool with runtime reconfiguration
  - Preferences configuration via CLI (`--pref`) and runtime tools
  - Environment variables and output capture (`--env`, `--output-file`)
  - WebDriver BiDi command support
  - MOZ_LOG integration
- Repository adopted by Mozilla

### Changed
- Script evaluation and privileged context are now opt-in via CLI flags
- Author updated to Mozilla
- Removed non-English documentation files

## [0.8.1] - 2026-03-17

### Fixed
- Increase snapshot test timeout

## [0.8.0] - 2026-03-17

### Added
- Support --connect-existing to attach to running Firefox

## [0.7.1] - 2026-02-13

### Fixed
- Simplified `saveTo` parameter description in screenshot tools to remove opinionated usage instructions that were influencing AI assistant behavior

## [0.7.0] - 2026-02-13

### Added
- **`saveTo` parameter for screenshot tools**: New optional parameter on `screenshot_page` and `screenshot_by_uid` that saves the screenshot to a local file instead of returning base64 image data in the MCP response
  - Solves context window bloat in CLI-based MCP clients (e.g. Claude Code) where large base64 screenshots fill up the context quickly
  - When `saveTo` is provided, returns a lightweight text response with the file path and size
  - Automatically creates parent directories if they don't exist
  - Follows the same pattern as Chrome DevTools MCP's `filePath` parameter

### Changed
- **Screenshot response format**: Without `saveTo`, screenshots are now returned as native MCP `image` content (`{ type: "image" }`) instead of raw base64 text. GUI clients (Claude Desktop, Cursor) render these natively.
- Removed `buildScreenshotResponse` with its token-limit truncation — no longer needed since screenshots are either saved to file or returned as proper image content
- Extended `McpToolResponse` type to support both `text` and `image` content items

## [0.6.1] - 2026-02-04

### Added
- **Enhanced Vue/Livewire/Alpine.js support**: New snapshot options for modern JavaScript frameworks
  - `includeAll` parameter: Include all visible elements without relevance filtering
  - `selector` parameter: Scope snapshot to specific DOM subtree using CSS selector
  - Fixes [#36](https://github.com/mozilla/firefox-devtools-mcp/issues/36) - DOM filtering problem with Vue and Livewire applications
- **Test fixtures**: Added new HTML fixtures for testing visibility edge cases (`visibility.html`, `selector.html`)

### Changed
- **Improved element relevance detection**:
  - Fixed text content checking to use direct text only (excluding descendants)
  - Added check for interactive descendants to include wrapper elements
  - Implemented "bubble-up" pattern in tree walker to preserve nested interactive elements
  - Elements with `v-*`, `wire:*`, `x-*` attributes and custom components are now properly captured with `includeAll=true`

### Fixed
- **Visibility checking now considers ancestor elements**: Elements inside hidden parents (e.g., `display:none`, `visibility:hidden`) are now correctly excluded from snapshots, even in `includeAll` mode
- **Opacity parsing improved**: Fixed opacity check to properly handle various numeric formats (`0`, `0.0`, `0.00`) by parsing as float instead of string comparison
- **CSS selector error handling**: Invalid CSS selectors now return clear error messages (`"Invalid selector syntax"`) instead of generic `"Unknown error"`
- Interactive elements deeply nested in non-relevant wrapper divs are now correctly captured
- Container elements with large descendant text content no longer incorrectly filtered out
- Custom HTML elements (Vue/Livewire components) are now visible in snapshots with `includeAll=true`

## [0.6.0] - 2025-12-01

Released on npm, see GitHub releases for details.

## [0.5.3] - 2025-01-30

### Added
- Windows-specific integration test runner (`scripts/run-integration-tests-windows.mjs`)
  - Runs integration tests directly via Node.js to avoid vitest fork issues on Windows
  - See [#33](https://github.com/mozilla/firefox-devtools-mcp/issues/33) for details
- Documentation for Windows integration tests in `docs/ci-and-release.md`
- Branch protection enabled on `main` branch

### Changed
- `.claude/` directory added to `.gitignore`

## [0.5.2] - 2025-01-22

### Added
- New test helper functions for improved integration test stability:
  - `waitForElementInSnapshot()` - actively waits for elements to appear in DOM snapshots
  - `waitForPageLoad()` - ensures page is fully loaded before proceeding
- 14 new comprehensive unit tests for `parseHeaders()` function covering edge cases:
  - Numeric values (direct & BiDi format)
  - Arrays with null/undefined items
  - Nested objects with deep value extraction
  - Circular reference handling
  - Mixed arrays with primitives and objects
  - Boolean values and bytes format
- Global test cleanup system to prevent zombie Firefox processes
- Signal handlers (SIGINT, SIGTERM) for graceful Firefox cleanup on test interruption
- New npm script `test:unit` for running unit tests without Firefox dependencies

### Fixed
- **Critical**: Zombie Firefox processes no longer left running after test failures
  - Added automatic cleanup in `tests/setup.ts` after all tests complete
  - Added process signal handlers to ensure cleanup on Ctrl+C and crashes
  - Prevents port conflicts and resource leaks
- Integration test flakiness caused by race conditions:
  - Form interaction test (hover functionality)
  - Tab snapshot isolation test
  - Network monitoring tests
  - Console capture tests
  - All snapshot tests (7 total)
- Test parallelization conflicts by enforcing sequential execution

### Changed
- Integration tests now run sequentially instead of in parallel to avoid Firefox port conflicts
- Vitest configuration updated with `fileParallelism: false` and `singleFork: true`
- All integration tests refactored to use new helper functions for stability
- Test success rate improved from 95% (with intermittent failures) to 100% consistent success

### CI/CD
- Added Firefox installation step to GitHub Actions CI workflow
- Added unit tests to PR check workflow for faster feedback
- Updated PR checks to include build verification
- Integration tests now run reliably in CI environment

### Test Coverage
- Total tests: 275 (250 unit + 25 integration)
- All tests now pass consistently (100% success rate across multiple runs)
- Enhanced coverage for BiDi header parsing edge cases

## [0.5.1] - 2025-01-21

### Fixed
- Network headers now display actual values instead of `[object Object]`
  - BiDi protocol returns headers as `{ type: "string", value: "..." }` objects

## [0.5.0] - 2025-01-21

### Fixed
- `acceptInsecureCerts` CLI parameter now properly propagates to Firefox

### Changed
- Centralized UID error handling across input/screenshot/snapshot tools

### Removed
- Dead code: `estimateTokens`, `safeguardResponse`, `DEFAULT_HEADLESS`
- Unused types: `FirefoxConfig`, `PageInfo`
- Unused utilities: `isExecutable`, `fileExists`

## [0.4.0] - 2025-11-26

### Added
- Token limit safeguards to prevent context overflow in AI assistant responses
- Firefox connection health check with user-friendly error messages for AI assistants
- Navigate to localhost development server support

### Fixed
- CI workflow: build step now runs before tests to ensure snapshot bundle is available
- Firefox DevTools connection error handling with improved diagnostics
- Snapshot bundle path resolution for npx execution

### Changed
- Improved error messages to be more helpful for AI assistants

## [0.3.0] - 2025-11-25

### Added
- Integration tests for console, form, network, and snapshot workflows
- Comprehensive test coverage for core functionality

### Fixed
- Main module detection for npx compatibility
- MCP connection timeout issues

## [0.2.5] - 2025-11-24

### Fixed
- Moved geckodriver to dependencies to fix connection timeout when running via npx

## [0.2.3] - 2025-11-24

### Fixed
- Normalize module path check for cross-platform compatibility
- Added missing selenium-webdriver dependency

## [0.2.0] - 2025-11-23

### Added
- Initial public release
- Firefox DevTools automation via WebDriver BiDi
- MCP server implementation with tools for:
  - Page navigation and snapshot
  - Console message capture
  - Network request monitoring
  - Screenshot capture
  - Form interaction (click, fill, hover)
  - Tab management
  - Script execution
- UID-based element referencing system
- Headless mode support

[0.9.3]: https://github.com/mozilla/firefox-devtools-mcp/compare/0.9.2...0.9.3
[0.9.2]: https://github.com/mozilla/firefox-devtools-mcp/compare/0.9.1...0.9.2
[0.9.1]: https://github.com/mozilla/firefox-devtools-mcp/compare/0.9.0...0.9.1
[0.9.0]: https://github.com/mozilla/firefox-devtools-mcp/compare/0.8.1...0.9.0
[0.7.1]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.6.0...v0.6.1
[0.5.3]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.2.3...v0.2.5
[0.2.3]: https://github.com/mozilla/firefox-devtools-mcp/compare/v0.2.0...v0.2.3
[0.2.0]: https://github.com/mozilla/firefox-devtools-mcp/releases/tag/v0.2.0
