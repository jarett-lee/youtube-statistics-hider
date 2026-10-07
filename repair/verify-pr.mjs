// Re-runs verification for a repair PR. Run by the Verify repair PR workflow
// after the monitor has checked every page, with the vision check, against the
// PR's rules.
//
//   node repair/verify-pr.mjs <PR number>
//
// Verified: comments the results, and if the PR is a draft, marks it ready for
// review and removes "[Unverified]" from its title and the warning from its
// description. Not verified: comments what still fails and exits with 1.
//
// Environment: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL,
// and optionally MONITOR_OUTPUT_DIR (default monitor-output).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { github, graphql } from "./github.mjs";
import { resultsTable, verificationProblems } from "./verification.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.resolve(process.env.MONITOR_OUTPUT_DIR || path.join(ROOT, "monitor-output"));
const number = Number(process.argv[2]);
if (!number) throw new Error("usage: node repair/verify-pr.mjs <PR number>");
const runUrl = `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;

function summary(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
}

const report = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, "report.json"), "utf8"));
const problems = verificationProblems(report);
const table = resultsTable(report);

if (problems.length) {
  const body = `Verification didn't pass ([run](${runUrl})):\n\n${problems.map((p) => `- ${p}`).join("\n")}\n\n${table}`;
  await github("POST", `/issues/${number}/comments`, { body });
  summary(`## Verify repair PR #${number}\n\n${body}`);
  process.exit(1);
}

const pr = await github("GET", `/pulls/${number}`);
if (pr.draft) {
  await graphql("mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }", {
    id: pr.node_id,
  });
}
// Drop what only applied while the fix was unverified, and show the new results.
const title = pr.title.replace(/^\[Unverified\]\s*/, "");
const description = (pr.body ?? "")
  .replace(/^⚠️ \*\*Not verified:\*\*.*\n+/m, "")
  .replace(/(## Final monitor run\n\n)(?:\|.*\n?)+/, `$1${table}\n`);
if (title !== pr.title || description !== pr.body) await github("PATCH", `/pulls/${number}`, { title, body: description });

const body = `Verification passed ([run](${runUrl}))${pr.draft ? ", so this PR is now ready for review" : ""}.\n\n${table}`;
await github("POST", `/issues/${number}/comments`, { body });
summary(`## Verify repair PR #${number}\n\n${body}`);
