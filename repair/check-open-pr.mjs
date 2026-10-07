// Sets the step output `open` to "true" if a repair PR is already open, else
// "false". Used by the monitor job: only one repair PR is open at a time.
// If the check fails, the step fails and `open` stays unset, so no repair starts.

import fs from "node:fs";
import { openRepairPrs } from "./github.mjs";

const prs = await openRepairPrs();
const open = prs.length > 0;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `open=${open}\n`);
if (open && process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `A repair PR is already open (#${prs[0].number}), so no repair was started.\n`,
  );
}
console.log(open ? `Open repair PR: #${prs.map((p) => p.number).join(", #")}` : "No open repair PR.");
