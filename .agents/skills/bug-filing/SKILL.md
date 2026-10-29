---
name: bug-filing
description: File a Bugzilla bug for firefox-mcp, or draft a bug summary and description. Use when the user asks to file a bug, wants a bug summary/description for a change, or needs to report a defect/enhancement/task in this repo. Drafts the summary and description, and opens a prefilled enter_bug.cgi form in the browser for the user to submit.
allowed-tools:
  - Bash(python3 .agents/skills/bug-filing/file-bug.py:*)
  - Bash(python3 .claude/skills/bug-filing/file-bug.py:*)
---

# Filing a bug

## Overview

File a bug by opening a prefilled Bugzilla "enter bug" form in the user's browser.
The user reviews the form and submits it, so the bug is created under their own
account.

## Workflow

1. **Get the product, component and meta bug.** Read the "Issues" section of
   `CONTRIBUTING.md`. It gives the product, the component, and the meta bug that
   every new bug blocks. Use the values from that file, not values from memory.

2. **Choose the bug type** (per Mozilla's task/defect/enhancement guide):

   - `defect`: shipping software does not behave as expected: a regression, a crash, an error.
   - `enhancement`: a new feature, or a change to how an existing feature behaves.
   - `task`: a configuration change, a refactor, or other engineering work with
     no user-facing behavior change (tooling, tests, CI, docs, build).

3. **Draft the summary and description.**

   - Shape the summary to the bug type. The mechanism, the file list, and any
     counts belong in the description, not the summary.
     - `defect`: the symptom, in the words of someone who hits it
       ("list_extensions omits disabled extensions"). Not the suspected cause and
       not the fix: either can turn out wrong.
     - `enhancement`: the capability wanted ("Support filtering list_pages by URL").
     - `task`: the action to take ("Migrate set_viewport_size to WebDriver BiDi").
   - Write plain, simple English: short sentences, common words, no metaphors.
     Never use emojis.
   - Use ordinary words, and never a term coined for the occasion.
   - Match a sibling bug's shape when one exists, so the two are easy to find
     together.
   - Keep what is confirmed apart from what is not. If the cause is a guess, say
     so, and say how to confirm it.
   - Link to the evidence: a CI run, a PR, a log line, or a file and line.
   - In the description, wrap code identifiers (function, variable, file, tool,
     option and pref names) in backticks.

4. **Open the prefilled form.** Do not print the draft or ask for approval first:
   the user reviews it in the form, and nothing is filed until they submit it. If
   the user asked only for a summary and description, print those as plain text
   (no `>` blockquote markers) and stop.

   A request to file a bug, in any wording, means opening this form. Never create
   the bug yourself, even with a Bugzilla API key at hand.

   Run the helper script with each `enter_bug.cgi` field as a `field=value`
   argument. It URL-encodes the values and opens the form in the browser:

   ```
   python3 .agents/skills/bug-filing/file-bug.py 'product=<P>' 'component=<C>' \
       'blocked=<meta bug>' 'bug_type=<T>' 'short_desc=<summary>' 'comment=<description>'
   ```

   - Single-quote every `field=value` argument.
   - Write `short_desc` and `comment` as plain text, with backticks around code
     identifiers. The script does all the encoding.
   - Add more fields when the bug needs them, for example `dependson=<bug>` or
     `see_also=<url>`. The same key can repeat, for example a second `blocked`.

   The script prints a one-line confirmation. Never paste the URL into the reply:
   it is too long to be clickable. Report the summary instead.

   Tell the user they can edit the form before submitting it, or ask for changes.
   For changes, run the script again with the new draft.

## Notes

- `file-bug.py` comes from the `bug-filing` skill in mozilla-central.
- The skill exists in both `.agents/skills/` and `.claude/skills/`. Keep the two
  copies the same.
