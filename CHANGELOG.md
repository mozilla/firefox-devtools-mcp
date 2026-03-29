# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
