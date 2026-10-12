# Metrics

How the YouTube Statistics Hider experiment is going, from 42 logged workflow runs (2026-10-06 to 2026-10-12). Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices.

| Metric | Value | Detail |
|---|---|---|
| Health | 79% of runs | 26 of 33 monitor runs on `main` had no failing page |
| False positives | 9 found | in 2 of 5 vision runs |
| Repair success | 100% verified | 5 repair PRs: 4 verified on the first try, 1 after re-checking, 3 merged. 3 repairs failed to start (setup errors) |
| Cost per repair | $0.33 average | $1.63 over 5 repairs (estimate) |
| Cost per vision test | $0.19 average | $1.13 over 6 vision tests (estimate) |
