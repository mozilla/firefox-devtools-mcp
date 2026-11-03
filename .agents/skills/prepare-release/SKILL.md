---
name: prepare-release
description: Prepare a firefox-devtools-mcp release. Bumps the version, syncs the manifests, and drafts the CHANGELOG.md entry from the commits since the last release. Use when asked to prepare, cut, or bump a release.
allowed-tools:
  - Bash(npm run sync:manifests)
  - Bash(osascript -l JavaScript .agents/skills/prepare-release/scripts/copy-to-clipboard.js:*)
  - Bash(osascript -l JavaScript .claude/skills/prepare-release/scripts/copy-to-clipboard.js:*)
---

# Prepare a release

The release process is described in `docs/ci-and-release.md`. This skill covers the
release-prep commit only. Tagging and publishing stay with the user.

## 1. Find the last release

```bash
git log --oneline --grep='chore: prepare release' -1
```

Use `git show <sha>` on it as a template for the expected diff.

## 2. Pick the version

- Default to a patch bump (0.x.y -> 0.x.y+1), even when the release adds a tool or an option.
- If the branch name contains a version (for example `prepare-release-0.10.7`), use it
  instead of the default, without asking.

## 3. Bump and sync

Edit only the `version` field in `package.json`, then run:

```bash
npm run sync:manifests
```

This updates `plugin.json`, `gemini-extension.json`, `manifest.mcpb.json`, `server.json`
(two fields) and `package-lock.json` (two fields). Do not edit them by hand. Check with
`git diff --stat` that only these files and `package.json` changed.

## 4. Draft the CHANGELOG.md entry

Read every commit since the last release, with bodies:

```bash
git log --reverse <last-release-sha>..HEAD --format='=== %h %s%n%b'
git log <last-release-sha>..HEAD --stat
```

Look at the source diff (`git show <sha> -- src README.md`) when the message does not make
the user-visible effect clear.

Add a section right under `## [Unreleased]`:

```
## [X.Y.Z] - YYYY-MM-DD
```

Use today's date. Use the `### Added`, `### Fixed`, `### Changed` headings, in this order,
and only the ones that have entries.

Rules for entries:

- Describe what a user of the MCP server sees: tool names in backticks, CLI flags with their
  environment variable, error messages, default values.
- Combine all commits of one bug into one or two entries. Do not list bug numbers.
- Leave out test-only, CI-only and internal refactoring commits (test layout, test harness,
  removed scripts, `chore:` cleanups), unless they change behavior.
- Include README changes that teach users something new, under `### Changed`.
- Migrations to WebDriver BiDi go under `### Changed`. Their visible side effects go under
  `### Fixed` or `### Changed` as their own entries.
- A commit that says "use X" or "migrate to X" can still be a bug fix. Check whether the old
  code worked in the last release: find when it was last changed (`git log -- <file>`,
  `git tag --contains <sha>`), and check whether the commit adds a test that would fail
  without it. If the feature was broken, write a `### Fixed` entry that says it works again
  and since which version it was broken.
- Plain, short sentences. No trailing period, as in the existing entries. No emojis.
- If a release has no server changes, say so in one line under the heading, as in 0.10.4.

## 5. Stop

Do not commit, tag or push. Show the user the changelog entry and the `git diff --stat`, and
suggest the commit message:

```
chore: prepare release vX.Y.Z
```

Remind the user of the next steps from `docs/ci-and-release.md`: merge the release-prep
commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.

## 6. Draft the Discourse post (when asked)

Draft the release announcement in a fenced code block, so the user can paste it as is. Do
not post it anywhere. Use the same sections as the changelog entry, with `*` bullets and
slightly shorter wording. Put fixes for broken features first in `### Fixed`. Use this
template:

