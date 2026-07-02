---
name: browser-automation
description: This skill should be used when the user asks about browser automation, testing web pages, extracting content, filling forms, taking screenshots, or monitoring console/network activity. Activates for E2E testing, form automation, browsing tasks, or debugging web applications.
---

When the user asks about browser automation, use Firefox DevTools MCP to control a real Firefox browser.

## When to Use This Skill

Activate this skill when the user:

- Wants to automate browser interactions ("Fill out this form", "Click the login button")
- Needs E2E testing ("Test the checkout flow", "Verify the login works")
- Wants to browse or extract content ("Get all links on this page", "Extract prices")
- Needs screenshots ("Screenshot this page", "Capture the error state")
- Wants to debug ("Check for JS errors", "Show failed network requests")
- Needs to profile performance ("Profile this page load")

## Core Workflow

### Step 1: Navigate and Snapshot

```
navigate_page url="https://example.com"
take_snapshot
```

The snapshot returns a DOM representation with UIDs (e.g., `e42`) for each interactive element.

### Step 2: Interact with Elements

Use UIDs from the snapshot:

```
fill_by_uid uid="e5" text="user@example.com"
click_by_uid uid="e8"
```

### Step 3: Re-snapshot After Changes

DOM changes invalidate UIDs. Always re-snapshot after:
- Page navigation
- Form submissions
- Dynamic content loads

```
take_snapshot  # Get fresh UIDs
```

## Quick Reference

| Task | Tools |
|------|-------|
| Navigate | `navigate_page`, `navigate_history` |
| See DOM | `take_snapshot` |
| Click | `click_by_uid` |
| Hover | `hover_by_uid` |
| Type | `fill_by_uid`, `fill_form_by_uid` |
| Drag | `drag_by_uid_to_uid` |
| Dialogs | `accept_dialog`, `dismiss_dialog` |
| Screenshot | `screenshot_page`, `screenshot_by_uid` |
| Debug | `list_console_messages`, `list_network_requests` |
| Profile | `profiler_start`, `profiler_stop` |

## Guidelines

- **Always snapshot first**: UIDs only exist after `take_snapshot`
- **Re-snapshot after DOM changes**: UIDs become stale after interactions
- **Check for errors**: Use `list_console_messages level="error"` to catch JS issues
- **Firefox only**: This MCP controls Firefox, not Chrome or Safari
