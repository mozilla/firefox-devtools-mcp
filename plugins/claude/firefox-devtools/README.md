# Firefox DevTools Plugin for Claude Code

Firefox browser automation via WebDriver BiDi. Navigate pages, fill forms, click elements, take screenshots, and monitor console/network activity.

## What's Included

This plugin provides:

- **MCP Server** - Connects Claude Code to Firefox automation
- **Skills** - Auto-triggers for browser automation, testing, and scraping tasks
- **Agents** - Dedicated `e2e-tester` and `web-scraper` agents for focused tasks
- **Commands** - `/firefox:navigate`, `/firefox:screenshot`, `/firefox:debug`

## Installation

```bash
claude plugin install firefox-devtools
```

## Commands

### /firefox:navigate

Navigate to a URL and take a DOM snapshot:

```
/firefox:navigate https://example.com
/firefox:navigate https://github.com/login
```

### /firefox:screenshot

Capture the current page or a specific element:

```
/firefox:screenshot
/firefox:screenshot e15
```

### /firefox:debug

Show console errors and failed network requests:

```
/firefox:debug
/firefox:debug console
/firefox:debug network
```

## Agents

Spawn agents to keep your main context clean:

```
spawn e2e-tester to test the login flow on https://app.example.com
spawn web-scraper to extract product prices from https://shop.example.com
```

## Usage Examples

The plugin works automatically when you ask about browser tasks:

- "Navigate to example.com and take a screenshot"
- "Fill out the login form and submit"
- "Check for JavaScript errors on this page"
- "Scrape all product prices from this page"

## Key Workflow

1. `take_snapshot` - Creates DOM snapshot with UIDs (e.g., `e42`)
2. Interact using UIDs - `click_by_uid`, `fill_by_uid`, etc.
3. Re-snapshot after DOM changes

## Requirements

- Firefox 120+
- Node.js 20.19.0+

## Links

- [Repository](https://github.com/mozilla/firefox-devtools-mcp)
- [npm](https://www.npmjs.com/package/firefox-devtools-mcp)
