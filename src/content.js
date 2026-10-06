// Marks the page so tests (and the popup, later) can tell the extension is running.
document.documentElement.dataset.ytStatsHider = "loaded";

// hide.css scopes its rules by page type. YouTube is a single-page app, so the
// page type has to be updated on every in-app navigation, not just on load.
function pageType(url) {
  return new URL(url, location.href).pathname === "/watch" ? "watch" : "other";
}

function setPageType(url) {
  document.documentElement.dataset.ytStatsHiderPage = pageType(url);
}

setPageType(location.href);

// Fires before the new page renders, so stats don't flash on screen.
navigation.addEventListener("navigate", (event) => {
  setPageType(event.destination.url);
});

// Fallbacks in case a navigation is cancelled or happens outside the Navigation API.
navigation.addEventListener("currententrychange", () => setPageType(location.href));
document.addEventListener("yt-navigate-finish", () => setPageType(location.href));

// Some stats have no ID or class of their own, so CSS can't select them. These
// are found by their text and marked with data-yt-stats-hider-hidden, which
// hide.css hides. English only for now.
const TEXT_MATCHED_STATS = [
  {
    // Watch page: an unlabeled "1,234 views" element inside the info line, seen
    // in some layouts instead of (or as well as) #view-count.
    candidates: "ytd-watch-info-text #info yt-formatted-string, ytd-watch-info-text #info span",
    text: /^(\d[\d.,]*\s*[KMB]?|No)\s+views?$/i,
  },
  {
    // All pages: view count on older-style video cards (hashtag pages, search
    // results). It shares a class with the upload date, so only its text tells
    // them apart. Grid cards drop the word "views" and show just "1.8B".
    candidates: "ytd-video-meta-block #metadata-line span.inline-metadata-item",
    text: /^(\d[\d.,]*\s*[KMB]?|No)(\s+views?)?$/i,
  },
];

function markTextMatchedStats() {
  for (const rule of TEXT_MATCHED_STATS) {
    for (const el of document.querySelectorAll(rule.candidates)) {
      // YouTube reuses elements across navigations, so unmark anything whose
      // text no longer matches.
      el.toggleAttribute("data-yt-stats-hider-hidden", rule.text.test(el.textContent.trim()));
    }
  }
}

// Mutation callbacks run before the next paint, so matched stats never show.
new MutationObserver(markTextMatchedStats).observe(document, {
  childList: true,
  subtree: true,
  characterData: true,
});
