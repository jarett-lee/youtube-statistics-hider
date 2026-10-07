// Fails when the monitor has stopped checking a page: the page was
// inconclusive (a bot check, a consent page or a page that didn't load) in
// each of the last few monitor runs on the default branch. Inconclusive runs
// pass, so without this a blocked monitor would look the same as a healthy one.
// Failing makes GitHub email the maintainer.
//
//   node metrics/blocked.mjs <metrics.jsonl> [runs in a row, default 3]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLog } from "./report.mjs";

/** Pages that were inconclusive in each of the last `streak` monitor runs on `branch`. */
export function blockedPages(lines, streak = 3, branch = "main") {
  const runs = lines.filter((l) => l.type === "monitor" && l.ref === branch).slice(-streak);
  if (runs.length < streak) return [];
  const pages = new Set(runs.flatMap((r) => r.pages.map((p) => p.name)));
  return [...pages].filter((name) =>
    runs.every((r) => r.pages.find((p) => p.name === name)?.status === "inconclusive"),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const streak = Number(process.argv[3] || 3);
  const blocked = blockedPages(parseLog(fs.readFileSync(process.argv[2], "utf8")), streak);
  if (!blocked.length) {
    console.log(`No page was inconclusive in each of the last ${streak} monitor runs.`);
    process.exit(0);
  }
  const message = `The monitor couldn't check ${blocked.join(", ")} in any of the last ${streak} runs: YouTube showed a bot check or consent page, or the page didn't load. Until that changes, breakages on ${blocked.length === 1 ? "that page" : "those pages"} go unnoticed.`;
  console.log(`::error title=Monitor blocked::${message}`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Monitor blocked\n\n${message}\n`);
  process.exit(1);
}
