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
  // Runs on a commit that broke the monitor on purpose are marked "test": true
  // in the log by hand. Such a deliberate breakage is either a planted fault (a
  // broken hiding rule) or a stat added to the checks before the extension hid
  // it. These runs test the checks and the repair agent, not how YouTube
  // changes affect the extension, so they're reported in their own rows and
  // left out of the others.
  const real = lines.filter((l) => !l.test);
  const tests = lines.filter((l) => l.test);

  // 1. Health: monitor runs on the default branch where no page failed. Runs
  //    where every page was inconclusive (YouTube blocked the runner) say
  //    nothing about the extension, so they don't count either way.
  const isRun = (l) => l.type === "monitor" && l.ref === branch && l.pages.some((p) => p.status !== "inconclusive");
  const runs = real.filter(isRun);
  const broken = runs.filter((l) => l.pages.some((p) => p.status === "fail"));

  // 2. False positives: the vision check's wrongly_hidden findings.
  const visionRuns = runs.filter((l) => l.vision);
  const fpFindings = visionRuns.reduce((sum, l) => sum + l.pages.reduce((s, p) => s + p.wrongly_hidden, 0), 0);
  const fpRuns = visionRuns.filter((l) => l.pages.some((p) => p.wrongly_hidden > 0));

  // 3. Repair success. Repairs that never got going (an infrastructure error,
  //    such as a Claude API authentication failure) are counted separately.
  const repairStats = (subset) => {
    const repairs = subset.filter((l) => l.type === "repair" && !l.error);
    const errors = subset.filter((l) => l.type === "repair" && l.error);
    const withPr = repairs.filter((r) => r.pr);
    const firstTry = withPr.filter((r) => r.verified);
    const verifiedLater = withPr.filter(
      (r) => !r.verified && lines.some((l) => l.type === "verify" && l.pr === r.pr && l.verified),
    );
    const mergedCount = merged ? withPr.filter((r) => merged[r.pr]).length : null;
    const detail =
      `${withPr.length} repair PRs: ${firstTry.length} verified on the first try, ${verifiedLater.length} after re-checking` +
      (mergedCount === null ? "" : `, ${mergedCount} merged`) +
      (repairs.length > withPr.length ? `. ${repairs.length - withPr.length} repairs made no change` : "") +
      (errors.length ? `. ${errors.length} repairs failed to start (setup errors)` : "");
    return { repairs, withPr, verified: firstTry.length + verifiedLater.length, detail };
  };
  const realRepairs = repairStats(real);

  // Deliberate breakages: did a check catch each one, and did the repair agent
  // fix it? A breakage counts as caught if any run on its commit failed a page,
  // and as caught by the vision check if a vision check on it failed a page.
  const testRuns = tests.filter(isRun);
  const breakages = new Set(testRuns.map((l) => l.sha));
  const caught = new Set(testRuns.filter((l) => l.pages.some((p) => p.status === "fail")).map((l) => l.sha));
  const byVision = new Set(testRuns.filter((l) => l.pages.some((p) => p.vision === "fail")).map((l) => l.sha));
  const testRepairs = repairStats(tests);
  const testCost = tests.reduce((sum, l) => sum + (l.type === "repair" ? (l.cost_usd ?? 0) : (l.vision_cost_usd ?? 0)), 0);

  // 4. Cost per repair (the agent plus the vision checks in its monitor runs).
  const repairCosts = realRepairs.repairs.map((r) => r.cost_usd ?? 0);

  // 5. Cost per vision test: monitor runs with the vision check, and Verify repair PR runs.
  const visionTests = [...visionRuns, ...real.filter((l) => l.type === "verify")];
  const visionCosts = visionTests.map((l) => l.vision_cost_usd ?? 0);

  const rows = [
    ["Health", `${pct(runs.length - broken.length, runs.length)} of runs`, `${runs.length - broken.length} of ${runs.length} monitor runs on \`${branch}\` had no failing page`],
    ["False positives", `${fpFindings} found`, `in ${fpRuns.length} of ${visionRuns.length} vision runs`],
    realRepairs.withPr.length || realRepairs.repairs.length
      ? ["Repair success", `${pct(realRepairs.verified, realRepairs.withPr.length)} verified`, realRepairs.detail]
      : ["Repair success", "–", "No real breakage has needed a repair yet"],
    repairCosts.length
      ? ["Cost per repair", `${usd(avg(repairCosts))} average`, `${usd(repairCosts.reduce((a, b) => a + b, 0))} over ${repairCosts.length} repairs (estimate)`]
      : ["Cost per repair", "–", "No repairs yet"],
    ["Cost per vision test", visionTests.length ? `${usd(avg(visionCosts))} average` : "–", `${usd(visionCosts.reduce((a, b) => a + b, 0))} over ${visionTests.length} vision tests (estimate)`],
  ];
  if (breakages.size) {
    rows.push(
      ["Deliberate breakages caught", `${caught.size} of ${breakages.size}`, `${byVision.size} by the vision check, ${caught.size - byVision.size} by the DOM text scan`],
      [
        "Deliberate breakages repaired",
        `${testRepairs.verified} of ${breakages.size}`,
        `${testRepairs.detail}. ${usd(testCost)} spent on these runs (estimate)`,
      ],
    );
  }

  const times = lines.map((l) => l.time).filter(Boolean).sort();
  return [
    "# Metrics",
    "",
    `How the YouTube Statistics Hider experiment is going, from ${lines.length} logged workflow runs${times.length ? ` (${times[0].slice(0, 10)} to ${times.at(-1).slice(0, 10)})` : ""}. Generated from [metrics.jsonl](metrics.jsonl) after every run; costs are estimates from list prices.` +
      (tests.length ? ` ${tests.length} of the runs tested a deliberate breakage and count only in the deliberate-breakage rows.` : ""),
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
