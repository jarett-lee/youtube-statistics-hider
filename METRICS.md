# Metrics

How the YouTube Statistics Hider experiment is going, from 51 logged workflow runs (2026-10-06 to 2026-10-16). Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices. 19 of the runs tested a deliberate breakage and count only in the deliberate-breakage rows.

| Metric | Value | Detail |
|---|---|---|
| Health | 100% of runs | 32 of 32 monitor runs on `main` had no failing page |
| False positives | 0 found | in 0 of 2 vision runs |
| Repair success | – | No real breakage has needed a repair yet |
| Cost per repair | – | No repairs yet |
| Cost per vision check | $0.16 average | $0.33 over 2 vision checks (estimate) |
| Deliberate breakages caught | 5 of 5 | 3 by the vision check, 2 by the DOM text scan |
| Deliberate breakages repaired | 5 of 5 | 5 repair PRs: 4 verified on the first try, 1 after re-checking, 3 merged. 3 repairs failed to start (setup errors). $2.44 spent on these runs (estimate) |
