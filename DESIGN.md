# Design

The technical design of the YouTube Statistics Hider: how its parts work, how to run them, and how the project will be evaluated. For the process around them, including who decides what, see [WORKFLOW.md](WORKFLOW.md). Parts marked **(planned)** aren't built yet.

## Components

### 1. The extension

The extension hides elements matched by CSS rules in [src/hide.css](src/hide.css), injected before the page renders so stats never flash on screen. Watch-page rules are scoped through an attribute that [src/content.js](src/content.js) keeps up to date as YouTube navigates between pages without reloading. For stats with no class or attribute of their own, `content.js` also matches elements by their text (for example "1,234 views") and marks them for hiding.

It currently hides view counts on every page, and the like count and the channel's subscriber count on the watch page.

**(planned)**

- **Remote rules:** the rules are kept separate from the extension code and fetched from the project, so a fix doesn't need a new extension release.
- **Heuristic fallback:** a general scan of visible text for stat-like patterns (such as `1.2M views` or `34K likes`), to catch numbers that no rule covers yet, including those in A/B-test layouts.

### 2. The monitor

GitHub Actions loads YouTube in Playwright with the extension installed and checks that no stats are left visible, using a DOM text scan and, on some runs, a vision check. See [Monitor](#monitor) below.

### 3. User reports (planned)

The monitor sees only the layouts its own test runs are given. Users see many more, so the extension also accepts breakage reports directly.

The extension popup has a **Report a problem** button with two options:

- **I can see a number**, for a missed stat.
- **Something is missing**, for a false positive.

A report contains:

- the page URL
- a DOM snapshot and a screenshot with the extension on
- a DOM snapshot with the extension's hiding removed
- the current rules version and layout fingerprint (see [Status in the extension](#6-status-in-the-extension-planned))

A report doesn't include a screenshot with the extension off, because taking one would show the user the numbers they chose to hide.

Before anything is sent, the user sees a preview of the report and can crop out or leave out parts of it. Reports go into the same queue as monitor failures. They're grouped by layout fingerprint, so a single breakage reported by many users starts only one repair.

### 4. The repair agent

When the monitor fails (or, once user reports exist, a user reports a breakage), a repair agent receives:

| | With extension | Without extension |
|---|---|---|
| DOM snapshot | ✓ | ✓ |
| Screenshot | ✓ | ✓ (monitor runs only) |
| Current rules | ✓ | |

With and without the extension, the agent can compare what the page is supposed to look like and what the extension actually changed. It then proposes new or updated rules, re-runs the monitor against its fix, and the workflow opens a pull request with before-and-after screenshots. See [Repair agent](#repair-agent) below.

### 5. Human approval

The agent never merges its own changes. The maintainer approves each PR, or refines it first. See [WORKFLOW.md](WORKFLOW.md).

### 6. Status in the extension (planned)

The project publishes a **status feed** that the extension reads, and the popup shows its contents:

- **Known breakages:** open problems and whether a fix is in progress, so users know the issue has already been reported.
- **Layout variants:** the YouTube layouts the project has seen, including A/B-test variants, with whether each one is fully covered.
- **Your layout:** the variant the current page matches, if any.

To work out which variant a user is seeing, the extension computes a **layout fingerprint**, a signature built from the structure of the page. YouTube's page config also lists which experiment flags are active for the session, and these can be included in the fingerprint. When the popup shows an unrecognized fingerprint, the user is probably in a new experiment. In that case the popup suggests filing a report, even if nothing looks broken.

## Monitor

The monitor ([monitor/run.mjs](monitor/run.mjs)) loads a set of YouTube pages in Playwright's Chromium and checks that no engagement stats are left visible. Each page is loaded twice: once with the extension and once without it, for comparison. Two checks run on every page:

- **DOM text scan:** looks for visible text that looks like a stat, such as "1.2M views" or a bare "19K".
- **Vision check:** Claude compares screenshots with and without the extension and reports stats that are still visible and content that was hidden by mistake. It needs Claude API credentials and is skipped without them.

What counts as a stat to hide, and what must stay visible, is defined in [monitor/scope.mjs](monitor/scope.mjs). Update it when the extension's scope changes.

The monitor runs in GitHub Actions:

- **Twice a day**, on pushes that change the extension, the monitor or the repair agent, and on manual runs, with the DOM text scan only ([monitor.yml](.github/workflows/monitor.yml)).
- **Once a week** (Mondays), with the vision check as well, to limit API costs ([vision-weekly.yml](.github/workflows/vision-weekly.yml), which calls monitor.yml with the vision check turned on). To run the vision check on demand, start the workflow from the Actions tab and tick **Run the vision check**.

Because most runs skip the vision check, problems only it can catch, such as content hidden by mistake, can take up to a week to show up.

The jobs run inside Playwright's Docker image (`mcr.microsoft.com/playwright`), which comes with Chromium and Node.js installed, so no time is spent installing them. The image's tag must match the `playwright` version in `package.json`.

To run it locally (requires Node.js 22 or later; CI uses 24):

```sh
npm install
npx playwright install chromium
ant auth login   # optional, for the vision check (Anthropic CLI)
npm run monitor
```

Each page gets one of three results:

- **pass:** neither check found a problem.
- **fail:** a check found a problem, or the extension didn't load. A page that fails is loaded a second time before the failure counts.
- **inconclusive:** YouTube showed a bot check or consent page instead of content, or the page didn't load. This doesn't fail the run.

Screenshots, DOM snapshots and a summary of each run are saved to `monitor-output/`. In GitHub Actions, the summary appears on the run's page.

### Run artifacts

In GitHub Actions, the contents of `monitor-output/` are uploaded as an artifact named `monitor-output-<run id>`. To get it, open the run from the **Actions** tab and download it from the **Artifacts** section at the bottom of the page. It downloads as a zip with one folder per page and one subfolder per attempt:

```
monitor-output/
  report.json              results for every page and attempt, including each problem found
  summary.md               the same tables shown on the run's page
  watch/
    attempt-1/
      result.json          result for this attempt, including the vision check's findings and cost
      with-extension/
        dom.html           DOM snapshot of the rendered page
        screenshot.png     full-page screenshot
        view-1.png         viewport screenshots the vision check reads
        view-2.png
      without-extension/   the same files for the page loaded without the extension
```

- **Retention:** artifacts are deleted after 30 days, set by `retention-days` in the workflow. The run page, its summary and its logs stay after the artifact expires. You can delete an artifact early from the run page.
- **Size:** a run where every page passes is about 30 MB compressed. Failing pages are loaded twice, so failing runs are larger.
- **Storage cost:** artifact storage is free for public repositories. In a private repository it counts toward the account's Actions storage quota (500 MB on the free plan), so retention would need to be much shorter.
- **Access:** anyone who can see the repository and is signed in to GitHub can download artifacts.

Artifacts are for debugging recent runs. The long-term archive of DOM snapshots described under [Regression archive](#regression-archive-planned) needs separate, permanent storage.

### Configuration

- `MONITOR_EXTENSION_DIR` loads a different copy of the extension. It defaults to `src`.
- `MONITOR_OUTPUT_DIR` changes the output folder. It defaults to `monitor-output`.
- `MONITOR_PAGES` checks only some pages, for example `MONITOR_PAGES=watch,search`.
- `MONITOR_VISION=0` skips the vision check.

## Repair agent

When a scheduled or manual monitor run on the default branch fails, the workflow's `repair` job starts the repair agent ([repair/agent.mjs](repair/agent.mjs)). Claude reads the failed run's DOM snapshots and screenshots, edits `src/hide.css` or `src/content.js`, and re-runs the monitor to check its fix. The workflow then runs a final monitor check on every page and opens a pull request ([repair/open-pr.mjs](repair/open-pr.mjs)) with the agent's explanation, before-and-after screenshots and the final results.

- **Verified fixes** open as ready-for-review PRs. **Unverified fixes**, where a page still fails or the vision check didn't confirm every page, open as drafts with `[Unverified]` in the title and steps for finishing them. If the agent changes nothing, no PR is opened.
- **Re-verifying a PR:** after updating a draft, or to retry a check that errored, run the **Verify repair PR** workflow ([verify-pr.yml](.github/workflows/verify-pr.yml)) from the Actions tab with the PR's number. It runs the monitor with the vision check against the PR's rules. If every page passes, it marks a draft ready for review, removes `[Unverified]` and the finishing steps, and updates the results; otherwise it comments what still fails. It runs from the default branch, which the Claude API federation rule trusts, and takes only `src/` from the PR.
- **One repair PR at a time:** when pages fail, the monitor job checks for an open PR labeled `auto-repair`. If there is one, the repair job doesn't start at all, so a breakage that's already being fixed doesn't run the agent again on every later run. Merge or close the open repair PR to allow the next repair. If the check itself fails, no repair starts.
- **Screenshots** in PR descriptions are stored on the `repair-screenshots` branch, which has its own history and is never merged.
- **Vision check during repairs:** always on, in the agent's monitor runs and in the final check, because it's the only check for content hidden by mistake. A fix is verified only if the vision check passes on every page. Each monitor run is a separate process that does its own token exchange, and GitHub identity tokens can be exchanged only once (`jti_reused`), so the agent fetches a fresh token before and after each run.
- **Limits:** the agent stops after 20 turns, 4 monitor runs or an estimated $3 of API usage, whichever comes first. The cost counts the agent itself and the vision checks in the monitor runs it starts; the final check can add a little on top. If the agent stops before the fix passes, the PR opens as a draft. Change these with `REPAIR_MAX_ITERATIONS`, `REPAIR_MAX_MONITOR_RUNS` and `REPAIR_MAX_COST_USD`.
- **What the agent can do:** it works only through its own tools. It can read the evidence, the extension and its own monitor runs, view screenshots, edit `src/hide.css` and `src/content.js`, and run the monitor. It has no shell, network or git access, and never sees the GitHub token or the Claude API credentials. Because DOM snapshots contain text written by YouTube users, review every change to `src/content.js` with particular care.

### Setup

1. **Give the workflow access to the Claude API** (for the vision check and the repair agent) with Workload Identity Federation. No long-lived key is stored in GitHub: each job exchanges a short-lived GitHub identity token for a Claude API token. See Anthropic's [GitHub Actions guide](https://platform.claude.com/docs/en/manage-claude/wif-providers/github-actions).
   1. In the Claude Console, open **Settings** → **Workload identity** → **Connect workload** → **GitHub Actions**. Create a federation rule that matches only this repository's default branch: audience `https://api.anthropic.com`, `repository_owner` under `claims`, and a `subject_prefix` equal to the subject of the repo's GitHub identity tokens. Scheduled runs, manual runs and pushes on the default branch all use that subject. GitHub's subjects can include the numeric IDs of the owner and repo (`repo:<owner>@<owner id>/<repo>@<repo id>:ref:refs/heads/<branch>`), not just the names shown in Anthropic's guide. Get the exact subject with:

      ```sh
      gh api repos/<owner>/<repo> --jq '"repo:\(.owner.login)@\(.owner.id)/\(.name)@\(.id):ref:refs/heads/\(.default_branch)"'
      ```

      If the token exchange fails with reason `match_subject_prefix`, the Console's authentication history (**Settings** → **Workload identity**) shows the subject the token actually had.

      The service account must be a member of the rule's workspace. It's automatically a member of the organization's default workspace; for any other workspace, add it as a member, or the exchange fails with reason `sa_not_in_workspace`.
   2. In the GitHub repo, open **Settings** → **Secrets and variables** → **Actions**, switch to the **Variables** tab (not Secrets), and add `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID` and `ANTHROPIC_SERVICE_ACCOUNT_ID`. Add `ANTHROPIC_WORKSPACE_ID` only if the rule covers more than one workspace. They're identifiers, not secrets: without a GitHub identity token from this repo they grant nothing. The workflow reads them as `vars.*`, so they must be variables; saved as secrets, the workflow wouldn't find them.

   [.github/anthropic-auth.sh](.github/anthropic-auth.sh) does the token exchange in each job.
2. **Allow the workflow to open pull requests:** **Settings** → **Actions** → **General** → **Workflow permissions** → tick **Allow GitHub Actions to create and approve pull requests**. Leave the default permissions set to read: each job asks for only the permissions it needs.

To run the agent locally against a failed run's output (it edits `src/` in place, and needs Claude API credentials, for example from `ant auth login`):

```sh
node repair/agent.mjs monitor-output
```

Results go to `repair-output/`: `result.json` (whether the fix was verified, cost and token usage), `summary.md` (the agent's report) and the monitor runs it made.

## Evaluation

### Metrics

| Metric | Meaning |
|---|---|
| **Recall** | Share of engagement stats that are actually hidden |
| **False positives** | Elements hidden that should have stayed visible |
| **Repair success rate** | Share of breakages the agent fixes correctly, with **cost per repair** |

These are the main result of the experiment. They aren't collected yet: the raw data is in run artifacts and repair PRs, but nothing gathers it. See [WORKFLOW.md](WORKFLOW.md#gaps-found-by-this-analysis).

### Regression archive (planned)

DOM snapshots are archived on every run. Over time this builds a regression suite of real YouTube layout changes. Every rules update is tested against the whole suite, so a fix for one layout doesn't break another.

### Redesign replay (planned)

To measure how well the repair agent works, past page versions (taken from the archive or the [Wayback Machine](https://web.archive.org/)) are replayed as simulated breakages. The agent tries to repair each one, and the results show how often it succeeds on the first try.

## Challenges

- **A/B testing.** Different users get different layouts, and a single monitor run sees only one variant. Selectors alone won't cover every variant, which is why matching by text matters. User reports and layout fingerprints (planned) would help find variants that the monitor never sees.
- **Language.** Several rules find a stat by its English wording: aria-labels such as "19 thousand views", and text such as "1,234 views". With YouTube in another language those stats stay visible, and the monitor can't notice, because it only loads pages in English. See [issue #5](https://github.com/jarett-lee/youtube-statistics-hider/issues/5).
- **Privacy of user reports.** A logged-in YouTube page includes the user's name, avatar, recommendations and watch history. Reports must be opt-in, previewed before sending and scrubbed of personal information. They also can't go straight into a public GitHub issue.
- **Report quality.** Reports can be mistaken, duplicated or deliberately misleading. The repair agent must confirm a problem against the reported snapshot before it proposes a fix, and the maintainer still approves every PR.
- **Flaky runs.** Slow page loads, consent dialogs, ads and network failures can make the monitor fail when nothing is actually broken. Pages that fail are loaded a second time, and bot checks and consent pages count as inconclusive, so the project doesn't open PRs for problems that don't exist.
