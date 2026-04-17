# Firefox Client Architecture

The MCP server uses **Selenium WebDriver** with WebDriver BiDi to drive Firefox.

## Protocol

**WebDriver BiDi** — WebSocket, JSON-RPC, [W3C spec](https://w3c.github.io/webdriver-bidi/).

Used for tab management, JavaScript evaluation, console events, network monitoring, screenshots, and page content access. Selenium manages the WebSocket connection; no custom protocol code is needed.

## Module Structure

**`src/firefox/index.ts`** (`FirefoxClient`) — public facade, delegates to modules below.

| Module | Responsibilities |
|--------|-----------------|
| `core.ts` | WebDriver + BiDi connection lifecycle |
| `dom.ts` | JS evaluation, element lookup, input actions (click/hover/fill/drag/upload) |
| `pages.ts` | Tab/window management, navigation, history, viewport |
| `events.ts` | Console buffer (BiDi live events), network buffer (BiDi live events) |
| `types.ts` | Shared TypeScript types |

## Initialization Order

Events must be subscribed before navigation to capture early messages:

```typescript
this.driver = await new Builder().forBrowser(Browser.FIREFOX).setFirefoxOptions(opts).build();
this.currentContextId = await this.driver.getWindowHandle();
await bidi.subscribe('log.entryAdded', this.currentContextId, callback); // before get()
await this.driver.get(startUrl);
```

## Configuration

CLI flags and their environment variable equivalents are documented in the README. Profile path is passed via Firefox's native `--profile` argument (loaded in-place, not copied).

### Firefox Preferences

In WebDriver BiDi mode, Firefox applies [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs) that alter browser behavior for test reliability. Use `--pref` or the runtime preference tools to override them when needed.

**Example:** `browser.ml.enable` is disabled by RecommendedPreferences, which prevents testing ML/AI features like Smart Window. Override it:

```bash
npx firefox-devtools-mcp --pref "browser.ml.enable=true"
```

Runtime (requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`):

```javascript
await set_firefox_prefs({ prefs: { "browser.ml.enable": true } });
```

Preferences set via CLI or `restart_firefox` are re-applied automatically on subsequent restarts.

## Build Configuration

Selenium must not be bundled — it uses dynamic `require()` for browser drivers:

```typescript
// tsup.config.ts
export default defineConfig({
  external: ['selenium-webdriver'],
});
```
