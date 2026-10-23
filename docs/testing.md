# Testing

## Strategy

Tests run against a real Firefox whenever possible. Mock-based tests mostly
restate the implementation, break on refactors, and rarely catch real bugs.

All tests live in `tests/` and run with vitest. `scripts/` is for build,
release and demo tooling only.

### Kinds of test

Pick the kind of test from where the logic under test lives.

1. **MCP harness** (`tests/integration/mcp/`, `startMcpServer` from
   `tests/helpers/mcp.ts`). Starts the server in a child process and calls tools
   through an MCP client. For logic in tool handlers and in the server
   lifecycle (start, reconnect, restart, close). One file per tool module, plus
   `lifecycle.test.ts` for the server lifecycle.
2. **`FirefoxClient` integration** (`tests/integration/firefox/`,
   `createTestFirefox` from `tests/helpers/firefox.ts`). For behavior in
   `src/firefox/`. One file per feature.
3. **Pure logic tests** (`tests/unit/`). For functions without Firefox and
   without I/O: formatters, parsers, key combos, CLI parsing. They use no mocks.
   The folder mirrors `src/`: the test for `src/utils/paths.ts` is
   `tests/unit/utils/paths.test.ts`. Tests with allowed mocks (see below) and the
   remaining mock-based tests also live here.

Shared test code lives in `tests/helpers/`, and test pages in `tests/fixtures/`.

Test each behavior once, at the layer that owns it:

- A handler has its own logic when it branches, filters, formats, truncates,
  saves output (`saveTo`), rewrites errors, keeps state between calls, checks
  the Firefox version, or validates arguments beyond simple type checks. Test
  that logic with the harness, and only that logic.
- A handler that only forwards to `FirefoxClient` gets no harness test. Test the
  `FirefoxClient` method with `createTestFirefox`.
- Never test the same behavior at both layers. A harness test may set up page
  state through other tools, but does not check that state again.

This leaves wiring errors in thin tools untested, for example a schema property
that does not match the argument the handler reads. This is accepted: such errors
are rare and visible in review, and `tests/unit/tools/registry.test.ts` checks
that every tool is registered.

Code covered only by harness tests does not show in `npm run test:coverage`,
because the server runs in another process. This is accepted: coverage is a rough
signal, not a goal.

### Mocks

Mock only conditions that a real Firefox cannot produce on demand: timeouts, an
old Firefox version, OS-specific paths, WebSocket states, process failures.

Do not:

- mock `sendBiDiCommand`, the WebDriver driver, or `getFirefox()` to check which
  command is sent,
- assert on tool definitions (name, description, schema). The registry tests and
  the tools doc generation already cover them.

Existing mock-based tests are not extended. When a harness or integration test
covers the same behavior, delete the mock-based test in the same commit.

### Required tests

- A bug fix comes with a test that fails without the fix. If the bug cannot be
  reproduced with a real Firefox, explain why in the commit message or the pull
  request.
- A new tool, or a new tool option, comes with a test at the layer that owns its
  logic: the harness if the handler adds logic, `createTestFirefox` if it only
  forwards.

### Firefox versions

CI runs the latest Firefox release. A test for a feature that needs a newer
Firefox than the one installed locally is skipped, with the required version in
the skip reason.

## Running tests

```bash
# Run all tests once (unit + integration)
npm run test:run

# Run only unit tests (fast, no Firefox needed)
npm run test:unit

# Run only integration tests (launches real Firefox in headless mode)
npm run test:integration

# Run the e2e scenario suite
npx vitest run tests/integration/firefox/e2e-scenario.test.ts

# Watch mode (re-runs on file changes)
npm test
```

## E2E scenario tests

The file `tests/integration/firefox/e2e-scenario.test.ts` contains end-to-end
tests that exercise the full `FirefoxClient` API against a realistic multi-page
web application (`tests/fixtures/e2e-app.html`).

The fixture app has three pages (Todo List, Search, Registration Form) plus
always-visible hover/double-click targets. Each `describe` block launches its own
headless Firefox instance and tears it down after the tests.

All tests are self-contained (no ordering dependencies) and use active polling
(`waitFor`) instead of fixed sleeps for async BiDi events.

### Design principles

- **Self-contained**: each test navigates to its own page, no inter-test dependencies
- **Active polling**: async events (console, network) use `waitFor` instead of fixed sleeps
- **Relative assertions**: viewport tests assert relative change, not exact pixel values (platform-dependent)
- **Isolated Firefox instances**: each `describe` block gets its own headless Firefox

## Known issues

- **Firefox 148 startup crash on macOS ARM64** ([Bug 2027228](https://bugzilla.mozilla.org/show_bug.cgi?id=2027228)): Intermittent SIGSEGV in `RegisterFonts` thread (`RWLockImpl::writeLock()` null pointer) when launching Firefox in headless mode via Selenium. The crash is a race condition in Firefox font initialization and does not affect test results — Selenium recovers automatically. More likely to occur under fast sequential startup/shutdown cycles.
