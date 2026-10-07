# Manual testing

The workflow paths (see [WORKFLOW.md](WORKFLOW.md)) and whether each has been tested end to end on GitHub. Update a row when you test it, with the run as evidence.

✅ passed · ⚠️ passed on older code, test again · ⬜ not tested yet

## Monitor

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Schedule (twice daily) > DOM text scan > every page passes | ⚠️ | [run 37607049911](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37607049911) | Ran before the container, the repair job and the vision check existed. The next scheduled run tests it again |
| 2 | Push to `src/`, `monitor/` or `repair/` > DOM text scan > every page passes | ✅ 2026-10-07 | [run 37668493265](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37668493265) | First run in the Playwright container |
| 3 | Weekly schedule (`vision-weekly.yml`) > DOM text scan + vision check > every page passes | ⬜ | | First run is next Monday. Also the first test of the vision check in CI |
| 4 | Manual run with **Run the vision check** ticked > every page passes | ⬜ | | Quicker way to test the vision check in CI than waiting for Monday |
| 5 | Any run > YouTube shows a bot check or consent page > page inconclusive, run passes | ⬜ | | Can't be triggered on purpose; record it when it happens |

## Repair

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 6 | Push > DOM text scan > page fails > no repair PR open > repair job > verified > pull request | ⚠️ | [run 37671786939](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37671786939), [PR #4](https://github.com/jarett-lee/youtube-statistics-hider/pull/4) | Passed on attempt 4, after fixing the federation setup. Ran before repairs always used the vision check, so test again |
| 7 | Manual > DOM text scan > page fails > repair PR already open > repair job doesn't start | ✅ 2026-10-07 | [run 37677463808](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37677463808) | The check found PR #4 |
| 8 | Repair > fix not verified > draft pull request marked `[Unverified]` | ⬜ | | |
| 9 | Repair > agent makes no changes > no pull request | ⬜ | | |
| 10 | Repair > agent hits a limit (turns, monitor runs or $3) > stops, draft pull request | ⬜ | | Lower `REPAIR_MAX_COST_USD` to trigger it |
| 11 | Repair > Claude API authentication fails > repair agent step fails, no pull request | ✅ 2026-10-07 | [run 37671786939](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37671786939), attempts 1–3 | Tested by accident: subject format, then workspace membership |

## After a repair pull request

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 12 | Merge the repair PR > next run passes | ⬜ | | Merging PR #4 tests this |
| 13 | Close the repair PR > next failure starts a new repair | ⬜ | | |
| 14 | Update the repair PR > Verify repair PR > review again > merge | ⬜ | | |
| 15 | Draft repair PR > Verify repair PR > every page passes with the vision check > marked ready for review | ⬜ | | PR #6 can test this, once the vision check works in repairs |
| 16 | Verify repair PR > a page still fails > comment lists the problems, PR stays a draft | ⬜ | | |
