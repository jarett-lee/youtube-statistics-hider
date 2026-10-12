# YouTube Statistics Hider

A Chrome extension that hides engagement numbers on YouTube, such as view, like, and subscriber counts, and uses AI agents to repair itself when YouTube's layout changes.

> **Status:** finished proof of concept, in maintenance mode. The scope is fixed, and the project is left running to see how it handles YouTube's changes over time.

## An AI agent experiment

This project is deliberately built to use AI agents as much as possible as an experiment. AI agents write the code and documentation (see [AI_USAGE.md](AI_USAGE.md)), and AI agents keep the extension working once it's running.

The question it explores: can AI agents keep a fragile browser extension working on their own, with a person only approving their changes? YouTube changes its markup often and A/B tests layouts, so most statistics hiders, which depend on hand-written CSS selectors, break without warning. This one treats breakage as expected:

- **Automated checks** load YouTube twice a day and look for stats the extension missed. Once a week, a vision check also has Claude compare screenshots, to catch stats that are still visible and anything hidden by mistake.
- **A repair agent** (Claude) works out what broke, fixes the hiding rules, checks its fix with the same tests, and opens a pull request.
- **The maintainer** merges each repair PR, or refines it with an AI coding agent first.

## Results so far

- **No real breakage yet.** Every monitor run on `main` has passed, apart from deliberate tests: 24 of 24 runs, with nothing hidden by mistake in the 2 vision checks. YouTube hasn't yet changed its layout in a way that broke the extension.
- **Every deliberate breakage was caught and repaired, 5 of 5.** To test the system, the maintainer broke it on purpose five times:
  - Three times, the checks were widened to cover a stat the extension didn't hide yet: subscriber counts on channel pages, the channel card in a video's description, and like counts on comments. The repair agent wrote the missing rules, and all three were merged. They're part of the extension today.
  - Twice, a bad rule was planted: one hid the video title, and one collapsed the search results. The vision check caught both, and within minutes the repair agent opened a pull request that removed exactly the bad rule.
- **Cost:** $0.16–0.56 per repair, $2.44 for all five tests, and under $1 a month when nothing breaks ([COSTS.md](COSTS.md)).
- **What didn't go as well:**
  - The free DOM text scan that runs twice a day can't see content hidden by mistake. Only the weekly vision check can, so a rule that hides too much could go unnoticed for up to a week.
  - The vision check sometimes reports differences between two page loads as problems. The repair agent dismissed these correctly, but they add noise. For example, in the search screenshots below, "YouTube Music" is missing from the sidebar's "More from YouTube" list before the fix and back after it, and the failed run's vision check reported the entry as hidden by the extension. As the repair agent noted in [PR #12](https://github.com/jarett-lee/youtube-statistics-hider/pull/12), it wasn't in that page load's HTML at all, and the extension can only hide elements, not remove them. Why it comes and goes isn't known. Likely causes, none of them verified:
    - Every page load is a fresh, signed-out browser with no cookies, so YouTube may put each one in a different experiment, with a different sidebar.
    - GitHub's runners don't all share one location, and YouTube may promote YouTube Music differently by region.
    - The sidebar may fill in after the rest of the page, so on some loads the snapshot and screenshot are taken before the entry arrives.
  - The planted rules had a comment saying they were deliberate, and both repair agents quoted it, so those tests were easier than a real breakage would be.
  - The first repair failed to start three times because of setup errors in the Claude API authentication, before it worked.
  - Only English is supported, and A/B-tested layouts are out of scope.

[METRICS.md](https://github.com/jarett-lee/youtube-statistics-hider/blob/metrics/METRICS.md) has the current numbers, updated after every run, and [TESTING.md](TESTING.md) has each test with its run.

### Before and after

Screenshots from the repair pull requests, with the extension installed. "Before" is the failed run; "after" is the repair agent's fix.

| | Before | After |
|---|---|---|
| **Channel page:** the subscriber count wasn't hidden yet ([PR #4](https://github.com/jarett-lee/youtube-statistics-hider/pull/4), merged) | ![Channel page showing 4.55M subscribers](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/37671786939/channel-videos/before-1.png) | ![Channel page with the subscriber count hidden](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/37671786939/channel-videos/after-1.png) |
| **Comments:** like counts weren't hidden yet ([PR #7](https://github.com/jarett-lee/youtube-statistics-hider/pull/7), merged) | ![Comments showing like counts](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/37694284530/watch/before-3.png) | ![Comments with like counts hidden](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/37694284530/watch/after-3.png) |
| **Planted fault:** a rule hid the video title ([PR #11](https://github.com/jarett-lee/youtube-statistics-hider/pull/11), a test) | ![Video page with the title missing under the player](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/38304906591/watch/before-1.png) | ![Video page with the title shown again](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/38304906591/watch/after-1.png) |
| **Planted fault:** a rule collapsed the search results ([PR #12](https://github.com/jarett-lee/youtube-statistics-hider/pull/12), a test) | ![Search results cut off after the first result](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/38306705891/search/before-1.png) | ![Search results shown in full](https://raw.githubusercontent.com/jarett-lee/youtube-statistics-hider/c906bf204fc9964e80c7fddde3e0e186af0cba5d/38306705891/search/after-1.png) |

## Using the extension

The extension isn't published to the Chrome Web Store, and won't be: it's a proof of concept. To use it, load it from source (see [Load the extension locally](#load-the-extension-locally)).

It only works when YouTube is in English for now. It currently hides:

- view counts, on every page
- like counts on the video page, including on comments
- the channel's subscriber count under the video and on the channel card in its description
- the subscriber count on channel pages

## How it keeps working

GitHub Actions checks YouTube twice a day, and weekly with the vision check as well. When something breaks, the repair agent drafts a fix and opens a pull request, and the maintainer approves it. [WORKFLOW.md](WORKFLOW.md) has the full workflow with a diagram: each step, which steps are automated or use AI agents, where people come in, and the known gaps.

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

## License

[MIT](LICENSE)
