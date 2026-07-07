# Plugin installation for Claude Cowork

## Prerequisites

- **Firefox** 120+ installed
- **Node.js 20.19.0+** (includes npm) — required to run the MCP server. Download from [nodejs.org](https://nodejs.org).

## Installation Steps

Step by step guide to install the firefox-devtools-mcp plugin to Claude Cowork.

At any point, make sure the **Cowork** tab is selected and not the **Chat** tab. Plugins only work with Cowork.

1. Make sure Node.js is installed by running `node --version` in a terminal. The output should show version 20.19.0 or higher. If not, download it from [nodejs.org](https://nodejs.org).

![screenshot of command line used to check node and npm versions](cowork-npm-version.png)

2. Open the **Claude Desktop** application, and select the **Cowork** tab.

![screenshot of Claude Desktop with the cowork tab selected](cowork-cowork-tab.png)

3. In the left sidebar, click on the **Customize** button.

![screenshot of Claude Desktop with the Customize button highlighted](cowork-customize.png)

4. In the popup which opened, click on the **Plugins** category.

![screenshot of Claude Desktop with the Plugins category highlighted](cowork-customize-plugins.png)

5. In the top-right, click on **Add > Add marketplace**.

![screenshot of Claude Desktop with the Add marketplace option highlighted](cowork-customize-add-marketplace.png)

6. Paste the URL of this repository (`https://github.com/mozilla/firefox-devtools-mcp`) in the popup, validate.

![screenshot of Claude Desktop with the repository URL pasted in the popup](cowork-customize-add-marketplace-url.png)

7. Click on **Sync**.

8. You should now see a new popup called **Directory**, with the list of plugins from the new marketplace.

![screenshot of Claude Desktop showing the Directory popup with the plugin list](cowork-customize-directory-popup.png)

9. Click on the **+** button and wait for the security prompt (it takes a few seconds), then click **Continue**.

![screenshot of Claude Desktop showing the security prompt with the Continue button](cowork-customize-continue.png)

10. Plugin is now ready to use. Close all the popups and try it out in a Cowork task such as "Use Firefox to open mozilla.org and rotate the page by 16 degrees".

11. You will have to allow each tool usage when starting a new task, so make sure to click the **Allow** button if appropriate.

![screenshot of Claude Desktop with the Allow button highlighted](cowork-allow.png)

## Troubleshooting

Some known issues / limitations.

**Q: Claude says the Firefox DevTools tools aren't available, or suggests using a different browser.**

Cowork is often vague about the root cause — it may say things like "the MCP server failed to connect" or "the tools aren't registered", or simply offer to switch to Chrome instead. Check the following:

- Make sure you are in **Claude Cowork**, not in **Claude Chat** — plugins only work in Cowork.
- **Node.js** is missing or outdated. Run `node --version` in a terminal to check. It must be 20.19.0 or higher. If not, download it from [nodejs.org](https://nodejs.org).
- The plugin is not installed. Check that it is listed after clicking on **Customize > Plugins**.

If none of the above helps, file a bug on [Bugzilla](https://bugzilla.mozilla.org/enter_bug.cgi?format=__default__&blocked=2026717&product=Developer%20Infrastructure&component=Firefox%20MCP) or ask in the [#firefox-devtools-mcp Matrix room](https://chat.mozilla.org/#/room/#firefox-devtools-mcp:mozilla.org).

**Q: Firefox closes after Claude has executed its task.**

It's a known issue, see [Bug 2052882](https://bugzilla.mozilla.org/show_bug.cgi?id=2052882). You can ask Claude to perform complex tasks in several steps but it will still stop the browser before taking your next prompt.

**Q: Firefox is not using my profile, I don't have my bookmarks, cookies, etc.**

Exposing real profiles to LLM agents is risky and by default the MCP will use temporary profiles for each session. With [Bug 2052552](https://bugzilla.mozilla.org/show_bug.cgi?id=2052552), you will be able to reuse the same profile across consecutive sessions, but it will still differ from your regular profile. Improvements for the closing issue in [Bug 2052882](https://bugzilla.mozilla.org/show_bug.cgi?id=2052882) will probably help here as well.

