// Opens a pull request with the repair agent's changes. Runs in GitHub Actions
// after repair/agent.mjs; it uses git and the GitHub API and no model calls.
//
//   node repair/open-pr.mjs <failed monitor-output dir>
//
// Before-and-after screenshots are pushed to the repair-screenshots branch
// (its own history, never merged) and shown in the PR description.
//
// Environment: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL,
// BASE_BRANCH, and optionally REPAIR_OUTPUT_DIR (default repair-output).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPAIR_LABEL, github } from "./github.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.resolve(process.env.REPAIR_OUTPUT_DIR || path.join(ROOT, "repair-output"));
const EVIDENCE_DIR = path.resolve(process.argv[2] ?? "");
const { GITHUB_REPOSITORY: REPO, GITHUB_RUN_ID: RUN_ID, BASE_BRANCH } = process.env;
const SERVER = process.env.GITHUB_SERVER_URL || "https://github.com";
const EDITABLE = ["src/hide.css", "src/content.js"];
const SCREENSHOT_BRANCH = "repair-screenshots";

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }).trim();
const git = (...args) => sh("git", args);

function summary(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
}

const lastAttempt = (pageDir) =>
  fs.existsSync(pageDir) ? fs.readdirSync(pageDir).filter((d) => d.startsWith("attempt-")).sort().at(-1) : undefined;

// Copies before/after viewport screenshots for each failed page into dir.
// Returns [{ page, before: [file], after: [file] }] with paths relative to dir.
function collectScreenshots(pages, dir) {
  return pages.map((page) => {
    const entry = { page, before: [], after: [] };
    for (const [kind, base] of [["before", EVIDENCE_DIR], ["after", path.join(OUTPUT_DIR, "after")]]) {
      const attempt = lastAttempt(path.join(base, page));
      for (const n of [1, 2]) {
        const src = attempt && path.join(base, page, attempt, "with-extension", `view-${n}.png`);
        if (!src || !fs.existsSync(src)) continue;
        const rel = `${RUN_ID}/${page}/${kind}-${n}.png`;
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.copyFileSync(src, path.join(dir, rel));
        entry[kind].push(rel);
      }
    }
    return entry;
  });
}

function pushScreenshots(pages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "repair-screenshots-"));
  fs.rmSync(dir, { recursive: true });
  let exists = true;
  try {
    git("fetch", "--depth=1", "origin", `+refs/heads/${SCREENSHOT_BRANCH}:refs/remotes/origin/${SCREENSHOT_BRANCH}`);
  } catch {
    exists = false;
  }
  if (exists) {
    git("worktree", "add", "-B", SCREENSHOT_BRANCH, dir, `origin/${SCREENSHOT_BRANCH}`);
  } else {
    // A branch with no shared history, so screenshots never end up in main.
    git("worktree", "add", "--detach", dir);
    sh("git", ["checkout", "--quiet", "--orphan", SCREENSHOT_BRANCH], { cwd: dir });
    sh("git", ["rm", "-r", "--quiet", "--force", "."], { cwd: dir });
  }

  const shots = collectScreenshots(pages, dir);
  sh("git", ["add", "--all"], { cwd: dir });
  sh("git", ["commit", "--quiet", "-m", `Screenshots for repair run ${RUN_ID}`], { cwd: dir });
  sh("git", ["push", "--quiet", "origin", `${SCREENSHOT_BRANCH}:${SCREENSHOT_BRANCH}`], { cwd: dir });
  git("worktree", "remove", "--force", dir);
  return shots;
}

function prBody(result, agentReport, shots) {
  const runUrl = `${SERVER}/${REPO}/actions/runs/${RUN_ID}`;
  const img = (rel) => `<img src="https://raw.githubusercontent.com/${REPO}/${SCREENSHOT_BRANCH}/${rel}" width="420">`;
  const lines = ["This PR was opened by the repair agent.", ""];
  // A verified fix is the normal case and needs no comment; only flag the exception.
  if (!result.verified) {
    lines.push(
      `⚠️ **Not verified:** the final monitor run didn't pass with the vision check on every page${result.stopped ? `, and the agent stopped early (${result.stopped})` : ""}. This is a draft to finish by hand.`,
      "",
    );
  }
  lines.push(
    agentReport,
    "",
    "## Before and after",
    "",
    "Viewport screenshots with the extension installed. Before is from the failed monitor run, after is from the final check run against this PR's rules.",
  );
  for (const s of shots) {
    lines.push("", `### ${s.page}`, "", "| Before | After |", "|---|---|");
    const rows = Math.max(s.before.length, s.after.length);
    for (let i = 0; i < rows; i++) lines.push(`| ${s.before[i] ? img(s.before[i]) : ""} | ${s.after[i] ? img(s.after[i]) : ""} |`);
  }
  lines.push(
    "",
    "## Final monitor run",
    "",
    "| Page | Result | Vision check |",
    "|---|---|---|",
    ...result.after.map((r) => `| ${r.page} | ${r.status} | ${r.vision ?? ""} |`),
    "",
    `Agent: ${result.model}, ${result.iterations} turn(s), ${result.monitor_runs} monitor run(s), estimated cost $${result.estimated_cost_usd.toFixed(2)}.`,
    "",
    `[Workflow run](${runUrl}) (its artifacts have the full DOM snapshots and screenshots).`,
  );
  return lines.join("\n");
}

async function main() {
  const result = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "result.json"), "utf8"));
  const agentReport = fs.readFileSync(path.join(OUTPUT_DIR, "summary.md"), "utf8");

  if (!result.changed_files.length) {
    summary(`## Repair agent\n\nThe agent made no changes, so no PR was opened.${result.stopped ? ` It stopped early: ${result.stopped}.` : ""}\n\n${agentReport}`);
    return;
  }

  // The agent's tools can only write these files; check anyway before committing.
  const touched = [
    ...git("diff", "--name-only").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
  ].filter(Boolean);
  const unexpected = touched.filter((f) => !EDITABLE.includes(f));
  if (unexpected.length) throw new Error(`Refusing to open a PR: unexpected changed files: ${unexpected.join(", ")}`);

  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
  if (process.env.GH_TOKEN) {
    git("remote", "set-url", "origin", `https://x-access-token:${process.env.GH_TOKEN}@github.com/${REPO}.git`);
  }

  const shots = pushScreenshots(result.failed_pages);

  const branch = `auto-repair/${RUN_ID}`;
  git("checkout", "-b", branch);
  git("add", ...EDITABLE);
  git("commit", "--quiet", "-m", `Repair hiding rules for ${result.failed_pages.join(", ")}\n\nProposed by the repair agent in run ${RUN_ID}.`);
  git("push", "--quiet", "origin", branch);

  const bodyFile = path.join(OUTPUT_DIR, "pr-body.md");
  fs.writeFileSync(bodyFile, prBody(result, agentReport, shots));
  // 422 means the label already exists.
  await github("POST", "/labels", { name: REPAIR_LABEL, color: "D93F0B", description: "Opened by the repair agent" }, { allow: [422] });
  const pr = await github("POST", "/pulls", {
    title: `${result.verified ? "" : "[Unverified] "}Repair hiding rules for ${result.failed_pages.join(", ")}`,
    head: branch,
    base: BASE_BRANCH,
    body: fs.readFileSync(bodyFile, "utf8"),
    draft: !result.verified,
  });
  await github("POST", `/issues/${pr.number}/labels`, { labels: [REPAIR_LABEL] });
  summary(`## Repair agent\n\nOpened ${result.verified ? "" : "draft "}PR: ${pr.html_url}`);
}

await main();
