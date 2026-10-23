# Project rules

- Never use emojis anywhere: code, comments, log messages, strings, documentation.
- Never add `Co-Authored-By` or any AI attribution to commit messages.
- Limit comments to a strict minimum. Almost never add comments, except on non-trivial code, non-self-explanatory function arguments, and class definitions.
- Do not remove existing comments unless they are directly related to what you are changing.

# Testing rules

Follow the strategy in [docs/testing.md](docs/testing.md). In short:

- Test each behavior once, at the layer that owns it. Handler logic (branching, formatting, truncation, `saveTo`, error rewriting, state, version checks) goes through the MCP harness (`tests/helpers/mcp.ts`). `src/firefox/` behavior goes through `createTestFirefox`. Never test the same behavior at both layers.
- Never mock `sendBiDiCommand`, the driver, or `getFirefox()`. Mock only what a real Firefox cannot produce on demand (timeouts, old versions, OS paths, process failures).
- Never assert on tool names, descriptions, or schemas.
- Do not add cases to existing mock-based tests. Delete them when a real-Firefox test covers the same behavior.
- A bug fix needs a test that fails without the fix, unless a real Firefox cannot reproduce the bug. Then say why in the commit message.
- A new tool or tool option needs a test at the layer that owns its logic: the harness if the handler adds logic, `createTestFirefox` if it only forwards. Thin tools get no harness test.
- In reviews, do not ask for mock-based unit tests.
