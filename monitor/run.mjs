// Loads YouTube with the extension installed and checks that no engagement
// stats are left visible. See README.md, "The monitor".
//
// Each target page ends in one of three results:
//   pass          no leftover stats found
//   fail          leftover stats found on every attempt, or the extension didn't load
//   inconclusive  YouTube showed a bot check or consent page, or the page didn't load
//
// Exit code: 1 if any target failed, otherwise 0. Inconclusive results don't
// fail the run, because they say nothing about the extension.

import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectBlock, scanForStats } from "./checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_DIR = path.resolve(process.env.MONITOR_EXTENSION_DIR || path.join(ROOT, "src"));
const OUTPUT_DIR = path.resolve(process.env.MONITOR_OUTPUT_DIR || path.join(ROOT, "monitor-output"));
const MAX_ATTEMPTS = 2;
const SETTLE_MS = 4000;

const TARGETS = [
  {
    name: "watch",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ready: "ytd-watch-metadata",
    // The expanded description shows extra stats in some layouts.
    async prepare(page) {
      const expand = page.locator("ytd-watch-metadata #expand");
      if (await expand.isVisible()) await expand.click();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "search",
    url: "https://www.youtube.com/results?search_query=never+gonna+give+you+up",
    ready: "ytd-video-renderer, yt-lockup-view-model",
  },
  {
    name: "hashtag",
    url: "https://www.youtube.com/hashtag/rickastley",
    ready: "ytd-rich-item-renderer",
  },
  {
    name: "channel-videos",
    url: "https://www.youtube.com/@RickAstleyYT/videos",
    ready: "ytd-rich-item-renderer",
  },
];

async function attempt(target, dir) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-stats-hider-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium", // the new headless mode, which supports extensions
    headless: true,
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  const page = await context.newPage();
  const result = { url: target.url };
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 45000 });

    let blocked = await page.evaluate(detectBlock);
    if (!blocked) {
      const ready = await page
        .waitForSelector(target.ready, { state: "attached", timeout: 30000 })
        .then(() => true, () => false);
      await page.waitForTimeout(SETTLE_MS);
      // Bot checks can appear after the first render, for example in the player.
      blocked = await page.evaluate(detectBlock);
      if (!blocked && !ready) blocked = `page content didn't load (no ${target.ready})`;
    }

    result.finalUrl = page.url();
    if (blocked) {
      Object.assign(result, { status: "inconclusive", reason: blocked });
    } else if ((await page.evaluate(() => document.documentElement.dataset.ytStatsHider)) !== "loaded") {
      Object.assign(result, { status: "fail", reason: "extension content script didn't run" });
    } else {
      if (target.prepare) await target.prepare(page);
      // Scroll so lazily loaded parts of the page render, then come back up.
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, -2000);
      await page.waitForTimeout(500);
      result.findings = await page.evaluate(scanForStats);
      Object.assign(
        result,
        result.findings.length
          ? { status: "fail", reason: `${result.findings.length} leftover stat(s)` }
          : { status: "pass" },
      );
    }
  } catch (error) {
    Object.assign(result, { status: "inconclusive", reason: `error: ${error.message.split("\n")[0]}` });
  } finally {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "screenshot.png"), fullPage: true }).catch(() => {});
    await page.content().then((html) => fs.writeFileSync(path.join(dir, "dom.html"), html), () => {});
    fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result, null, 2));
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  return result;
}

// A single failed or blocked load is often a fluke (slow load, A/B variant
// mid-rollout, bot check), so a target gets another attempt before it counts.
async function check(target) {
  const attempts = [];
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const result = await attempt(target, path.join(OUTPUT_DIR, target.name, `attempt-${n}`));
    attempts.push(result);
    console.log(`${target.name} attempt ${n}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    for (const f of result.findings ?? []) console.log(`    [${f.check}] "${f.text}"  at ${f.path}`);
    if (result.status === "pass") break;
  }
  // Fail only if every attempt that reached the page found leftover stats.
  const reached = attempts.filter((a) => a.status !== "inconclusive");
  const status = reached.length === 0 ? "inconclusive" : reached.every((a) => a.status === "fail") ? "fail" : "pass";
  return { name: target.name, status, attempts };
}

function writeSummary(results) {
  const icon = { pass: "✅", fail: "❌", inconclusive: "⚠️" };
  const lines = ["## YouTube Statistics Hider monitor", "", "| Page | Result | Details |", "|---|---|---|"];
  for (const r of results) {
    const last = r.attempts.at(-1);
    lines.push(`| ${r.name} | ${icon[r.status]} ${r.status} | ${r.status === "pass" ? "" : last.reason ?? ""} |`);
  }
  const findings = results.flatMap((r) => (r.attempts.at(-1).findings ?? []).map((f) => ({ page: r.name, ...f })));
  if (findings.length) {
    lines.push("", "### Leftover stats", "", "| Page | Check | Text | Element |", "|---|---|---|---|");
    for (const f of findings) lines.push(`| ${f.page} | ${f.check} | \`${f.text}\` | \`${f.path}\` |`);
  }
  const markdown = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.md"), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const results = [];
for (const target of TARGETS) results.push(await check(target));

fs.writeFileSync(
  path.join(OUTPUT_DIR, "report.json"),
  JSON.stringify({ time: new Date().toISOString(), results }, null, 2),
);
writeSummary(results);

if (process.env.GITHUB_ACTIONS) {
  for (const r of results) {
    const reason = r.attempts.at(-1).reason;
    if (r.status === "fail") console.log(`::error title=${r.name} failed::${reason}`);
    if (r.status === "inconclusive") console.log(`::warning title=${r.name} inconclusive::${reason}`);
  }
}

const failed = results.filter((r) => r.status === "fail").map((r) => r.name);
console.log(failed.length ? `\nFAILED: ${failed.join(", ")}` : "\nNo failures.");
process.exit(failed.length ? 1 : 0);
