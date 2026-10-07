# Manual testing

The workflow paths (see [WORKFLOW.md](WORKFLOW.md)) and whether each has been tested end to end on GitHub. Update a row when you test it, with the run as evidence.

✅ passed · ⚠️ passed on older code, test again · ⬜ not tested yet

## Monitor

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Schedule (twice daily) > DOM text scan > every page passes | ⚠️ | [run 37607049911](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37607049911) | Ran before the container, the repair job and the vision check existed. The next scheduled run tests it again |
| 2 | Push to `src/`, `monitor/` or `repair/` > DOM text scan > every page passes | ✅ 2026-10-07 | [run 37690102478](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37690102478) | |
| 3 | Weekly schedule (`vision-weekly.yml`) > DOM text scan + vision check > every page passes | ⬜ | | First run is next Monday. Also the first test of the vision check in CI |
| 4 | Manual run with **Run the vision check** ticked > every page passes | ✅ 2026-10-07 | [run 37691869046](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37691869046) | |
| 5 | Any run > YouTube shows a bot check or consent page > page inconclusive, run passes | ⬜ | | Can't be triggered on purpose; record it when it happens |

## Repair

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 6 | Push > DOM text scan > page fails > no repair PR open > repair job > verified > pull request | ✅ 2026-10-07 | [run 37694284530](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37694284530), [PR #7](https://github.com/jarett-lee/youtube-statistics-hider/pull/7) | The repair's vision checks all passed, which confirms the `jti_reused` fix |
| 7 | Manual > DOM text scan > page fails > repair PR already open > repair job doesn't start | ✅ 2026-10-07 | [run 37677463808](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37677463808) | The check found PR #4 |
| 8 | Repair > fix not verified > draft pull request marked `[Unverified]`, with steps to finish it | ⬜ | | |
| 9 | Repair > agent makes no changes > no pull request | ⬜ | | |
| 10 | Repair > agent hits a limit (turns, monitor runs or $3) > stops, draft pull request | ⬜ | | Lower `REPAIR_MAX_COST_USD` to trigger it |
| 11 | Repair > Claude API authentication fails > repair agent step fails, no pull request | ✅ 2026-10-07 | [run 37671786939](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37671786939), attempts 1–3 | Tested by accident: subject format, then workspace membership |

## After a repair pull request

| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 12 | Merge the repair PR > next run passes | ✅ 2026-10-07 | [run 37684539393](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37684539393) | The run started by merging PR #4 |
| 13 | Close the repair PR > next failure starts a new repair | ⬜ | | |
| 14 | Update the repair PR > Verify repair PR > review again > merge | ⬜ | | |
| 15 | Draft repair PR > Verify repair PR > every page passes with the vision check > marked ready for review | ✅ 2026-10-07 | [run 37690445569](https://github.com/jarett-lee/youtube-statistics-hider/actions/runs/37690445569), [PR #6](https://github.com/jarett-lee/youtube-statistics-hider/pull/6) | Also the first vision check passing on every page in CI. PR #6 predates the finishing steps, so removing them is only tested locally so far |
| 16 | Verify repair PR > a page still fails > comment lists the problems, PR stays a draft | ⬜ | | |
