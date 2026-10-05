#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT="${GOOGLE_CLOUD_PROJECT:-khedma-dl}"
EXPECTED_PROJECT="khedma-dl"

test "$PROJECT" = "$EXPECTED_PROJECT" || {
  echo "ERROR: Refusing to inspect unexpected project: $PROJECT" >&2
  exit 2
}

for bin in gcloud jq mktemp; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "ERROR: Required command not found: $bin" >&2
    exit 2
  }
done

secret_names=(
  DATABASE_URL
  FIREBASE_API_KEY
  FIREBASE_APP_ID
  GOOGLE_MAPS_BROWSER_API_KEY
  GOOGLE_MAPS_SERVER_API_KEY
  GOOGLE_OAUTH_SERVER_CLIENT_ID
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  OPERATIONS_PRODUCT_ROLE_BINDINGS
  RESEND_API_KEY
  GOOGLE_MAPS_ANDROID_API_KEY
  DATABASE_MIGRATION_URL
)

test "${#secret_names[@]}" -eq 17

project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$project_number" =~ ^[0-9]+$ ]] || {
  echo "ERROR: Could not establish project number." >&2
  exit 2
}

ancestor_json="$(gcloud projects get-ancestors "$PROJECT" --format=json)"
analysis_scope="project:$PROJECT"
while IFS=$'\t' read -r scope_type scope_id; do
  case "$scope_type" in
    folder) analysis_scope="folder:$scope_id" ;;
    organization) analysis_scope="organization:$scope_id" ;;
  esac
done < <(jq -r '.[] | select(.type == "folder" or .type == "organization") | [.type, .id] | @tsv' <<<"$ancestor_json")

scope_type="${analysis_scope%%:*}"
scope_id="${analysis_scope#*:}"
case "$scope_type" in
  project) scope_arg=(--project="$scope_id") ;;
  folder) scope_arg=(--folder="$scope_id") ;;
  organization) scope_arg=(--organization="$scope_id") ;;
  *)
    echo "ERROR: Unsupported IAM analysis scope." >&2
    exit 2
    ;;
esac

report="$(mktemp "$HOME/khedmah-secret-iam-audit.XXXXXX.json")"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
printf '[]\n' >"$report"

for secret_name in "${secret_names[@]}"; do
  resource="$(gcloud secrets describe "$secret_name" --project "$PROJECT" --format='value(name)')"
  case "$resource" in
    "projects/$PROJECT/secrets/$secret_name"|"projects/$project_number/secrets/$secret_name") ;;
    *)
      echo "ERROR: Unexpected secret resource for $secret_name" >&2
      exit 3
      ;;
  esac

  state="$(gcloud secrets versions describe latest --secret "$secret_name" --project "$PROJECT" --format='value(state)')"
  policy_json="$(gcloud secrets get-iam-policy "$secret_name" --project "$PROJECT" --format=json)"

  analysis_file="$(mktemp)"
  if ! gcloud asset analyze-iam-policy "${scope_arg[@]}" \
      --full-resource-name="//secretmanager.googleapis.com/projects/$project_number/secrets/$secret_name" \
      --permissions=secretmanager.versions.access \
      --expand-roles --expand-resources --show-response \
      --execution-timeout=60s --format=json >"$analysis_file"; then
    rm -f "$analysis_file"
    echo "ERROR: Policy Analyzer failed for $secret_name" >&2
    exit 4
  fi

  jq -e '
    .fullyExplored == true and
    .mainAnalysis.fullyExplored == true and
    ((.mainAnalysis.nonCriticalErrors // []) | length == 0) and
    all(.mainAnalysis.analysisResults[]?; .fullyExplored == true)
  ' "$analysis_file" >/dev/null || {
    rm -f "$analysis_file"
    echo "ERROR: Incomplete Policy Analyzer result for $secret_name" >&2
    exit 4
  }

  direct="$(jq '[.bindings[]? as $b | $b.members[]? | {role:$b.role, member:., condition:($b.condition // null)}] | sort_by(.role,.member)' <<<"$policy_json")"
  inherited="$(jq --arg resource "//secretmanager.googleapis.com/projects/$project_number/secrets/$secret_name" '
    [.mainAnalysis.analysisResults[]?
      | select(.attachedResourceFullName != $resource)
      | {
          attachedResourceFullName,
          identityList: (.identityList // []),
          accessControlLists: (.accessControlLists // [])
        }
    ]
  ' "$analysis_file")"
  rm -f "$analysis_file"

  jq --arg name "$secret_name" \
     --arg state "$state" \
     --argjson direct "$direct" \
     --argjson inherited "$inherited" \
     '. + [{secret:$name, latestState:$state, directBindings:$direct, inheritedAccess:$inherited}]' \
     "$report" >"$tmp"
  mv "$tmp" "$report"
done

echo "REPORT=$report"
echo "SECRET_COUNT=${#secret_names[@]}"
echo "SECRET_PAYLOADS_READ=0"
echo "CLOUD_MUTATIONS=0"
