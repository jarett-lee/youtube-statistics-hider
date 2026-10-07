// Vision check: Claude compares screenshots of the same page with and without
// the extension, and reports engagement stats that are still visible and
// content that was hidden by mistake.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { IN_SCOPE, MUST_STAY_VISIBLE, OUT_OF_SCOPE } from "./scope.mjs";

export const VISION_MODEL = "claude-opus-5-5";
// Standard Claude Opus 5.5 pricing, used for cost estimates only.
const PRICE_PER_MTOK = { input: 4, output: 20 };

const Finding = z.object({
  description: z.string().describe('What is shown, quoting the visible text, e.g. "1.2M views" under the first sidebar video'),
  location: z.string().describe("Where on the page, e.g. watch page sidebar, third card"),
  screenshot: z.number().int().describe("1-based index of the with-extension screenshot it appears in"),
});

const Review = z.object({
  visible_stats: z.array(Finding).describe("In-scope engagement stats still visible with the extension on"),
  wrongly_hidden: z.array(Finding).describe("Content visible without the extension but missing with it, that must stay visible"),
  notes: z.string().describe("Anything that limited the review, such as an unloaded page or a dialog covering content. Empty if none."),
});

const SYSTEM = `You review screenshots for a Chrome extension that hides engagement statistics on YouTube.

${IN_SCOPE}

${OUT_OF_SCOPE}

${MUST_STAY_VISIBLE}

You get screenshots of the same YouTube page with the extension on and, when available, with it off. The two loads are separate, so recommendations, ads and ordering can differ between them; only report a difference as wrongly hidden when the same kind of element is clearly present without the extension and missing with it. Report only what you can actually see. Read small text carefully: a bare number like "19K" next to a date or under a title is a view count.`;

let client;
let noCredentials = null;

/**
 * Reviews one page. `withExtension` and `withoutExtension` are arrays of PNG
 * buffers (viewport screenshots, top of the page first). Returns
 * { status: "pass" | "fail" | "skipped" | "error", ... }.
 */
export async function reviewScreenshots({ page, url, withExtension, withoutExtension }) {
  if (process.env.MONITOR_VISION === "0") return { status: "skipped", reason: "MONITOR_VISION=0" };
  if (noCredentials) return { status: "skipped", reason: noCredentials };
  // The SDK finds credentials itself: Workload Identity Federation in CI, or
  // an `ant auth login` profile locally.
  client ??= new Anthropic();

  const image = (buffer) => ({
    type: "image",
    source: { type: "base64", media_type: "image/png", data: buffer.toString("base64") },
  });
  const content = [{ type: "text", text: `Page: ${page} (${url})\n\nWith the extension ON:` }];
  withExtension.forEach((b, i) => content.push({ type: "text", text: `With extension, screenshot ${i + 1}:` }, image(b)));
  if (withoutExtension.length) {
    content.push({ type: "text", text: "Same page with the extension OFF, for comparison:" });
    withoutExtension.forEach((b, i) => content.push({ type: "text", text: `Without extension, screenshot ${i + 1}:` }, image(b)));
  } else {
    content.push({ type: "text", text: "No screenshots without the extension are available, so judge wrongly hidden content from the with-extension screenshots alone." });
  }
  content.push({ type: "text", text: "Review the with-extension screenshots." });

  try {
    const response = await client.beta.messages.parse({
      model: VISION_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: zodOutputFormat(Review) },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    });
    const usage = {
      model: response.model,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      estimated_cost_usd: estimateCost(response.usage),
    };
    if (response.stop_reason === "refusal") {
      return { status: "error", reason: `model declined (${response.stop_details?.category ?? "no category"})`, usage };
    }
    const review = response.parsed_output;
    if (!review) return { status: "error", reason: `no parseable review (stop_reason ${response.stop_reason})`, usage };
    const failed = review.visible_stats.length > 0 || review.wrongly_hidden.length > 0;
    return { status: failed ? "fail" : "pass", ...review, usage };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { status: "skipped", reason: "Claude API authentication failed" };
    if (error instanceof Anthropic.APIError) return { status: "error", reason: `API error ${error.status}: ${error.message}` };
    // API failures are all AnthropicError subclasses. A plain Error here comes
    // from the SDK's setup before any request is sent, usually because it
    // found no credentials. Skip the vision check for the rest of the run.
    if (!(error instanceof Anthropic.AnthropicError)) {
      noCredentials = `Claude API client not set up: ${error.message.split(".")[0]}`;
      return { status: "skipped", reason: noCredentials };
    }
    return { status: "error", reason: error.message };
  }
}

export function estimateCost(usage) {
  const cost = (usage.input_tokens * PRICE_PER_MTOK.input + usage.output_tokens * PRICE_PER_MTOK.output) / 1e6;
  return Math.round(cost * 10000) / 10000;
}
