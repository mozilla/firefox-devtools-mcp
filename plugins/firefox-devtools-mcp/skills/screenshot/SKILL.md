---
name: screenshot
description: Take a screenshot of a URL or the current page. Use when the user asks to capture, screenshot, or photograph a web page or URL.
argument-hint: [url or uid]
---

# /firefox-devtools-mcp:screenshot

Captures a screenshot of a URL or the current page and shows it to the user.

## Usage

```
/firefox-devtools-mcp:screenshot https://example.com   # Navigate then screenshot
/firefox-devtools-mcp:screenshot                       # Screenshot current page
/firefox-devtools-mcp:screenshot <uid>                 # Screenshot specific element
```

## Steps

1. Navigate if a URL was given: call `navigate_page`.
2. Take the screenshot using the method that matches your environment:

**In Cowork** (system prompt contains an outputs folder host path under "Shell access"):
- Call `screenshot_page saveTo="<host-outputs-path>/screenshot.png"` using the host path from the system prompt, not the container path.
- Load and call `present_files` with that same path so the user receives a clickable file card.

**In Claude.ai chat or Claude Desktop** (no outputs folder in system prompt):
- Call `screenshot_page` without `saveTo`.
- Your final response must include the actual image returned — not a description of it. The user cannot see tool call outputs, only what you include in your reply.
