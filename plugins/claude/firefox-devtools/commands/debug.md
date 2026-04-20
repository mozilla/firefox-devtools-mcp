---
description: Show console errors and failed network requests
argument-hint: [console|network|all]
---

# /firefox:debug

Displays debugging information from the current page.

## Usage

```
/firefox:debug              # Show all (console errors + failed requests)
/firefox:debug console      # Console messages only
/firefox:debug network      # Network requests only
```

## Examples

```
/firefox:debug
/firefox:debug console
/firefox:debug network
```

## What Happens

- `console`: Calls `list_console_messages` with `level="error"`
- `network`: Calls `list_network_requests` with `statusMin=400`
- `all` (default): Shows both console errors and failed network requests

Useful for debugging page issues, JavaScript errors, and API failures.
