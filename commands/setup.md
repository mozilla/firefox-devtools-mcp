---
description: Configure Firefox path, profile, and options for this plugin
---

Walk the user through configuring Firefox DevTools MCP with their preferred Firefox installation and profile. Write the result to their Claude Code user settings so they never need to edit a JSON file manually.

## Step 1: Detect OS and find Firefox

Use the Bash tool to detect the OS and check common Firefox locations:

**macOS** — check in order:
```bash
ls "/Applications/Firefox.app/Contents/MacOS/firefox" 2>/dev/null && echo found || echo missing
ls "/Applications/Firefox Nightly.app/Contents/MacOS/firefox" 2>/dev/null && echo found || echo missing
ls "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox" 2>/dev/null && echo found || echo missing
```

**Linux**:
```bash
which firefox 2>/dev/null || echo missing
which firefox-esr 2>/dev/null || echo missing
```

**Windows**:
```bash
ls "C:/Program Files/Mozilla Firefox/firefox.exe" 2>/dev/null && echo found || echo missing
ls "C:/Program Files (x86)/Mozilla Firefox/firefox.exe" 2>/dev/null && echo found || echo missing
```

Report what you found in plain language. If multiple versions are found, list them and ask which one to use. If none are found, ask the user to provide the path manually.

## Step 2: Ask about Firefox profile

Ask: "Do you want Firefox to use a specific profile (for example, to keep bookmarks, cookies, or logins separate from your regular browser)? If unsure, say no — a clean temporary profile will be used."

If yes, help them find their profiles:

**macOS**: `ls ~/Library/Application\ Support/Firefox/Profiles/`
**Linux**: `ls ~/.mozilla/firefox/`
**Windows**: `ls "$APPDATA/Mozilla/Firefox/Profiles/"`

List the profile folders and ask which one to use, or let them type a path.

## Step 3: Ask about headless mode

Ask: "Should Firefox run without a visible window (headless mode)? This is useful for automated tasks where you don't need to see the browser. Default is no."

## Step 4: Write the config

Read `~/.claude/settings.json` if it exists, then merge in the new `mcpServers` entry. Create the file if it doesn't exist.

Build the args array starting with `["-y", "@mozilla/firefox-devtools-mcp@latest"]`, then append:
- `"--firefox-path", "<path>"` if a custom Firefox path was chosen
- `"--profile-path", "<path>"` if a profile was chosen
- `"--headless"` if headless mode was chosen

Write the result back to `~/.claude/settings.json`.

Example output:
```json
{
  "mcpServers": {
    "firefox-devtools": {
      "command": "npx",
      "args": ["-y", "@mozilla/firefox-devtools-mcp@latest", "--firefox-path", "/Applications/Firefox.app/Contents/MacOS/firefox"]
    }
  }
}
```

## Step 5: Confirm

Tell the user their configuration has been saved and ask them to run `/reload-plugins` to apply it. If they already have Firefox open and connected, remind them the new config takes effect on next restart.
