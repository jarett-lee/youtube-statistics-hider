# Metrics

How the YouTube Statistics Hider experiment is going, from 43 logged workflow runs (2026-10-06 to 2026-10-12). Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices. 6 of the runs tested a deliberately broken commit (a planted fault) and count only in the planted-fault rows.

| Metric | Value | Detail |
|---|---|---|
| Health | 83% of runs | 25 of 30 monitor runs on `main` had no failing page |
| False positives | 0 found | in 0 of 3 vision runs |
| Repair success | 100% verified | 3 repair PRs: 2 verified on the first try, 1 after re-checking, 3 merged. 3 repairs failed to start (setup errors) |
| Cost per repair | $0.26 average | $0.77 over 3 repairs (estimate) |
| Cost per vision test | $0.17 average | $0.68 over 4 vision tests (estimate) |
| Planted faults caught | 2 of 2 | the vision check flagged 2 of 2 vision runs on a planted fault |
| Planted faults repaired | 2 of 2 | 2 repair PRs, 2 verified. $1.31 spent on planted-fault runs (estimate) |
