# CI and Release

This project ships with ready-to-use GitHub Actions for CI, release, and npm publishing.

Workflows
- CI (.github/workflows/ci.yml)
  - Triggers on push (main, develop) and PRs.
  - Matrix: Node 20 and 22.
  - Steps: install → lint → format check → typecheck → test → build.
  - Optional: uploads coverage to Codecov if `coverage/lcov.info` exists and `CODECOV_TOKEN` is set.
  - Uploads the `dist/` artifact (Node 20 job) for quick download.

- PR Check (.github/workflows/pr-check.yml)
  - Fast checks on PR open/update: lint, format check, typecheck.

- Version Check (.github/workflows/version-check.yml)
  - On tag push `v*`: compares the tag version with `package.json`.
  - Fails if they differ (bump package.json before tagging).

- Release (.github/workflows/release.yml)
  - On tag push `v*`: runs tests, builds `dist/`, creates a GitHub Release with a tarball of `dist` + metadata.

- Publish (.github/workflows/publish.yml)
  - On GitHub Release published or on tag push `v*.*.*` (and via manual dispatch): builds and publishes to npm with provenance.
  - Requires `NPM_TOKEN` repository secret.

Secrets
- `NPM_TOKEN`: npm access token with publish rights to the package name (`firefox-devtools-mcp`).
- `CODECOV_TOKEN` (optional): used by Codecov upload step (CI). The step is skipped if the token or coverage file is missing.

Release flow
1) Bump version in `package.json` (keep 0.x until API is stable):
   - `npm version patch` (or minor)
   - Commit the change
2) Create and push the tag (must match package.json):
   - `git tag v0.2.0 && git push origin v0.2.0`
3) The `version-check` job validates the tag vs. package.json.
4) `release` creates a GitHub Release; `publish` publishes to npm.

Windows Integration Tests
- On Windows, vitest has known issues with process forking when running integration tests that spawn Firefox.
- See: https://github.com/mozilla/firefox-devtools-mcp/issues/33
- To work around this, we use a separate test runner (`scripts/run-integration-tests-windows.mjs`) that runs integration tests directly via Node.js without vitest's process isolation.
- The CI workflow detects Windows and automatically uses this runner instead of vitest for integration tests.
- Unit tests still run via vitest on all platforms.

Notes
- If you want Codecov upload to run, switch CI test step to `npm run test:coverage` or generate `coverage/lcov.info`.
- Provenance is enabled for npm publish (Node 20+).
- Use `@latest` in README examples to encourage npx usage.

