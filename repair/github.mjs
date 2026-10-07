// Minimal GitHub REST API helper for the workflow, so jobs don't need the gh
// CLI (it isn't in the Playwright container image).
//
// Environment: GH_TOKEN, GITHUB_REPOSITORY, and GITHUB_API_URL (set by
// GitHub Actions; defaults to https://api.github.com).

const API = process.env.GITHUB_API_URL || "https://api.github.com";
const REPO = process.env.GITHUB_REPOSITORY;

export const REPAIR_LABEL = "auto-repair";

// Invisible markers around the "Not verified" section of a draft repair PR's
// description, so the Verify repair PR workflow can remove it.
export const UNVERIFIED_START = "<!-- unverified -->";
export const UNVERIFIED_END = "<!-- /unverified -->";

/** Removes the "Not verified" section from a repair PR's description. */
export function removeUnverifiedSection(body) {
  const start = body.indexOf(UNVERIFIED_START);
  const end = body.indexOf(UNVERIFIED_END);
  if (start >= 0 && end > start) {
    return body.slice(0, start) + body.slice(end + UNVERIFIED_END.length).replace(/^\n+/, "");
  }
  // PRs opened before the markers existed have just the warning line.
  return body.replace(/^⚠️ \*\*Not verified:\*\*.*\n+/m, "");
}

/**
 * Calls the GitHub API for this repository. `path` is relative to
 * /repos/{owner}/{repo}. Returns the parsed response, or throws with the
 * status and message. Statuses in `allow` return null instead of throwing.
 */
export async function github(method, path, body, { allow = [] } = {}) {
  const response = await fetch(`${API}/repos/${REPO}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(process.env.GH_TOKEN && { Authorization: `Bearer ${process.env.GH_TOKEN}` }),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  if (allow.includes(response.status)) return null;
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${method} ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Calls the GitHub GraphQL API. Some actions, like marking a draft PR ready, have no REST endpoint. */
export async function graphql(query, variables) {
  const url = process.env.GITHUB_GRAPHQL_URL || "https://api.github.com/graphql";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (!response.ok || json.errors) throw new Error(`GitHub GraphQL: ${response.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

/** Open pull requests labeled auto-repair. Needs the pull-requests: read permission. */
export async function openRepairPrs() {
  const prs = await github("GET", "/pulls?state=open&per_page=100");
  return prs.filter((pr) => pr.labels.some((label) => label.name === REPAIR_LABEL));
}
