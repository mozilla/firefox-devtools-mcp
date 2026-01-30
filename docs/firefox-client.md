# Firefox DevTools Client Architecture

This document describes the Selenium WebDriver BiDi client implementation used in this MCP server.

## Purpose and Goals

The Firefox DevTools MCP server uses **Selenium WebDriver** with WebDriver BiDi to provide browser automation capabilities. This design choice provides:

- **Battle-tested reliability** - Uses the industry-standard `selenium-webdriver` library
- **W3C Standard protocol** - WebDriver BiDi is actively developed by browser vendors
- **No custom protocol code** - ~1000 lines of custom code eliminated
- **Future-proof** - Cross-browser potential (Chrome, Edge, Safari)
- **Better DevTools access** - Native BiDi events for console, network, and performance

## Protocol Overview

### WebDriver BiDi

**Transport:** WebSocket (managed by Selenium)
**Format:** JSON-RPC over WebSocket
**Standard:** [W3C WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)

BiDi is the modern browser automation protocol, used for:
- Browser and tab management
- JavaScript evaluation
- Real-time console event capture
- Network monitoring (via BiDi events)
- Page content access
- Screenshots
- Performance metrics collection

**Example BiDi event subscription:**
```typescript
const bidi = await driver.getBidi();
await bidi.subscribe('log.entryAdded', contextId, (event) => {
  console.log(event.params);
});
```

## Client Architecture

### Modular Structure (Task 18)

The client has been refactored into a modular architecture for better separation of concerns:

**FirefoxClient** (`src/firefox/index.ts`)
- Public facade delegating to specialized modules
- Maintains backward compatibility as `FirefoxDevTools`

**Modules:**
- **`core.ts`** - WebDriver + BiDi connection management
- **`dom.ts`** - JavaScript evaluation, element lookup, input actions
- **`pages.ts`** - Tab/window management, navigation, history
- **`events.ts`** - Console buffer (live), network buffer (Task 19)
- **`types.ts`** - Shared TypeScript types

**Key principle:** Keep it simple. Minimum modules, clear interfaces, easy maintenance.

### Core Components

**1. Driver Initialization**
```typescript
const firefoxOptions = new firefox.Options();
firefoxOptions.enableBidi();

this.driver = await new Builder()
  .forBrowser(Browser.FIREFOX)
  .setFirefoxOptions(firefoxOptions)
  .build();
```

**2. Browsing Context Management**
```typescript
// Get window handle (browsing context ID)
this.currentContextId = await this.driver.getWindowHandle();
```

**3. Console Listener Setup**
```typescript
const bidi = await this.driver.getBidi();
await bidi.subscribe('log.entryAdded', this.currentContextId, (event) => {
  const entry = event.params;
  const message = {
    level: entry.level || 'info',
    text: entry.text || JSON.stringify(entry.args || []),
    timestamp: entry.timestamp || Date.now(),
  };
  this.consoleMessages.push(message);
});
```

**Critical order:** Get context → Subscribe to events → Navigate

**4. JavaScript Evaluation**
```typescript
async evaluate(script: string): Promise<unknown> {
  // Direct passthrough - Selenium handles it correctly
  return await this.driver.executeScript(script);
}
```

**Why direct passthrough?** Selenium already handles single-line expressions vs multi-line scripts correctly. Don't add "helpful" logic that breaks things.

### High-Level API

**FirefoxClient** (`src/firefox/index.ts`)
- Unified facade for browser automation
- Delegates to specialized modules
- Maintains backward compatibility via `FirefoxDevTools` alias

**Module Responsibilities:**
- **`core`** - Driver lifecycle, BiDi connection
- **`dom`** - Evaluate, getContent, click/hover/fill, drag&drop, file upload
- **`pages`** - navigate, back/forward, resize, tab CRUD
- **`events`** - Console messages (live), network requests (live, Task 19)

## Auto-Launch and Configuration

### Auto-Launch Process

Selenium automatically manages Firefox through geckodriver:

1. **Geckodriver detection**
   - Installed via `geckodriver` npm package
   - Automatically added to PATH

2. **Firefox startup**
   - Selenium launches Firefox with Marionette protocol
   - BiDi is enabled via `firefoxOptions.enableBidi()`
   - Headless mode supported via `firefoxOptions.addArguments('-headless')`

3. **Connection establishment**
   - Selenium handles all connection logic
   - WebSocket connection to BiDi automatically managed
   - No manual port configuration needed

### Configuration Options

**CLI Arguments:**
```bash
--firefox-path <path>    # Firefox executable path
--headless               # Run Firefox headless
--viewport <WxH>         # Set viewport size (e.g., 1280x720)
--profile-path <path>    # Firefox profile path
--start-url <url>        # Initial URL to navigate to
--pref <name=value>      # Set Firefox preference (repeatable, requires MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1)
```

**Environment Variables:**
```bash
FIREFOX_HEADLESS=false
START_URL=https://example.com
```

**Profile Management:**
- Use `--profile-path` to specify a Firefox profile directory
- Profile is loaded in-place via Firefox's native `--profile` argument (not copied to temp)
- Runtime profile changes supported via `restart_firefox` tool's `profilePath` parameter

