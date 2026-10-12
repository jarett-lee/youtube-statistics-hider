# Metrics

How the YouTube Statistics Hider experiment is going, from 39 logged workflow runs (2026-10-06 to 2026-10-12). Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices.

| Metric | Value | Detail |
|---|---|---|
| Health | 81% of runs | 25 of 31 monitor runs on `main` had no failing page |
| False positives | 5 found | in 1 of 4 vision runs |
| Repair success | 100% verified | 4 repair PRs: 3 verified on the first try, 1 after re-checking, 3 merged. 3 repairs failed to start (setup errors) |
| Cost per repair | $0.33 average | $1.33 over 4 repairs (estimate) |
| Cost per vision test | $0.18 average | $0.91 over 5 vision tests (estimate) |
