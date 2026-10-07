# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Chrome extension (Manifest V3) that hides YouTube engagement stats, kept working by AI agents: a Playwright monitor in GitHub Actions detects breakages, and a Claude repair agent drafts fixes as pull requests for the maintainer to approve. The project is an experiment in using AI agents as much as possible, so all code and documentation is AI-written unless marked otherwise ([AI_USAGE.md](AI_USAGE.md)).

## Audiences

Write each document for its readers, and keep these in mind when deciding what goes where.

| Document | Readers | Keep it |
|---|---|---|
| [README.md](README.md) | People following the AI agent experiment; people who want to use the extension; developers who want to work on the repo; people interested in how the project was built | Short and high level. Technical detail belongs in DESIGN.md, process in WORKFLOW.md |
| [WORKFLOW.md](WORKFLOW.md) | The maintainer and contributors; planning what to automate next | Organized around people's goals and decisions (goal-directed task analysis), not around the code |
| [DESIGN.md](DESIGN.md) | Developers working on the code | Complete and accurate: how each part works, how to run it, setup |
| [TESTING.md](TESTING.md) | The maintainer | One row per workflow path, with its test status and the run that proves it. Add a row when the workflow gains a path |
| [AI_USAGE.md](AI_USAGE.md) | Anyone | A plain statement of how AI is used |
| Repair PR descriptions (written by [repair/open-pr.mjs](repair/open-pr.mjs) and the agent) | The maintainer, deciding whether to approve | The evidence needed to approve quickly |
## Conventions

- Mark features that aren't built yet as **(planned)** in the docs; don't describe them as working.
- A false positive (hiding something that isn't a stat) is worse than a missed stat.
- What the extension must hide, and what must stay visible, is defined in [monitor/scope.mjs](monitor/scope.mjs). Keep it in sync with the rules in `src/` and the patterns in [monitor/checks.mjs](monitor/checks.mjs).
- Only English is supported for now. In hiding rules, prefer selectors that don't depend on text (element tags, IDs, structure); keep aria-label and text matches only as English fallbacks. Checks may rely on aria-labels. When writing a rule, use the aria-label to find the stat, then derive a text-independent selector (see issue #5).
- The Claude API is reached only through Workload Identity Federation in CI and `ant auth login` locally. Don't add API keys.
- The repair agent may edit only `src/hide.css` and `src/content.js`.
- The workflow jobs run in the `mcr.microsoft.com/playwright` image. Its tag in `monitor.yml` must match the `playwright` version in `package.json`; update both together.

## Commands

```sh
npm install
npx playwright install chromium
npm run monitor                          # all pages; vision check only with Claude API credentials
MONITOR_PAGES=watch MONITOR_VISION=0 npm run monitor
node repair/agent.mjs <monitor-output dir>
```

There's no build step: load `src/` unpacked in `chrome://extensions` to try the extension.

## Private notes

Two git-ignored folders hold private notes:

- `claude/` holds the maintainer's notes for AI agents. If it exists, read every file in it at the start of a session.
- `notes/` holds the maintainer's own notes, for a person to read. Don't read it at the start of a session; add to it only when asked.
