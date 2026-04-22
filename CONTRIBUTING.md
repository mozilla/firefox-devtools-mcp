# Contributing to Firefox DevTools MCP

## Issues

Issues are tracked on [Bugzilla](https://bugzilla.mozilla.org) under **product: Developer Infrastructure**, **component: Firefox MCP**.

- [File a new issue](https://bugzilla.mozilla.org/enter_bug.cgi?format=__default__&blocked=2026717&product=Developer%20Infrastructure&component=Firefox%20MCP)
- [Meta bug (tracks all firefox-devtools-mcp issues)](https://bugzilla.mozilla.org/show_bug.cgi?id=2026717)

For questions and discussion, join the [#firefox-devtools-mcp Matrix room](https://chat.mozilla.org/#/room/#firefox-devtools-mcp:mozilla.org).

## Local development

```bash
npm install
npm run build

# Run with Inspector against local build
npx @modelcontextprotocol/inspector node dist/index.js --headless --viewport 1280x720

# Or run in dev with hot reload
npm run inspector:dev
```

## Testing

```bash
npm run test:run          # all tests once (unit + integration)
npm test                  # watch mode
```

See [docs/testing.md](docs/testing.md) for full details on running specific test suites, the e2e scenario coverage, and known issues.

## CI and Release

GitHub Actions for CI, Release, and npm publish are included. See [docs/ci-and-release.md](docs/ci-and-release.md) for details and required secrets.

## Code of Conduct

This project follows the [Mozilla Community Participation Guidelines](CODE_OF_CONDUCT.md).
