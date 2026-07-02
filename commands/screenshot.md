---
description: Take a screenshot of the current page or element
argument-hint: [uid]
---

# /firefox-devtools-mcp:screenshot

Captures a screenshot of the page or a specific element.

## Usage

```
/firefox-devtools-mcp:screenshot          # Full page
/firefox-devtools-mcp:screenshot <uid>    # Specific element
```

## Examples

```
/firefox-devtools-mcp:screenshot
/firefox-devtools-mcp:screenshot e15
/firefox-devtools-mcp:screenshot e42
```

## What Happens

- Without UID: Calls `screenshot_page` for full page capture
- With UID: Calls `screenshot_by_uid` for element-specific capture

Screenshots are saved and displayed in the conversation.
