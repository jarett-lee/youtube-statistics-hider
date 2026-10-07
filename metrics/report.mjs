// Turns metrics.jsonl into the short table in METRICS.md.
//
//   node metrics/report.mjs <metrics.jsonl>   (prints Markdown)
//
// With GH_TOKEN and GITHUB_REPOSITORY set, looks up whether each repair PR was
// merged; otherwise that row shows as unknown.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const usd = (n) => `$${n.toFixed(2)}`;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Builds METRICS.md from parsed log lines. `merged` maps PR number to true/false (or is null if unknown). */
export function buildReport(lines, merged = null, branch = "main") {
  // 1. Health: monitor runs on the default branch where no page failed. Runs
  //    where every page was inconclusive (YouTube blocked the runner) say
  //    nothing about the extension, so they don't count either way.
  const runs = lines.filter((l) => l.type === "monitor" && l.ref === branch && l.pages.some((p) => p.status !== "inconclusive"));
  const broken = runs.filter((l) => l.pages.some((p) => p.status === "fail"));

  // 2. False positives: the vision check's wrongly_hidden findings.
  const visionRuns = runs.filter((l) => l.vision);
  const fpFindings = visionRuns.reduce((sum, l) => sum + l.pages.reduce((s, p) => s + p.wrongly_hidden, 0), 0);
  const fpRuns = visionRuns.filter((l) => l.pages.some((p) => p.wrongly_hidden > 0));

  // 3. Repair success. Repairs that never got going (an infrastructure error,
  //    such as a Claude API authentication failure) are counted separately.
  const repairs = lines.filter((l) => l.type === "repair" && !l.error);
  const errors = lines.filter((l) => l.type === "repair" && l.error);
  const withPr = repairs.filter((r) => r.pr);
  const firstTry = withPr.filter((r) => r.verified);
  const verifiedLater = withPr.filter(
    (r) => !r.verified && lines.some((l) => l.type === "verify" && l.pr === r.pr && l.verified),
  );
  const mergedCount = merged ? withPr.filter((r) => merged[r.pr]).length : null;

  // 4. Cost per repair (the agent plus the vision checks in its monitor runs).
  const repairCosts = repairs.map((r) => r.cost_usd ?? 0);

  // 5. Cost per vision test: monitor runs with the vision check, and Verify repair PR runs.
  const visionTests = [...visionRuns, ...lines.filter((l) => l.type === "verify")];
  const visionCosts = visionTests.map((l) => l.vision_cost_usd ?? 0);

  const rows = [
    ["Health", `${pct(runs.length - broken.length, runs.length)} of runs`, `${runs.length - broken.length} of ${runs.length} monitor runs on \`${branch}\` had no failing page`],
    ["False positives", `${fpFindings} found`, `in ${fpRuns.length} of ${visionRuns.length} vision runs`],
    [
      "Repair success",
      `${pct(firstTry.length + verifiedLater.length, withPr.length)} verified`,
      `${withPr.length} repair PRs: ${firstTry.length} verified on the first try, ${verifiedLater.length} after re-checking` +
        (mergedCount === null ? "" : `, ${mergedCount} merged`) +
        (repairs.length > withPr.length ? `. ${repairs.length - withPr.length} repairs made no change` : "") +
        (errors.length ? `. ${errors.length} repairs failed to start (setup errors)` : ""),
    ],
    ["Cost per repair", repairs.length ? `${usd(avg(repairCosts))} average` : "–", `${usd(repairCosts.reduce((a, b) => a + b, 0))} over ${repairs.length} repairs (estimate)`],
    ["Cost per vision test", visionTests.length ? `${usd(avg(visionCosts))} average` : "–", `${usd(visionCosts.reduce((a, b) => a + b, 0))} over ${visionTests.length} vision tests (estimate)`],
  ];

  const times = lines.map((l) => l.time).filter(Boolean).sort();
  return [
    "# Metrics",
    "",
    `How the YouTube Statistics Hider experiment is going, from ${lines.length} logged workflow runs${times.length ? ` (${times[0].slice(0, 10)} to ${times.at(-1).slice(0, 10)})` : ""}. Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices.`,
    "",
    "| Metric | Value | Detail |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
    "",
  ].join("\n");
}

export function parseLog(text) {
  return text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

/** Looks up whether each repair PR in the log was merged. Returns null if it can't. */
export async function mergedStates(lines) {
  const { GH_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!GH_TOKEN || !GITHUB_REPOSITORY) return null;
  const { github } = await import("../repair/github.mjs");
  const states = {};
  for (const pr of new Set(lines.filter((l) => l.type === "repair" && l.pr).map((l) => l.pr))) {
    const data = await github("GET", `/pulls/${pr}`, null, { allow: [404] });
    states[pr] = Boolean(data?.merged_at);
  }
  return states;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lines = parseLog(fs.readFileSync(process.argv[2], "utf8"));
  process.stdout.write(buildReport(lines, await mergedStates(lines).catch(() => null)));
}
