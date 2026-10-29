---
name: web-performance
description: Find and fix why a website is slow by capturing and analyzing a Firefox performance profile, or by analyzing a profile the user already has (a saved file or a profiler.firefox.com share link). Use for slow page loads, janky scrolling or animation, slow interactions or a slow STR, long tasks, layout thrashing, or heavy JavaScript.
---

Work from a real profile, find the cause in the user's code, report it honestly, and if asked, fix it and prove the fix worked. The Firefox MCP drives Firefox and records a profile when there is none yet; `profiler-cli` queries the profile, whether you captured it or the user brought it. Report in web-platform terms (LCP, main-thread blocking, reflow, render-blocking resources), not Gecko internals - unless the target is Firefox itself rather than a page, in which case platform frames are the subject and the fix lands in mozilla-central.

## Step 0: Prerequisites

profiler-cli needs Node.js >= 24:
```bash
command -v profiler-cli >/dev/null 2>&1 || npm install -g @firefox-devtools/profiler-cli@latest
```
`npx @firefox-devtools/profiler-cli@latest` also works but re-resolves on every call.

The rest of this step is only for capturing. Skip it when the user already has a profile.

The profiler tools need **Firefox 154+**. Check with `get_firefox_info`, which also launches it. If Firefox is missing or older, stop and ask the user to install a current release or point the server at one with `--firefox-path`. The profiler tools also need the `developer` tool preset: if `profiler_start` is absent, ask the user to restart the server with `--tool-preset developer`, since the default `basic` preset has no profiler.

## Step 1: Pick the scenario

**If the user already has a profile** - a saved `.json.gz`, or a `share.firefox.dev` / profiler.firefox.com link - there is nothing to capture: skip to Step 3 and `load` it directly. Ask what they were doing while it recorded, since the capture type decides the entry point in the playbook. Verifying a fix (Step 6) still needs a capture, so if you cannot reach their setup, hand them the recipe and ask for an after profile.

Otherwise ask if unclear: **page load**, **interaction / STR** (one slow action), or **ongoing jank** (scroll stutter, dropped frames, CPU pinning). Each has a recipe in `references/capture-recipes.md`.

## Step 2: Capture

Follow that recipe. Keep the window tight - start late, stop early - and keep the profile path `profiler_stop` returns.

## Step 3: Analyze

1. Run `profiler-cli guide` and read the **entire** output; it is the command reference for everything below. Do not skim, and make sure that Bash did not truncate it.
2. `profiler-cli load <path>`, or `profiler-cli load <share-url>` for a profile the user shared.
3. Work through `references/analysis-playbook.md`: thread selection, the entry point for each capture type, and a symptom-to-command map.

Run the commands and interpret the output yourself; do not print commands for the user to run.

## Step 4: Find the cause in the source

`Grep`/`Glob`/`Read` the project for the code behind a hot function or request, and confirm the mechanism. If you cannot connect a finding to real source, say so instead of inventing a code path.

## Step 5: Report with explicit confidence

Label every finding:
- **Confirmed** - in the profile and cross-checked (stack traced to source, a measured before/after, a `performance.measure` you captured). State the evidence.
- **Likely** - strong single-source evidence, not cross-checked. Say what would confirm it.
- **Hypothesis** - a plausible reading of ambiguous data. Say so, and how to validate it.

If sampling is sparse, the window was wrong, or the time is mostly idle, call it inconclusive and re-capture instead of guessing.

Per finding: what is slow -> evidence (function/marker/request and its cost) plus confidence -> why -> the fix in the developer's terms. Biggest confirmed wins first.

When a "likely" or "hypothesis" finding is worth acting on, get more evidence first. `references/validation.md` covers instrumenting the page with User Timing and reading navigation, resource, paint, LCP and Event Timing entries.

## Step 6: Fix and verify

Implement only if asked, keeping the change minimal and tied to the confirmed finding. Then re-capture like-for-like (see the before/after section of the recipes) and compare the metric that was slow. Quantify the gain; if it did not improve, or something else regressed, say so and reconsider.

## Step 7: Clean up

`profiler-cli stop` - the daemon holds a port and memory until stopped. Stop the Firefox profiler if `profiler_is_active`, and remove instrumentation you injected unless the user wants it kept.
