# Metrics

How the YouTube Statistics Hider experiment is going, from 26 logged workflow runs (2026-10-06 to 2026-10-08). Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices.

| Metric | Value | Detail |
|---|---|---|
| Health | 74% of runs | 14 of 19 monitor runs on `main` had no failing page |
| False positives | 0 found | in 0 of 2 vision runs |
| Repair success | 100% verified | 3 repair PRs: 2 verified on the first try, 1 after re-checking, 3 merged. 3 repairs failed to start (setup errors) |
| Cost per repair | $0.26 average | $0.77 over 3 repairs (estimate) |
| Cost per vision test | $0.17 average | $0.51 over 3 vision tests (estimate) |
