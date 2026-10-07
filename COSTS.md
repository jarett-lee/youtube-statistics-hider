# Costs

What it costs to keep the YouTube Statistics Hider running. The only paid part is the Claude API, used by the vision check and the repair agent; everything on GitHub is free for a public repository.

## What it spends

| What | When | Cost |
|---|---|---|
| DOM text scan, twice a day and on every push | Every run | Free (GitHub Actions on a public repository) |
| Metrics log, screenshots and run artifacts | Every run | Free |
| Vision check | Weekly, on Mondays | About $0.16–0.20 a run, so under $1 a month |
| Repair agent | Only when a page fails | About $0.16–0.44 each so far, capped at about $3 a repair |
| Verify repair PR | Only when the maintainer starts it | About $0.16 a run |

In a month where nothing breaks, the total is **under $1**. Each YouTube change that needs a repair adds a few tens of cents. The running totals are in [METRICS.md](https://github.com/jarett-lee/youtube-statistics-hider/blob/metrics/METRICS.md) (cost per repair and per vision test). All figures are estimates from list prices; the Claude Console has the actual spend.

## Limits

- **$10 a month:** the Claude API workspace the project uses, Extension-Workspace, has a monthly spend limit of $10. If it's ever reached, the vision check and repairs stop working until the next month, while the free DOM text scan keeps running.
- **About $3 a repair:** the repair agent stops when it reaches that, and its fix opens as a draft for the maintainer to finish.
- **One repair at a time:** while a repair pull request is open, later failures don't start another repair.
- **Weekly vision check:** the vision check runs once a week rather than on every run, which keeps its cost under $1 a month.

## What was left out to keep costs down

The project is a finished proof of concept, and its scope is fixed. These would each need a new page in the monitor, and every page the vision check looks at adds to the cost of every weekly run and of every repair, so they aren't covered:

- like counts on Shorts ([#8](https://github.com/jarett-lee/youtube-statistics-hider/issues/8))
- "hyped" ranking badges ([#1](https://github.com/jarett-lee/youtube-statistics-hider/issues/1))
- YouTube in languages other than English ([#5](https://github.com/jarett-lee/youtube-statistics-hider/issues/5))
- live videos
