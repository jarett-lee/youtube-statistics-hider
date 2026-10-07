#!/usr/bin/env bash
# Sets up Claude API credentials for the rest of the job, for the vision check
# and the repair agent, using Workload Identity Federation: the job exchanges
# a short-lived GitHub identity token for a Claude API token. See README.md,
# "Setup".
#
# Inputs (step env): FEDERATION_RULE_ID, ORGANIZATION_ID, SERVICE_ACCOUNT_ID,
# WORKSPACE_ID (optional). The job needs the `id-token: write` permission.
set -euo pipefail

if [ -z "${FEDERATION_RULE_ID:-}" ]; then
  echo "::warning::Workload Identity Federation isn't configured (no ANTHROPIC_FEDERATION_RULE_ID variable). The vision check is skipped and the repair agent can't run."
  exit 0
fi
if [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  echo "::error::Workload Identity Federation needs the job permission 'id-token: write'."
  exit 1
fi

token_file="$RUNNER_TEMP/anthropic-identity-token"
fetch_token() {
  curl -sSf -H "Authorization: Bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=https://api.anthropic.com" \
    | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).value)' > "$token_file.tmp"
  mv "$token_file.tmp" "$token_file"
}
fetch_token
# GitHub's identity tokens expire after about five minutes, and the SDK
# re-reads the file each time it refreshes its Claude API token, so keep the
# file fresh for the rest of the job. The runner stops this loop when the
# job ends.
(while sleep 240; do fetch_token || true; done) > /dev/null 2>&1 &

{
  echo "ANTHROPIC_IDENTITY_TOKEN_FILE=$token_file"
  echo "ANTHROPIC_FEDERATION_RULE_ID=$FEDERATION_RULE_ID"
  echo "ANTHROPIC_ORGANIZATION_ID=$ORGANIZATION_ID"
  echo "ANTHROPIC_SERVICE_ACCOUNT_ID=$SERVICE_ACCOUNT_ID"
  if [ -n "${WORKSPACE_ID:-}" ]; then echo "ANTHROPIC_WORKSPACE_ID=$WORKSPACE_ID"; fi
} >> "$GITHUB_ENV"
echo "Using Workload Identity Federation for the Claude API."
