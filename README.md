# YouTube Statistics Hider

A Chrome extension that hides engagement numbers on YouTube, such as view, like and subscriber counts, and uses AI agents to repair itself when YouTube's layout changes.

> **Status:** finished proof of concept, in maintenance mode. The scope is fixed, and the project is left running to see how it handles YouTube's changes over time, such as new A/B tests.

## An AI agent experiment

This project is deliberately built to use AI agents as much as possible as an experiment. AI agents write the code and documentation (see [AI_USAGE.md](AI_USAGE.md)), and AI agents keep the extension working once it's running.

The question it explores: can AI agents keep a fragile browser extension working on their own, with a person only approving their changes? YouTube changes its markup often and A/B tests layouts, so most statistics hiders, which depend on hand-written CSS selectors, break without warning. This one treats breakage as expected:

- **Automated checks** load YouTube twice a day and look for stats the extension missed. Once a week, Claude also compares screenshots to catch stats that are still visible and anything hidden by mistake.
- **A repair agent** (Claude) diagnoses a breakage, edits the hiding rules, tests its fix and opens a pull request.
- **The maintainer** merges each repair PR, or refines it with an AI coding agent first.

**How it's going:** the extension, the checks and the repair agent are built and running. [METRICS.md](https://github.com/jarett-lee/youtube-statistics-hider/blob/metrics/METRICS.md) tracks how often the extension is broken, how often the wrong thing is hidden, how often repairs work and what they cost, updated after every run. [COSTS.md](COSTS.md) explains what it spends: under $1 a month when nothing breaks.

## Using the extension

The extension isn't published to the Chrome Web Store, and won't be: it's a proof of concept. To use it, load it from source (see [Load the extension locally](#load-the-extension-locally)).

It only works when YouTube is in English for now. It currently hides:

- view counts, on every page
- like counts on the video page, including on comments
- the channel's subscriber count under the video and on the channel card in its description
- the subscriber count on channel pages

## How it keeps working

GitHub Actions checks YouTube twice a day, and weekly with Claude's screenshot check as well. When something breaks, the repair agent drafts a fix and opens a pull request, and the maintainer approves it. [WORKFLOW.md](WORKFLOW.md) has the full workflow with a diagram: each step, which steps are automated or use AI agents, where people come in, and the known gaps.

## For developers

### Load the extension locally

This is how to use the extension, and how to try changes to it. To load the extension from source:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `src` folder.
4. Reload any YouTube tabs that were already open. Chrome doesn't add the extension to pages that were loaded before it was installed.

After you change the code, click the reload icon on the extension's card in `chrome://extensions`, then reload the YouTube tab.

### Run the checks

Requires Node.js 22 or later:

```sh
npm install
npx playwright install chromium
npm run monitor
```

### Learn more

- [DESIGN.md](DESIGN.md): how each part works, running the monitor and the repair agent, GitHub setup, and how the project will be evaluated.
- [WORKFLOW.md](WORKFLOW.md): the process, who decides what, and known gaps.
- [TESTING.md](TESTING.md): which workflow paths have been tested end to end.
- [COSTS.md](COSTS.md): what it costs to run, and the spending limits.

| Folder | Contents |
|---|---|
| [src/](src/) | The Chrome extension (Manifest V3) |
| [monitor/](monitor/) | Playwright checks: DOM text scan and vision check |
| [repair/](repair/) | The repair agent and the script that opens its pull requests |
| [metrics/](metrics/) | Scripts that log each run and build [METRICS.md](https://github.com/jarett-lee/youtube-statistics-hider/blob/metrics/METRICS.md) |
| [.github/workflows/](.github/workflows/) | The GitHub Actions workflows |

Built with Chrome Manifest V3, Playwright, GitHub Actions, and the Claude API (a vision check and a tool-using repair agent), authenticated with Workload Identity Federation.