```
New release of Firefox DevTools MCP. Available on npm at https://www.npmjs.com/package/@mozilla/firefox-devtools-mcp

### Added

* New `print_page` tool. It saves the current page as a PDF file and has optional `landscape` and `background` options. It uses print CSS, so you can use it to check print styles

### Fixed

* `select_page` and `close_page` now act on the tab from the last tab list, even if tabs were opened or closed since then

### Changed

* If the title of a tab cannot be read within 1 second, the tab is listed with the title `(unknown)`

Full changelog: https://github.com/mozilla/firefox-devtools-mcp/releases/tag/vX.Y.Z
Repository and issues: https://github.com/mozilla/firefox-devtools-mcp
Public chatroom: https://chat.mozilla.org/#/room/#firefox-devtools-mcp:mozilla.org
```

The bullets above are examples from 0.10.6. Replace them with the entries of the new release.

## 7. Draft the chat message (when asked)

For Slack, Matrix and similar chats. Same content as the Discourse post, but Slack does not
turn pasted plain text into lists, whatever the bullet character. It only keeps lists when
the clipboard holds HTML. So write the message as HTML, write a plain-text copy, and put both
on the macOS clipboard.

This step needs macOS. On other systems, write `msg.html` and `msg.txt` (steps 1 and 2),
skip step 3, and tell the user to open `msg.html` in a browser and copy it from there.

Content rules:

- Section names in bold (`<p><b>Added</b></p>`), lists as `<ul><li>`.
- `<code>` around tool names, flags, environment variables, option names and BiDi commands,
  as the backticks in the Discourse post.
- Each bullet ends with a period.
- Links as `<a href>`, with the URL as the link text.
- Escape `<`, `>` and `&` in the text as `&lt;`, `&gt;` and `&amp;`.
- Only the "Full changelog" link at the end, without the repository and chatroom links.

Steps:

1. Write `/tmp/release-msg/msg.html`. Start it with `<meta charset="utf-8">`. Template:

   ```html
   <meta charset="utf-8"><p>New release of Firefox DevTools MCP. Available on npm at <a href="https://www.npmjs.com/package/@mozilla/firefox-devtools-mcp">https://www.npmjs.com/package/@mozilla/firefox-devtools-mcp</a></p>
   <p><b>Added</b></p>
   <ul>
   <li>New <code>print_page</code> tool. It saves the current page as a PDF file and has optional <code>landscape</code> and <code>background</code> options. It uses print CSS, so you can use it to check print styles.</li>
   </ul>
   <p><b>Fixed</b></p>
   <ul>
   <li><code>select_page</code> and <code>close_page</code> now act on the tab from the last tab list, even if tabs were opened or closed since then.</li>
   </ul>
   <p><b>Changed</b></p>
   <ul>
   <li>If the title of a tab cannot be read within 1 second, the tab is listed with the title <code>(unknown)</code>.</li>
   </ul>
   <p>Full changelog: <a href="https://github.com/mozilla/firefox-devtools-mcp/releases/tag/vX.Y.Z">https://github.com/mozilla/firefox-devtools-mcp/releases/tag/vX.Y.Z</a></p>
   ```

   The bullets above are examples from 0.10.6. Replace them with the entries of the new
   release.

2. Write the plain-text copy, for apps that do not read HTML:

   ```bash
   sed -e 's/<li>/- /; s/<\/*code>/`/g; s/<[^>]*>//g; s/&lt;/</g; s/&gt;/>/g; s/&amp;/\&/g' /tmp/release-msg/msg.html | grep -v '^$' > /tmp/release-msg/msg.txt
   ```

3. Put both on the clipboard:

   ```bash
   osascript -l JavaScript .agents/skills/prepare-release/scripts/copy-to-clipboard.js /tmp/release-msg/msg.html /tmp/release-msg/msg.txt
   ```

   Setting only the HTML with `osascript -e 'set the clipboard to «data HTML...»'` does not
   work in Slack. Both types must be set through `NSPasteboard`, as the script does.

4. Show the plain-text copy to the user, and tell them the message is on the clipboard,
   ready to paste with Cmd+V. If pasting fails, they can `open /tmp/release-msg/msg.html`
   in a browser, select all, copy, and paste.
