// Appends lines to metrics.jsonl on the metrics branch (its own history,
// never merged) and regenerates METRICS.md next to it.
//
//   METRICS_LINES='<json line>\n<json line>' node metrics/append.mjs
//
// Environment: METRICS_LINES; in GitHub Actions also GH_TOKEN and
// GITHUB_REPOSITORY, used to push and to look up whether repair PRs merged.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport, mergedStates, parseLog } from "./report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "metrics";
const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const newLines = (process.env.METRICS_LINES ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
for (const l of newLines) JSON.parse(l); // fail early on a malformed line
if (!newLines.length) {
  console.log("No metrics lines to append.");
  process.exit(0);
}

// In GitHub Actions, push with the job's token. Locally, git's own sign-in is
// used, and the token is never written into the repo's config.
if (process.env.GITHUB_ACTIONS && process.env.GH_TOKEN && process.env.GITHUB_REPOSITORY) {
  git(["remote", "set-url", "origin", `https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.GITHUB_REPOSITORY}.git`]);
}
if (process.env.GITHUB_ACTIONS) {
  git(["config", "user.name", "github-actions[bot]"]);
  git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
}

// Another run may push between our fetch and push; if so, start again from the new branch.
let pushed = false;
for (let attempt = 1; attempt <= 3 && !pushed; attempt++) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-"));
  fs.rmSync(dir, { recursive: true });
  let exists = true;
  try {
    git(["fetch", "--quiet", "origin", `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
  } catch {
    exists = false;
  }
  if (exists) {
    git(["worktree", "add", "--quiet", "--detach", dir, `origin/${BRANCH}`]);
  } else {
    git(["worktree", "add", "--quiet", "--detach", dir]);
    git(["checkout", "--quiet", "--orphan", `metrics-new-${process.pid}`], dir);
    git(["rm", "-r", "--quiet", "--force", "."], dir);
  }
  try {
    const logFile = path.join(dir, "metrics.jsonl");
    const existing = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
    const log = (existing && !existing.endsWith("\n") ? existing + "\n" : existing) + newLines.join("\n") + "\n";
    fs.writeFileSync(logFile, log);
    const lines = parseLog(log);
    fs.writeFileSync(path.join(dir, "METRICS.md"), buildReport(lines, await mergedStates(lines).catch(() => null)));
    git(["add", "metrics.jsonl", "METRICS.md"], dir);
    git(["commit", "--quiet", "-m", `Log ${newLines.length} metrics line(s)`], dir);
    git(["push", "--quiet", "origin", `HEAD:refs/heads/${BRANCH}`], dir);
    console.log(`Appended ${newLines.length} line(s) to ${BRANCH}/metrics.jsonl and updated METRICS.md.`);
    pushed = true;
  } catch (error) {
    if (attempt === 3) throw error;
    console.log(`Push attempt ${attempt} failed, retrying: ${error.message.split("\n")[0]}`);
  } finally {
    git(["worktree", "remove", "--force", dir]);
    if (!exists) git(["branch", "-D", `metrics-new-${process.pid}`]);
  }
}