### Firefox Preferences

When Firefox runs in WebDriver BiDi mode (automated testing), it applies [RecommendedPreferences](https://searchfox.org/firefox-main/source/remote/shared/RecommendedPreferences.sys.mjs) that change default behavior for test reliability. The `--pref` option and preference tools allow overriding these when needed.

**Use cases:**
- Firefox development and debugging
- Testing scenarios requiring production-like behavior
- Enabling specific features disabled by RecommendedPreferences

**Setting preferences:**

At startup via CLI (requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`):
```bash
npx firefox-devtools-mcp --pref "browser.cache.disk.enable=true" --pref "dom.webnotifications.enabled=true"
```

At runtime via tools:
```javascript
// Set preferences
await set_firefox_prefs({ prefs: { "browser.cache.disk.enable": true } });

// Get preference values
await get_firefox_prefs({ names: ["browser.cache.disk.enable", "dom.webnotifications.enabled"] });

// Via restart_firefox
await restart_firefox({ prefs: { "browser.cache.disk.enable": true } });
```

**Note:** Preference tools require `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` environment variable.

**Preference persistence:** Preferences set via CLI or `restart_firefox` are preserved across restarts. When `restart_firefox` is called without a `prefs` parameter, existing preferences are re-applied automatically.

## Available Tools

The server provides comprehensive browser automation tools:

### Page Management

| Tool | Description | Implementation |
|------|------------|----------------|
| `list_pages` | List all open tabs | `driver.getAllWindowHandles()` |
| `new_page` | Create new tab and navigate | `driver.switchTo().newWindow('tab')` |
| `navigate_page` | Navigate to URL | `driver.get(url)` |
| `select_page` | Switch active tab | `driver.switchTo().window(handle)` |
| `close_page` | Close tab | `driver.close()` |

### Content Access

| Tool | Description | Implementation |
|------|------------|----------------|
| `take_screenshot` | Capture screenshot (PNG) | `driver.takeScreenshot()` |
| `take_snapshot` | Get HTML content | `driver.executeScript('return document.documentElement.outerHTML')` |
| `evaluate_script` | Execute JavaScript | `driver.executeScript(script)` |

### Developer Tools

| Tool | Description | Status |
|------|------------|--------|
| `list_console_messages` | Get console logs | ✅ Real-time BiDi events |
| `list_network_requests` | Get network activity | ✅ Real-time BiDi events (Task 19) |
| `get_network_request` | Get request details | ✅ Via `getNetworkRequests()` |
| `start_network_monitoring` | Enable network capture | ✅ Implemented |
| `stop_network_monitoring` | Disable network capture | ✅ Implemented |
| `performance_get_metrics` | Get timing metrics | ✅ Via `performance` API |

### Firefox Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_firefox_info` | Get current Firefox configuration | (none) |
| `get_firefox_output` | Get Firefox stdout/stderr/MOZ_LOG output | `lines`, `grep`, `since` |
| `restart_firefox` | Restart or configure Firefox | `firefoxPath`, `profilePath`, `env`, `headless`, `startUrl`, `prefs` |
| `set_firefox_prefs` | Set Firefox preferences at runtime | `prefs` (object) |
| `get_firefox_prefs` | Get Firefox preference values | `names` (array) |

**Note:** `set_firefox_prefs` and `get_firefox_prefs` require `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` environment variable.

**Note:** `restart_firefox` works in two modes:
- If Firefox is running: closes and restarts with new configuration
- If Firefox is not running: configures options for next tool call that triggers launch

✅ = Fully implemented

## Migration from RDP

This server was migrated from a custom Remote Debugging Protocol (RDP) implementation to Selenium WebDriver BiDi. See [`docs/migration-to-bidi.md`](./migration-to-bidi.md) for the complete migration story.

**Before:** ~1200 lines of custom RDP client code
**After:** ~200 lines of Selenium wrapper code
**Reduction:** 83% less code to maintain

**Key improvements:**
- ✅ No custom protocol implementation
- ✅ Industry-standard library (selenium-webdriver)
- ✅ W3C standard protocol (WebDriver BiDi)
- ✅ Better console capture (real-time events)
- ✅ Simpler architecture
- ✅ Future cross-browser support

## Current Features and Limitations

### Working Features

**Console Monitoring:**
- ✅ Real-time console event capture via BiDi
- ✅ All log levels (log, info, warn, error, debug)
- ✅ Stack traces included
- ✅ Works across navigations

**JavaScript Execution:**
- ✅ Single-line expressions
- ✅ Multi-line scripts
- ✅ Return values
- ✅ Error handling

**Tab Management:**
- ✅ Multiple tabs support
- ✅ Context switching
- ✅ Window handles management

**Screenshots:**
- ✅ Full page capture
- ✅ PNG format
- ✅ Base64 encoded

### Network Monitoring (Implemented - Task 19)

**Fully functional via BiDi events:**
- ✅ Request/response capture via `network.beforeRequestSent`, `network.responseStarted`, `network.responseCompleted`
- ✅ Full headers (request + response)
- ✅ Timing metrics (duration, request/response timestamps)
- ✅ Resource type detection (script, stylesheet, image, font, media, xhr, document)
- ✅ Enable/disable mechanism (start/stop monitoring)
- ✅ Per-request tracking with unique IDs

**Usage example:**
```typescript
// Start monitoring
await firefox.startNetworkMonitoring();

// Navigate or perform actions
await firefox.navigate('https://example.com');

// Get captured requests
const requests = await firefox.getNetworkRequests();
// Returns: Array<NetworkRecord>
// Each record contains: id, url, method, timestamp, resourceType, isXHR,
//                       status, statusText, requestHeaders, responseHeaders, timings

// Stop monitoring
await firefox.stopNetworkMonitoring();

// Clear buffer
firefox.clearNetworkRequests();
```

**Implementation details:**
- Events are subscribed at `connect()` time
- Data collection is **enabled only when `startNetworkMonitoring()` is called**
- Buffer persists across navigations (unlike console)
- Resource type is inferred from URL extension
- XHR/Fetch detection via BiDi `initiator.type`

### Planned Features (BiDi Supports These)

**Advanced Network:**
- 🚧 Response body access (requires additional BiDi commands)
- 🚧 Request interception

**Performance Monitoring:**
- 🚧 Frame rate monitoring
- 🚧 Memory profiling
- 🚧 CPU metrics

**Advanced Automation:**
- 🚧 Cookie management
- 🚧 Local storage access
- 🚧 Authentication handling
- 🚧 Mobile emulation

## Development and Testing

### Running Tests

```bash
# Build project
npm run build

# Test BiDi implementation
DEBUG=firefox-devtools npm run test:tools

# Test script with comprehensive checks
node scripts/test-bidi-devtools.js
```

### Debug Logging

Set `DEBUG=firefox-devtools` environment variable for verbose logging:

```bash
DEBUG=firefox-devtools node scripts/test-bidi-devtools.js
```

Logs include:
- Firefox launch status
- BiDi connection details
- Console event capture
- Navigation events
- Evaluation results

### Troubleshooting

**Firefox won't launch:**
- Ensure Firefox is installed
- Check `--firefox-path` argument if using custom location
- Verify geckodriver is installed: `npm list geckodriver`

**Console events not captured:**
- Verify BiDi is enabled (it's automatic with Selenium)
- Check listener is subscribed BEFORE navigation
- Ensure correct browsing context ID

**Evaluation returns null:**
- Don't modify scripts - pass them directly to `executeScript()`
- Multi-line scripts should include `return` if you need the value
- Single-line expressions work without `return`

**Build errors:**
- Ensure `selenium-webdriver` is in `external` array in `tsup.config.ts`
- Don't bundle Selenium (it uses dynamic requires)

## Implementation Best Practices

When extending the Firefox client:

### 1. Direct Proxy Pattern

**❌ Don't do this:**
```typescript
async evaluate(script: string): Promise<unknown> {
  // Trying to be "helpful"
  if (!script.startsWith('return ')) {
    script = `return ${script}`; // BREAKS multi-line scripts!
  }
  return await this.driver.executeScript(script);
}
```

**✅ Do this:**
```typescript
async evaluate(script: string): Promise<unknown> {
  // Just pass it through
  return await this.driver.executeScript(script);
}
```

### 2. Event Subscription Order

**Critical:** Subscribe to events BEFORE navigation to capture early messages.

```typescript
// ✅ Correct order
const contextId = await driver.getWindowHandle();
await bidi.subscribe('log.entryAdded', contextId, callback);
await driver.get(url); // Now events will be captured

// ❌ Wrong order
await driver.get(url);
await bidi.subscribe('log.entryAdded', contextId, callback); // Misses early logs
```

### 3. Copy Working Code

If you have a working test script, **make your implementation identical** to it. Don't modify what works.

### 4. Trust the Library

Selenium knows how to:
- Handle script evaluation
- Manage contexts
- Process events
- Handle errors

Don't second-guess it with "smart" logic.

## Build Configuration

### tsup.config.ts

**Critical:** Selenium must be external (not bundled):

```typescript
export default defineConfig({
  external: [
    'selenium-webdriver'  // Don't bundle - uses dynamic requires
  ],
});
```

**Why external?** Selenium uses dynamic `require()` for browser drivers, which doesn't work when bundled.

### Dependencies

```json
{
  "dependencies": {
    "selenium-webdriver": "^4.36.0"
  },
  "devDependencies": {
    "geckodriver": "^6.0.2"
  }
}
```

## Resources

- [Selenium WebDriver Documentation](https://www.selenium.dev/documentation/webdriver/)
- [WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)
- [Firefox Remote Agent](https://firefox-source-docs.mozilla.org/remote/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Migration from RDP to BiDi](./migration-to-bidi.md)

## Contributing

When contributing to the Firefox client:

1. **Keep it simple** - Maintain the thin wrapper pattern
2. **Don't add logic** - Let Selenium handle complexity
3. **Copy working patterns** - Use test scripts as templates
4. **Test incrementally** - Small, focused tests reveal issues quickly
5. **Document lessons** - Update this doc with new learnings

See `tasks/README.md` for development workflow and CR process.
