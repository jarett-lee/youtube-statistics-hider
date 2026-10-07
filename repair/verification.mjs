// What "verified" means for a repair, shared by the repair agent's final check
// and the Verify repair PR workflow: no page fails, the vision check passed on
// every page that passed (so nothing that should stay visible was hidden), and
// every page in `mustPass` passed.

export const visionStatus = (result) => result.attempts.at(-1).vision?.status ?? "not run";

/** Returns the reasons a monitor report doesn't verify a fix; empty if verified. */
export function verificationProblems(report, mustPass = []) {
  const problems = [];
  for (const r of report.results) {
    if (r.status === "fail") problems.push(`${r.name}: ${r.attempts.at(-1).reason}`);
    else if (r.status === "pass" && visionStatus(r) !== "pass") {
      problems.push(`${r.name}: vision check ${visionStatus(r)}`);
    }
  }
  for (const page of mustPass) {
    const r = report.results.find((x) => x.name === page);
    if (r?.status !== "pass" && r?.status !== "fail") problems.push(`${page}: ${r ? r.status : "not checked"}`);
  }
  return problems;
}

/** Markdown table of each page's result and vision check. */
export function resultsTable(report) {
  return [
    "| Page | Result | Vision check |",
    "|---|---|---|",
    ...report.results.map((r) => `| ${r.name} | ${r.status} | ${visionStatus(r)} |`),
  ].join("\n");
}
