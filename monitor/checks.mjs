// Functions in this file run inside the YouTube page through page.evaluate(),
// so each one must be self-contained: no imports and no outside variables.

/**
 * Returns a reason string if the page is a bot check, consent page or other
 * interstitial instead of real YouTube content, or null if it looks normal.
 * A blocked page says nothing about whether the extension works, so it makes
 * the result inconclusive rather than failed.
 */
export function detectBlock() {
  if (/^consent\./.test(location.hostname)) return `consent page (${location.hostname})`;
  if (location.hostname.endsWith("google.com") && location.pathname.startsWith("/sorry")) {
    return 'Google "unusual traffic" page';
  }
  const text = document.body ? document.body.innerText : "";
  if (/confirm (that )?you.re not a bot/i.test(text)) return '"confirm you\'re not a bot" check';
  if (/our systems have detected unusual traffic/i.test(text)) return '"unusual traffic" message';
  if (/before you continue to youtube/i.test(text)) return "cookie consent dialog";
  const consent = document.querySelector("ytd-consent-bump-v2-lightbox, tp-yt-paper-dialog #consent-bump");
  if (consent && consent.checkVisibility()) return "cookie consent dialog";
  return null;
}

/**
 * Scans visible text for engagement stats the extension should have hidden.
 * Returns one finding per leftover stat: { check, text, path }.
 */
export function scanForStats() {
  // Text written by people (video titles, descriptions, comments) can mention
  // views or likes without being a stat, so it is skipped.
  const USER_CONTENT = [
    "h1", "h2", "h3", "#video-title", "ytd-comments", "ytd-text-inline-expander",
    "#description-text", ".metadata-snippet-container", "#snippet-text",
  ].join(",");
  // Badges such as "4K" look like abbreviated counts.
  const BADGES = 'ytd-badge-supported-renderer, badge-shape, [class*="badge" i]';

  const findings = [];
  const seen = new Set();

  const pathOf = (el) => {
    const parts = [];
    for (let e = el, i = 0; e && e !== document.documentElement && i < 6; i++, e = e.parentElement) {
      let part = e.tagName.toLowerCase();
      if (e.id) part += `#${e.id}`;
      else if (typeof e.className === "string" && e.className.trim()) {
        part += "." + e.className.trim().split(/\s+/).slice(0, 2).join(".");
      }
      parts.unshift(part);
    }
    return parts.join(" > ");
  };

  const report = (check, el, text) => {
    if (seen.has(el)) return;
    seen.add(el);
    findings.push({ check, text: text.replace(/\s+/g, " ").trim().slice(0, 120), path: pathOf(el) });
  };

  const isUserContent = (el) => el.closest(USER_CONTENT) !== null;
  const hasVisibleDigits = (el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (/\d/.test(walker.currentNode.textContent) && walker.currentNode.parentElement.checkVisibility()) {
        return true;
      }
    }
    return false;
  };

  // 1. Text that spells out a view count: "1.2M views", "1 view", "No views".
  const VIEW_TEXT = /\b\d[\d.,]*\s*[KMB]?\s+views?\b|\bno views\b/i;
  // 2. A subscriber count: the channel owner's count on the watch page, and the
  //    channel header on channel pages. Other subscriber counts are not checked yet.
  const SUBSCRIBER_TEXT = /\b\d[\d.,]*\s*[KMB]?\s+subscribers?\b/i;
  const SUBSCRIBER_SCOPE = "ytd-watch-metadata ytd-video-owner-renderer, yt-page-header-view-model";
  // 3. A bare abbreviated count, such as "19K" in a metadata row or "19M" on the like button.
  const BARE_COUNT = /^\d[\d.,]*\s*[KMB]$/;
  // 4. A like count on a comment or reply, such as "324K" or "12". Comments are
  //    otherwise skipped as user-written text, but their toolbar is YouTube's.
  const COMMENT_LIKE_COUNT = /^\d[\d.,]*\s*[KMB]?$/;
  const COMMENT_TOOLBAR = "ytd-comment-engagement-bar";

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent.trim();
    const el = walker.currentNode.parentElement;
    if (!text || !el || !el.checkVisibility()) continue;
    if (el.closest(COMMENT_TOOLBAR)) {
      if (COMMENT_LIKE_COUNT.test(text)) report("comment like count", el, text);
      continue;
    }
    if (isUserContent(el)) continue;
    if (VIEW_TEXT.test(text)) report("view text", el, text);
    else if (SUBSCRIBER_TEXT.test(text) && el.closest(SUBSCRIBER_SCOPE)) report("subscriber text", el, text);
    else if (BARE_COUNT.test(text) && !el.closest(BADGES)) report("bare count", el, text);
  }

  // 5. Elements whose accessible label names the stat while the visible text is
  //    just a number, such as aria-label="19 thousand views" on "19K", or
  //    aria-label="1.8B views" on the watch page's rolling-digit view count,
  //    which renders each digit as its own element.
  for (const el of document.querySelectorAll("[aria-label]")) {
    const label = el.getAttribute("aria-label").trim();
    const isStat =
      /^[\d.,]+\s*([KMB]|thousand|million|billion)?\s*views?$/i.test(label) ||
      /^like this video along with/i.test(label);
    if (isStat && !isUserContent(el) && el.checkVisibility() && hasVisibleDigits(el)) {
      // The visible text can be scrambled (rolling digits), so report the label.
      report("labeled stat", el, `aria-label: ${label}`);
    }
  }

  // 6. Label-and-value rows, such as "Views  1,823,928,383" in the expanded description.
  for (const el of document.querySelectorAll("span, div, yt-formatted-string")) {
    if (el.children.length > 0 || !/^(views|likes)$/i.test(el.textContent.trim())) continue;
    if (isUserContent(el) || !el.checkVisibility()) continue;
    const row = el.closest("yt-list-item-view-model") || el.parentElement?.parentElement?.parentElement;
    if (row && hasVisibleDigits(row)) report("labeled row", row, row.textContent);
  }

  return findings;
}
