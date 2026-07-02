# Firefox DevTools Plugin for Claude Code

Control Firefox for automated browsing, web testing, and debugging. Navigate pages, fill forms, click elements, take screenshots, and monitor console/network activity.

## What's Included

- **MCP Server** - Connects Claude Code to Firefox via WebDriver BiDi
- **Skill** - Auto-triggers for browser automation, testing, and debugging tasks
- **Agents** - Dedicated `e2e-tester` and `web-extractor` agents for focused tasks
- **Commands** - `/firefox-devtools-mcp:navigate`, `/firefox-devtools-mcp:screenshot`, `/firefox-devtools-mcp:debug`

## Installation

```bash
/plugin marketplace add mozilla/firefox-devtools-mcp
/plugin install firefox-devtools-mcp@firefox-devtools-plugins
```

## Commands

### /firefox-devtools-mcp:navigate

Navigate to a URL and take a DOM snapshot:

```
/firefox-devtools-mcp:navigate https://example.com
/firefox-devtools-mcp:navigate https://github.com/login
```

### /firefox-devtools-mcp:screenshot

Capture the current page or a specific element:

```
/firefox-devtools-mcp:screenshot
/firefox-devtools-mcp:screenshot e15
```

### /firefox-devtools-mcp:debug

Show console errors and failed network requests:

```
/firefox-devtools-mcp:debug
/firefox-devtools-mcp:debug console
/firefox-devtools-mcp:debug network
```

## Agents

Spawn agents to keep your main context clean:

```
spawn e2e-tester to test the login flow on https://app.example.com
spawn web-extractor to extract product prices from https://shop.example.com
```

## Usage Examples

The plugin works automatically when you ask about browser tasks:

- "Navigate to example.com and take a screenshot"
- "Fill out the login form and submit"
- "Check for JavaScript errors on this page"
- "Extract all product prices from this page"

## Key Workflow

1. `take_snapshot` - Creates DOM snapshot with UIDs (e.g., `e42`)
2. Interact using UIDs - `click_by_uid`, `fill_by_uid`, etc.
3. Re-snapshot after DOM changes

## Requirements

- Firefox 120+
- Node.js 20.19.0+

## Links

- [Repository](https://github.com/mozilla/firefox-devtools-mcp)
- [npm](https://www.npmjs.com/package/@mozilla/firefox-devtools-mcp)
