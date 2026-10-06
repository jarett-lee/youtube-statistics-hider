# YouTube Statistics Hider

A Chrome extension that hides engagement numbers on YouTube (views, likes, subscriber counts, comment counts), and uses AI agents to repair itself when YouTube's layout changes.

> **Status:** early development. This README describes the planned design, and some features may not be built yet.

> **AI usage:** all code and documentation is written by AI agents unless marked otherwise. See [AI_USAGE.md](AI_USAGE.md).

## Loading the extension

The extension isn't published to the Chrome Web Store yet. To load it from source:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and select the `src` folder.
4. Reload any YouTube tabs that were already open. Chrome doesn't add the extension to pages that were loaded before it was installed.

After you change the code, click the reload icon on the extension's card in `chrome://extensions`, then reload the YouTube tab.

## Why

YouTube changes its UI often and A/B tests layouts, so different users see different page structures. Most statistics hiders depend on hand-written CSS selectors, and they break without warning whenever the markup shifts. This project treats breakage as expected: it checks for failures automatically and proposes fixes, and a human approves each fix before it ships.

## How it works

### 1. The extension

The extension hides elements matched by a **rules config**: a list of selectors kept separate from the extension code. The rules config is fetched from the project, so a fix doesn't need a new extension release. A **heuristic fallback** also scans visible text for stat-like patterns (for example `1.2M views` or `34K likes`). This catches numbers that the selectors miss, including those in A/B-test layouts no rule covers yet.

### 2. The monitor

A scheduled GitHub Actions job uses Playwright to load YouTube with the extension installed. Each run performs two checks:

- **DOM text scan:** searches the rendered page for leftover stat patterns.
- **Vision review:** a vision model looks at a screenshot and answers two questions:
  - Are any engagement numbers still visible? (missed stats)
  - Was anything hidden that shouldn't have been, such as titles, controls or descriptions? (false positives)

The run fails if either check finds a problem.

### 3. User reports

The monitor sees only the layouts its own test runs are given. Users see many more, so the extension also accepts breakage reports directly.

The extension popup has a **Report a problem** button with two options:

- **I can see a number**, for a missed stat.
- **Something is missing**, for a false positive.

A report contains:

- the page URL
- a DOM snapshot and a screenshot with the extension on
- a DOM snapshot with the extension's hiding removed
- the current rules version and layout fingerprint (see [Status in the extension](#6-status-in-the-extension))

A report doesn't include a screenshot with the extension off, because taking one would show the user the numbers they chose to hide.

Before anything is sent, the user sees a preview of the report and can crop out or leave out parts of it. Reports go into the same queue as monitor failures. They're grouped by layout fingerprint, so a single breakage reported by many users starts only one repair.

### 4. The repair agent

When the monitor fails or a user reports a breakage, a repair agent receives:

| | With extension | Without extension |
|---|---|---|
| DOM snapshot | ✓ | ✓ |
| Screenshot | ✓ | ✓ (monitor runs only) |
| Current rules config | ✓ | |

With and without the extension, the agent can compare what the page is supposed to look like and what the extension actually changed. The agent then:

1. Proposes new or updated selectors.
2. Re-runs the Playwright checks against its fix. For a user report, it checks the fix against the reported DOM snapshot.
3. Opens a pull request that includes before-and-after screenshots and links any user reports it fixes.

### 5. Human review

The agent never merges its own changes. A maintainer reviews each PR and merges the updated config.

### 6. Status in the extension

The project publishes a **status feed** that the extension reads, and the popup shows its contents:

- **Known breakages:** open problems and whether a fix is in progress, so users know the issue has already been reported.
- **Layout variants:** the YouTube layouts the project has seen, including A/B-test variants, with whether each one is fully covered.
- **Your layout:** the variant the current page matches, if any.

To work out which variant a user is seeing, the extension computes a **layout fingerprint**, a signature built from the structure of the page. YouTube's page config also lists which experiment flags are active for the session, and these can be included in the fingerprint. When the popup shows an unrecognized fingerprint, the user is probably in a new experiment. In that case the popup suggests filing a report, even if nothing looks broken.

## Evaluation

### Regression archive

DOM snapshots are archived on every run. Over time this builds a regression suite of real YouTube layout changes. Every rules update is tested against the whole suite, so a fix for one layout doesn't break another.

### Redesign replay

To measure how well the repair agent works, past page versions (taken from the archive or the [Wayback Machine](https://web.archive.org/)) are replayed as simulated breakages. The agent tries to repair each one, and the results show how often it succeeds on the first try.

### Metrics

| Metric | Meaning |
|---|---|
| **Recall** | Share of engagement stats that are actually hidden |
| **False positives** | Elements hidden that should have stayed visible |
| **Repair success rate** | Share of breakages the agent fixes correctly, with **cost per repair** |

## Challenges

- **A/B testing.** Different users get different layouts, and a single monitor run sees only one variant. Selectors alone won't cover every variant, which is why the heuristic text fallback matters. User reports and layout fingerprints help find variants that the monitor never sees.
- **Privacy of user reports.** A logged-in YouTube page includes the user's name, avatar, recommendations and watch history. Reports must be opt-in, previewed before sending and scrubbed of personal information. They also can't go straight into a public GitHub issue.
- **Report quality.** Reports can be mistaken, duplicated or deliberately misleading. The repair agent must confirm a problem against the reported snapshot before it proposes a fix, and a human still reviews every PR.
- **Flaky runs.** Slow page loads, consent dialogs, ads and network failures can make the monitor fail when nothing is actually broken. A failure needs to be confirmed before the repair agent runs, so the project doesn't open PRs for problems that don't exist.
