# Manual testing

The workflow paths (see [WORKFLOW.md](WORKFLOW.md)) and whether each has been tested end to end on GitHub. Update a row when you test it, with the run as evidence.

✅ passed · ⚠️ passed on older code, test again · ⬜ not tested yet

## Monitor

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Schedule (twice daily) > DOM text scan > every page passes | ✅ 2026-10-12 | [run 38240093351](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38240093351) | |
| 2 | Push to `src/`, `monitor/`, or `repair/` > DOM text scan > every page passes | ✅ 2026-10-12 | [run 38307607470](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38307607470) | |
| 3 | Weekly schedule (`vision-weekly.yml`) > DOM text scan + vision check > every page passes | ✅ 2026-10-12 | [run 38296786930](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38296786930) | |
| 4 | Manual run with **Run the vision check** ticked > every page passes | ✅ 2026-10-07 | [run 37691869046](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37691869046) | |
| 5 | Push > a rule hides content it shouldn't > DOM text scan > every page passes | ✅ 2026-10-12 | [run 38304590678](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38304590678), [run 38306422401](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38306422401) | Expected: the DOM text scan only finds stats left visible, so only the vision check catches this. Planted faults (rows 10 and 11) |
| 6 | Any run > YouTube shows a bot check or consent page > page inconclusive, run passes | ⬜ | | Can't be triggered on purpose; record it when it happens |
| 7 | A page is inconclusive in 3 runs in a row > log job fails with "Monitor blocked" > GitHub emails the maintainer | ⬜ | | Tested locally with a sample log; can't be triggered on purpose |
| 8 | Any run > log job appends its lines to `metrics.jsonl` and regenerates METRICS.md | ✅ 2026-10-07 | [run 37701665534](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37701665534) | The 23 runs before it were backfilled locally |

## Repair

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 9 | Push > DOM text scan > page fails > no repair PR open > repair job > verified > pull request | ✅ 2026-10-07 | [run 37694284530](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37694284530), [PR #7](https://github.com/jarett-lee/youtube-statistics-hider/pull/7) | The repair's vision checks all passed, which confirms the `jti_reused` fix |
| 10 | Manual run with the vision check > vision check finds wrongly hidden content > page fails > no repair PR open > repair job > verified > pull request | ✅ 2026-10-12 | [run 38304906591](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38304906591), [PR #11](https://github.com/jarett-lee/youtube-statistics-hider/pull/11) | Planted fault: a rule hiding the watch page's video title. The PR removed exactly that rule. Closed, not merged, and the fault reverted on `main` |
| 11 | Manual run with the vision check > vision check finds a broken layout > page fails > no repair PR open > repair job > verified > pull request | ✅ 2026-10-12 | [run 38306705891](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38306705891), [PR #12](https://github.com/jarett-lee/youtube-statistics-hider/pull/12) | Planted fault: a rule, not for any stat, collapsing the search results. The PR removed exactly that rule. Closed, not merged, and the fault reverted on `main` |
| 12 | Manual > DOM text scan > page fails > repair PR already open > repair job doesn't start | ✅ 2026-10-07 | [run 37677463808](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37677463808) | The check found PR #4 |
| 13 | Repair > fix not verified > draft pull request marked `[Unverified]`, with steps to finish it | ⬜ | | |
| 14 | Repair > agent makes no changes > no pull request | ⬜ | | |
| 15 | Repair > agent hits a limit (turns, monitor runs, or $3) > stops, draft pull request | ⬜ | | Lower `REPAIR_MAX_COST_USD` to trigger it |
| 16 | Repair > Claude API authentication fails > repair agent step fails, no pull request | ✅ 2026-10-07 | [run 37671786939](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37671786939), attempts 1–3 | Tested by accident: subject format, then workspace membership |

## After a repair pull request

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 17 | Merge the repair PR > next run passes | ✅ 2026-10-07 | [run 37684539393](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37684539393) | The run started by merging PR #4 |
| 18 | Close the repair PR > next failure starts a new repair | ✅ 2026-10-12 | [PR #11](https://github.com/jarett-lee/youtube-statistics-hider/pull/11), [run 38306705891](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/38306705891) | After PR #11 was closed, the next failure opened PR #12 |
| 19 | Update the repair PR > Verify repair PR > review again > merge | ⬜ | | |
| 20 | Draft repair PR > Verify repair PR > every page passes with the vision check > marked ready for review | ✅ 2026-10-07 | [run 37690445569](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37690445569), [PR #6](https://github.com/jarett-lee/youtube-statistics-hider/pull/6) | Also the first vision check passing on every page in CI. PR #6 predates the finishing steps, so removing them is only tested locally so far |
| 21 | Verify repair PR > a page still fails > comment lists the problems, PR stays a draft | ⬜ | | |
