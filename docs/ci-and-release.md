# CI and Release

This project ships with ready-to-use GitHub Actions for CI, release, and npm publishing.

Workflows
- CI (.github/workflows/ci.yml)
  - Triggers on push (main, develop).
  - On pull requests, only runs when the `run-integration` label is applied. It is the
    only workflow that runs the integration suite, so it is opt-in per PR.
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
  - On GitHub Release published, or via manual dispatch: builds and publishes to npm with provenance.
  - Two jobs: `publish` pushes both npm packages, then `publish-mcp-registry` syncs `server.json`
    to the `package.json` version and publishes to the official MCP Registry.
  - Manual dispatch takes `npm-publish` (default false) and `mcp-publish` (default true), so a
    failed registry publish can be re-run on its own without npm rejecting an already published
    version. `release.yml` passes both explicitly when it triggers the workflow.
  - The registry verifies the package on npm, so `publish-mcp-registry` first polls `npm view`
    for the version it is about to register, up to five minutes, and fails if it never appears.
  - To re-run the registry publish on its own, use the Actions UI, whose checkboxes send real
    booleans: leave `npm-publish` unchecked and **select the release tag as the ref**. The job
    publishes whatever version the checked-out ref declares, so dispatching from the default
    branch would register the wrong one.

Secrets
- Publishing needs no secret. Both npm and the MCP Registry authenticate through OIDC using the
  workflow's `id-token: write` permission: npm via trusted publishing with `--provenance`, the
  registry via `mcp-publisher login github-oidc`.
- `CODECOV_TOKEN` (optional): used by Codecov upload step (CI). The step is skipped if the token or coverage file is missing.

Release flow
1) Bump version in `package.json` (keep 0.x until API is stable):
   - `npm version patch` (or minor), or edit `package.json` by hand
   - Run `npm run sync:manifests` to carry the version into the manifests that duplicate it
   - Update `CHANGELOG.md` and commit the change
2) Create and push the tag (must match package.json):
   - `git tag v0.2.0 && git push origin v0.2.0`
3) The `version-check` job validates the tag vs. package.json.
4) `release` creates a GitHub Release; `publish` publishes to npm and the MCP Registry.

MCP Registry
- `server.json` is the registry manifest. `npm run sync:manifests` keeps its `version` and
  `packages[].version` in step with `package.json`, and the publish job syncs them again in its
  own checkout so a release cannot register a mismatched version.
- The registry proves package ownership through the `mcpName` field in `package.json`, which must
  keep matching the `name` in `server.json` (`io.github.mozilla/firefox-devtools-mcp`).
- The `io.github.mozilla/*` namespace comes from owning the `mozilla` GitHub organization, so no
  DNS verification is involved.
- `mcp-publisher` is pinned to a release and its sigstore bundle is checked with `cosign
  verify-blob` before it runs, since it executes in a job holding `id-token: write`. Bumping the
  pinned `VERSION` in the workflow is a deliberate step.
- `scripts/generate-moz-package.mjs` and `scripts/build-mcpb.mjs` both strip `mcpName` from the
  `package.json` they ship, since neither artifact is the package registered under that name.

Client plugin manifests
- `plugins/*/.claude-plugin/` (Claude), `.cursor-plugin/plugin.json` (Cursor) and
  `gemini-extension.json` (Gemini CLI) let each client install the server from this
  repository. The root `.claude-plugin/marketplace.json` is the marketplace listing, not a
  plugin manifest. Gemini reads its file directly; Cursor additionally requires submission
  to the Cursor marketplace before the plugin is discoverable.
- The Claude manifests carry no `version`. The other two do, and `npm run sync:manifests`
  copies it from `package.json`, along with `manifest.mcpb.json`, `server.json` and the two
  version fields in `package-lock.json`. Since each manifest launches the server with `@latest`,
  the field is metadata only and does not pin what gets installed.

Notes
- If you want Codecov upload to run, switch CI test step to `npm run test:coverage` or generate `coverage/lcov.info`.
- Provenance is enabled for npm publish (Node 20+).
- Use `@latest` in README examples to encourage npx usage.

