---
description: Show console errors and failed network requests
argument-hint: [console|network|all]
---

# /firefox-devtools-mcp:debug

Displays debugging information from the current page.

## Usage

```
/firefox-devtools-mcp:debug              # Show all (console errors + failed requests)
/firefox-devtools-mcp:debug console      # Console messages only
/firefox-devtools-mcp:debug network      # Network requests only
```

## Examples

```
/firefox-devtools-mcp:debug
/firefox-devtools-mcp:debug console
/firefox-devtools-mcp:debug network
```

## What Happens

- `console`: Calls `list_console_messages` with `level="error"`
- `network`: Calls `list_network_requests` with `statusMin=400`
- `all` (default): Shows both console errors and failed network requests

Useful for debugging page issues, JavaScript errors, and API failures.
