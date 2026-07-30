#!/usr/bin/env bash
set -euo pipefail
set +x

for variable_name in GITHUB_REPOSITORY GITHUB_SHA GITHUB_REF; do
  [[ -n "${!variable_name:-}" ]] || { echo "${variable_name} is missing." >&2; exit 25; }
done
evidence="$EVIDENCE_DIRECTORY/github-environments.json"
mkdir -p "$(dirname "$evidence")"

deployments="$(gh api --method GET "repos/$GITHUB_REPOSITORY/deployments?environment=production&sha=$GITHUB_SHA&per_page=10")"
deployment_id="$(jq -r 'map(select(.environment == "production"))[0].id // empty' <<<"$deployments")"
[[ -n "$deployment_id" ]] || { echo 'Current run has no GitHub production deployment record.' >&2; exit 26; }

jq -n \
  --arg checkedAt "$(date -u +%FT%TZ)" \
  --arg deploymentId "$deployment_id" \
  --arg ref "$GITHUB_REF" \
  --arg sha "$GITHUB_SHA" \
  '{checkedAt:$checkedAt,environment:"production",deploymentId:$deploymentId,ref:$ref,sha:$sha,protectionConfiguration:"requires administrator evidence",reviewerIdentitiesRecorded:false}' \
  > "$evidence"
echo 'Current production Environment deployment record verified; reviewer policy remains an administrator-controlled prerequisite.'
