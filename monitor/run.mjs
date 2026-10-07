// Loads YouTube with the extension installed and checks that no engagement
// stats are left visible. See README.md, "The monitor".
//
// Each attempt at a page runs two checks:
//   DOM text scan  visible text that looks like a stat (checks.mjs)
//   vision check   Claude compares screenshots with and without the extension (vision.mjs)
//
// Each target page ends in one of three results:
//   pass          neither check found a problem
//   fail          a check found a problem on every attempt, or the extension didn't load
//   inconclusive  YouTube showed a bot check or consent page, or the page didn't load
//
// Exit code: 1 if any target failed, otherwise 0. Inconclusive results don't
// fail the run, because they say nothing about the extension.
//
// Environment variables:
//   MONITOR_EXTENSION_DIR  extension to load (default: src)
//   MONITOR_OUTPUT_DIR     where to write results (default: monitor-output)
//   MONITOR_PAGES          comma-separated target names to check (default: all)
//   MONITOR_VISION=0       skip the vision check
//   Claude API credentials (Workload Identity Federation, or an `ant auth login`
//   profile locally) are needed for the vision check; without them it is skipped

import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectBlock, scanForStats } from "./checks.mjs";
import { reviewScreenshots } from "./vision.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_DIR = path.resolve(process.env.MONITOR_EXTENSION_DIR || path.join(ROOT, "src"));
const OUTPUT_DIR = path.resolve(process.env.MONITOR_OUTPUT_DIR || path.join(ROOT, "monitor-output"));
const MAX_ATTEMPTS = 2;
const SETTLE_MS = 4000;
const VIEWPORT = { width: 1400, height: 900 };

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
    // The top of the page, then the end of the expanded description, where
    // some layouts list views and likes. Falls back to the second screen.
    shotPositions: () => {
      const description = document.querySelector("ytd-watch-metadata #description");
      const bottom = description ? description.getBoundingClientRect().bottom + window.scrollY : 0;
      return [0, bottom > window.innerHeight ? bottom - window.innerHeight + 40 : window.innerHeight];
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

// Opens the target in a fresh browser profile, with or without the extension,
// and waits for it to render. Returns { context, page, blocked, cleanup }.
async function openPage(target, { withExtension }) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-stats-hider-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium", // the new headless mode, which supports extensions
    headless: true,
    viewport: VIEWPORT,
    locale: "en-US",
    args: withExtension ? [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`] : [],
  });
  const cleanup = async () => {
    await context.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });
  };
  try {
    const page = await context.newPage();
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
    if (!blocked) {
      if (target.prepare) await target.prepare(page);
      // Scroll so lazily loaded parts of the page render, then come back up.
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, -2000);
      await page.waitForTimeout(500);
    }
    return { context, page, blocked, cleanup };
  } catch (error) {
    // The caller only gets cleanup() on success, so close the browser here;
    // a browser left open keeps the whole monitor process from exiting.
    await cleanup();
    throw error;
  }
}

// Viewport-sized screenshots, by default of the top two screens of the page.
// These are what the vision check reads; a full-page screenshot would be
// scaled down too far for small text like "19K" to stay legible.
async function viewportShots(target, page, dir) {
  const positions = target.shotPositions ? await page.evaluate(target.shotPositions) : [0, VIEWPORT.height];
  const shots = [];
  for (const [i, y] of positions.entries()) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(700);
    const buffer = await page.screenshot();
    fs.writeFileSync(path.join(dir, `view-${i + 1}.png`), buffer);
    shots.push(buffer);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return shots;
}

async function saveSnapshot(page, dir) {
  await page.screenshot({ path: path.join(dir, "screenshot.png"), fullPage: true }).catch(() => {});
  await page.content().then((html) => fs.writeFileSync(path.join(dir, "dom.html"), html), () => {});
}

async function attempt(target, dir) {
  const withDir = path.join(dir, "with-extension");
  const withoutDir = path.join(dir, "without-extension");
  fs.mkdirSync(withDir, { recursive: true });
  fs.mkdirSync(withoutDir, { recursive: true });
  const result = { url: target.url };

  // 1. With the extension: DOM text scan.
  let withShots = [];
  let opened;
  try {
    opened = await openPage(target, { withExtension: true });
    const { page, blocked } = opened;
    result.finalUrl = page.url();
    if (blocked) {
      Object.assign(result, { status: "inconclusive", reason: blocked });
    } else if ((await page.evaluate(() => document.documentElement.dataset.ytStatsHider)) !== "loaded") {
      Object.assign(result, { status: "fail", reason: "extension content script didn't run" });
    } else {
      result.findings = await page.evaluate(scanForStats);
      withShots = await viewportShots(target, page, withDir);
    }
  } catch (error) {
    Object.assign(result, { status: "inconclusive", reason: `error: ${error.message.split("\n")[0]}` });
  } finally {
    if (opened) await saveSnapshot(opened.page, withDir);
    await opened?.cleanup();
  }

  // 2. Without the extension: the baseline the vision check compares against,
  //    and the "before the extension" evidence the repair agent reads.
  if (!result.status) {
    let withoutShots = [];
    let baseline;
    try {
      baseline = await openPage(target, { withExtension: false });
      if (baseline.blocked) result.baseline = `unavailable: ${baseline.blocked}`;
      else withoutShots = await viewportShots(target, baseline.page, withoutDir);
    } catch (error) {
      result.baseline = `unavailable: ${error.message.split("\n")[0]}`;
    } finally {
      if (baseline) await saveSnapshot(baseline.page, withoutDir);
      await baseline?.cleanup();
    }

    // 3. Vision check.
    result.vision = await reviewScreenshots({
      page: target.name,
      url: target.url,
      withExtension: withShots,
      withoutExtension: withoutShots,
    });

    const problems = [];
    if (result.findings.length) problems.push(`${result.findings.length} leftover stat(s) in the DOM`);
    if (result.vision.status === "fail") {
      const { visible_stats: visible, wrongly_hidden: hidden } = result.vision;
      if (visible.length) problems.push(`${visible.length} stat(s) visible in screenshots`);
      if (hidden.length) problems.push(`${hidden.length} element(s) wrongly hidden`);
    }
    Object.assign(result, problems.length ? { status: "fail", reason: problems.join(", ") } : { status: "pass" });
  }

  fs.writeFileSync(path.join(dir, "result.json"), JSON.stringify(result, null, 2));
  return result;
}

function describeVision(vision) {
  if (!vision) return "";
  if (vision.status === "skipped" || vision.status === "error") return `${vision.status} (${vision.reason})`;
  return vision.status;
}

// A single failed or blocked load is often a fluke (slow load, A/B variant
// mid-rollout, bot check), so a target gets another attempt before it counts.
async function check(target) {
  const attempts = [];
  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const result = await attempt(target, path.join(OUTPUT_DIR, target.name, `attempt-${n}`));
    attempts.push(result);
    console.log(`${target.name} attempt ${n}: ${result.status}${result.reason ? ` (${result.reason})` : ""}`);
    if (result.vision) console.log(`    vision: ${describeVision(result.vision)}`);
    for (const f of result.findings ?? []) console.log(`    [${f.check}] "${f.text}"  at ${f.path}`);
    for (const f of result.vision?.visible_stats ?? []) console.log(`    [vision: visible] ${f.description} (${f.location})`);
    for (const f of result.vision?.wrongly_hidden ?? []) console.log(`    [vision: wrongly hidden] ${f.description} (${f.location})`);
    if (result.status === "pass") break;
  }
  // Fail only if every attempt that reached the page found a problem.
  const reached = attempts.filter((a) => a.status !== "inconclusive");
  const status = reached.length === 0 ? "inconclusive" : reached.every((a) => a.status === "fail") ? "fail" : "pass";
  return { name: target.name, url: target.url, status, attempts };
}

function visionCost(results) {
  const costs = results.flatMap((r) => r.attempts.map((a) => a.vision?.usage?.estimated_cost_usd ?? 0));
  return costs.reduce((a, b) => a + b, 0);
}

function writeSummary(results) {
  const icon = { pass: "✅", fail: "❌", inconclusive: "⚠️" };
  const lines = ["## YouTube Statistics Hider monitor", "", "| Page | Result | Vision check | Details |", "|---|---|---|---|"];
  for (const r of results) {
    const last = r.attempts.at(-1);
    lines.push(`| ${r.name} | ${icon[r.status]} ${r.status} | ${describeVision(last.vision)} | ${r.status === "pass" ? "" : last.reason ?? ""} |`);
  }
  const last = (r) => r.attempts.at(-1);
  const findings = results.flatMap((r) => (last(r).findings ?? []).map((f) => ({ page: r.name, ...f })));
  if (findings.length) {
    lines.push("", "### Leftover stats in the DOM", "", "| Page | Check | Text | Element |", "|---|---|---|---|");
    for (const f of findings) lines.push(`| ${f.page} | ${f.check} | \`${f.text}\` | \`${f.path}\` |`);
  }
  const vision = results.flatMap((r) => [
    ...(last(r).vision?.visible_stats ?? []).map((f) => ({ page: r.name, kind: "still visible", ...f })),
    ...(last(r).vision?.wrongly_hidden ?? []).map((f) => ({ page: r.name, kind: "wrongly hidden", ...f })),
  ]);
  if (vision.length) {
    lines.push("", "### Vision check findings", "", "| Page | Problem | What | Where |", "|---|---|---|---|");
    for (const f of vision) lines.push(`| ${f.page} | ${f.kind} | ${f.description} | ${f.location} |`);
  }
  lines.push("", `Vision check cost (estimate): $${visionCost(results).toFixed(2)}`);
  const markdown = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.md"), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

async function main() {
  const only = process.env.MONITOR_PAGES?.split(",").map((s) => s.trim()).filter(Boolean);
  const targets = only?.length ? TARGETS.filter((t) => only.includes(t.name)) : TARGETS;
  if (!targets.length) throw new Error(`MONITOR_PAGES matched no targets. Known: ${TARGETS.map((t) => t.name).join(", ")}`);

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const target of targets) results.push(await check(target));

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "report.json"),
    JSON.stringify({ time: new Date().toISOString(), extension: EXTENSION_DIR, results }, null, 2),
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
  console.log(`Vision check cost (estimate): $${visionCost(results).toFixed(2)}`);
  return failed.length ? 1 : 0;
}

// Exit explicitly so nothing left running (such as a browser that failed to
// close) can keep the job alive until its timeout.
process.exit(await main());
