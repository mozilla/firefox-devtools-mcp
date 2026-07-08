---
name: firefox-devtools-diagnose
description: Diagnose Firefox DevTools MCP setup issues. Activate when the firefox-devtools-mcp plugin fails to connect, its tools are not available, or the user reports Firefox DevTools not working in Cowork.
---

When Firefox DevTools MCP tools are unavailable or the user reports issues with the firefox-devtools-mcp plugin, run this diagnostic sequence automatically. Do not ask the user to do these checks manually.

## Diagnostic Steps

### 1. Check Node.js

Run `node --version` using the Bash tool.

- If the command fails with "command not found": tell the user Node.js is not installed and direct them to download Node.js 20.19.0 or higher from https://nodejs.org.
- If the version is below 20.19.0: tell the user their Node.js version is too old and they need to upgrade to 20.19.0 or higher from https://nodejs.org.
- If the version is 20.19.0 or higher: Node.js is not the issue, continue to the next check.

### 2. Check Your Own Tool List

Check whether any `firefox-devtools-mcp:*` tools are present in your current tool list.

- If present: the plugin is installed and connected in this conversation. The reported issue is not a setup problem — investigate the specific tool failure directly (bad arguments, target page state, etc.) rather than continuing this checklist.
- If absent: this is ambiguous by itself. An empty tool list looks identical whether the plugin isn't installed, the user is in the Chat tab instead of Cowork, or the plugin is installed in Cowork but failing for some other reason. Do not guess which; continue to the next step.

### 3. Check Installation and Tab Together

Since an absent tool list can't be attributed to a single cause from your side, ask the user to confirm both of the following in one pass:

- Open **Customize > Plugins** in Claude Cowork and confirm `firefox-devtools-mcp` appears in the list.
- Confirm they are currently in the **Cowork** tab, not the **Chat** tab — plugins only work in Cowork.

- If the plugin is missing: direct them to the installation steps at https://github.com/mozilla/firefox-devtools-mcp.
- If the plugin is present but they were in Chat: ask them to switch to Cowork and retry.
- If the plugin is present and they are already in Cowork: continue to the next step.

### 4. Escalate

If all checks pass and the plugin still does not work, tell the user to report the issue:

- File a bug on [Bugzilla](https://bugzilla.mozilla.org/enter_bug.cgi?format=__default__&blocked=2026717&product=Developer%20Infrastructure&component=Firefox%20MCP)
- Or ask in the [#firefox-devtools-mcp Matrix room](https://chat.mozilla.org/#/room/#firefox-devtools-mcp:mozilla.org)
