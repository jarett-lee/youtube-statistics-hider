// Builds the metrics line for one workflow run, for metrics.jsonl on the
// metrics branch. Prints a single line of JSON; the workflow passes it to the
// log job as a job output.
//
//   node metrics/line.mjs monitor <monitor-output dir>
//   node metrics/line.mjs repair <repair-output dir> [PR number]
//   node metrics/line.mjs verify <monitor-output dir> <PR number>
//
// Run context comes from GitHub Actions' environment (GITHUB_RUN_ID and so on).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const round = (usd) => Math.round((usd ?? 0) * 10000) / 10000;

function context() {
  const e = process.env;
  return {
    time: new Date().toISOString(),
    run_id: Number(e.GITHUB_RUN_ID) || null,
    run_attempt: Number(e.GITHUB_RUN_ATTEMPT) || 1,
    event: e.GITHUB_EVENT_NAME ?? null,
    ref: e.GITHUB_REF_NAME ?? null,
    sha: e.GITHUB_SHA ?? null,
  };
}

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);

/** Each page's final result, from the last attempt. */
export function pagesOf(report) {
  return report.results.map((r) => {
    const last = r.attempts.at(-1);
    return {
      name: r.name,
      status: r.status,
      vision: last.vision?.status ?? "not run",
      visible_stats: last.vision?.visible_stats?.length ?? 0,
      wrongly_hidden: last.vision?.wrongly_hidden?.length ?? 0,
    };
  });
}

/** Estimated cost of every vision check in the report, all attempts. */
export function visionCostOf(report) {
  return round(
    report.results.flatMap((r) => r.attempts).reduce((sum, a) => sum + (a.vision?.usage?.estimated_cost_usd ?? 0), 0),
  );
}

export function monitorLine(report, ctx) {
  const pages = pagesOf(report);
  return {
    type: "monitor",
    ...ctx,
    vision: pages.some((p) => p.vision === "pass" || p.vision === "fail"),
    pages,
    vision_cost_usd: visionCostOf(report),
  };
}

export function repairLine(result, pr, ctx) {
  // No result means the agent crashed or couldn't start (for example a Claude
  // API authentication failure): an infrastructure error, not a failed repair.
  if (!result) return { type: "repair", ...ctx, error: true };
  return {
    type: "repair",
    ...ctx,
    pr: pr ?? null,
    title: result.title ?? null,
    verified: result.verified,
    changed: result.changed_files.length > 0,
    stopped: result.stopped,
    failed_pages: result.failed_pages,
    cost_usd: result.estimated_cost_usd,
    agent_cost_usd: result.agent_cost_usd ?? null,
    vision_cost_usd: result.vision_cost_usd ?? null,
  };
}

export function verifyLine(report, pr, verified, ctx) {
  return { type: "verify", ...ctx, pr, verified, pages: pagesOf(report), vision_cost_usd: visionCostOf(report) };
}

// Run as a command (not imported by the backfill or report scripts).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, dir, pr] = process.argv.slice(2);
  const ctx = context();
  let line;
  if (kind === "monitor") {
    const report = readJson(path.join(dir, "report.json"));
    if (!report) process.exit(0); // the monitor crashed before writing results: nothing to record
    line = monitorLine(report, ctx);
  } else if (kind === "repair") {
    line = repairLine(readJson(path.join(dir, "result.json")), pr ? Number(pr) : null, ctx);
  } else if (kind === "verify") {
    const report = readJson(path.join(dir, "report.json"));
    if (!report) process.exit(0);
    const { verificationProblems } = await import("../repair/verification.mjs");
    line = verifyLine(report, Number(pr), verificationProblems(report).length === 0, ctx);
  } else {
    console.error("usage: node metrics/line.mjs monitor|repair|verify <dir> [PR number]");
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(line));
}
