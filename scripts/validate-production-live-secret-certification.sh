#!/usr/bin/env bash
set -euo pipefail
set +x

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${PRODUCTION_GOOGLE_CLOUD_PROJECT:?PRODUCTION_GOOGLE_CLOUD_PROJECT is required}"
: "${OPERATIONS_DEPLOYER_SERVICE_ACCOUNT:?OPERATIONS_DEPLOYER_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_RUNTIME_SERVICE_ACCOUNT:?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_BUILD_SERVICE_ACCOUNT:?OPERATIONS_BUILD_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_MIGRATION_SERVICE_ACCOUNT:?OPERATIONS_MIGRATION_SERVICE_ACCOUNT is required}"

test "$GOOGLE_CLOUD_PROJECT" = "$PRODUCTION_GOOGLE_CLOUD_PROJECT" || {
  echo 'ERROR: Active Google project does not match protected Production project.' >&2
  exit 1
}

expected_deployer="khedmah-v1-deployer@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"
expected_runtime="khedmah-v1-runtime@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"
expected_build="khedmah-v1-build@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"
expected_migration="khedmah-v1-migrator@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com"

test "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" = "$expected_deployer" &&
test "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" = "$expected_runtime" &&
test "$OPERATIONS_BUILD_SERVICE_ACCOUNT" = "$expected_build" &&
test "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT" = "$expected_migration" || {
  echo 'ERROR: Production service-account identities differ from the canonical Terraform identities.' >&2
  exit 1
}
accounts=("$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" "$OPERATIONS_BUILD_SERVICE_ACCOUNT" "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT")
test "$(printf '%s\n' "${accounts[@]}" | LC_ALL=C sort -u | wc -l | tr -d ' ')" -eq 4 || {
  echo 'ERROR: Production service-account identities must be distinct.' >&2
  exit 1
}
for account in "${accounts[@]}"; do
  gcloud iam service-accounts describe "$account" --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null
done

active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
test "$active_account" = "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" || {
  echo 'ERROR: Active Google identity is not the protected Production deployer.' >&2
  exit 1
}

project_number="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectNumber)')"
[[ "$project_number" =~ ^[0-9]+$ ]] || {
  echo 'ERROR: Could not establish the Production project number.' >&2
  exit 1
}

ancestor_json="$(gcloud projects get-ancestors "$GOOGLE_CLOUD_PROJECT" --format=json)"
ancestor_scopes="$(jq -r '.[] | select(.type == "folder" or .type == "organization") | [.type, .id] | @tsv' <<<"$ancestor_json")"

verify_no_inherited_secret_access() {
  local secret_name="$1"
  local resource="//secretmanager.googleapis.com/projects/$project_number/secrets/$secret_name"
  local scope_type scope_id scope
  local -a scopes=("project:$GOOGLE_CLOUD_PROJECT")
  while IFS=$'\t' read -r scope_type scope_id; do
    [[ -n "$scope_type" && -n "$scope_id" ]] && scopes+=("$scope_type:$scope_id")
  done <<<"$ancestor_scopes"

  for scope in "${scopes[@]}"; do
    scope_type="${scope%%:*}"
    scope_id="${scope#*:}"
    local -a scope_arg
    case "$scope_type" in
      project) scope_arg=(--project="$scope_id") ;;
      folder) scope_arg=(--folder="$scope_id") ;;
      organization) scope_arg=(--organization="$scope_id") ;;
      *)
        echo 'ERROR: Could not establish a supported IAM ancestor scope.' >&2
        return 1
        ;;
    esac

    local analysis_file
    analysis_file="$(mktemp)"
    if ! gcloud asset analyze-iam-policy "${scope_arg[@]}" \
      --full-resource-name="$resource" \
      --permissions=secretmanager.versions.access \
      --expand-groups --expand-roles --expand-resources --output-group-edges \
      --execution-timeout=60s --format=json >"$analysis_file"; then
      rm -f "$analysis_file"
      echo 'ERROR: Effective Secret Manager IAM analysis failed; refusing certification.' >&2
      return 1
    fi
    jq -e '
      .fullyExplored == true and
      .mainAnalysis.fullyExplored == true and
      ((.mainAnalysis.nonCriticalErrors // []) | length == 0) and
      all(.mainAnalysis.analysisResults[]?; .fullyExplored == true)
    ' "$analysis_file" >/dev/null || {
      rm -f "$analysis_file"
      echo 'ERROR: Effective Secret Manager IAM analysis was incomplete.' >&2
      return 1
    }
    if jq -e --arg resource "$resource" '
      any(.mainAnalysis.analysisResults[]?; .attachedResourceFullName != $resource)
    ' "$analysis_file" >/dev/null; then
      rm -f "$analysis_file"
      echo 'ERROR: A project, folder or organization binding grants inherited Secret Manager payload access.' >&2
      return 1
    fi
    rm -f "$analysis_file"
  done
}

runtime_secret_names=(
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
)

build_secret_names=(
  GOOGLE_MAPS_BROWSER_API_KEY
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
)

permanent_secret_names=(
  "${runtime_secret_names[@]}"
  GOOGLE_MAPS_ANDROID_API_KEY
  DATABASE_MIGRATION_URL
)

array_contains() {
  local needle="$1"
  shift
  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$needle" ]] && return 0
  done
  return 1
}

expected_policy_lines() {
  local secret_name="$1"
  if array_contains "$secret_name" "${runtime_secret_names[@]}"; then
    printf 'roles/secretmanager.secretAccessor\tserviceAccount:%s\n' "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT"
  fi
  if array_contains "$secret_name" "${build_secret_names[@]}"; then
    printf 'roles/secretmanager.secretAccessor\tserviceAccount:%s\n' "$OPERATIONS_BUILD_SERVICE_ACCOUNT"
  fi
  case "$secret_name" in
    DATABASE_MIGRATION_URL)
      printf 'roles/secretmanager.secretAccessor\tserviceAccount:%s\n' "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"
      printf 'roles/secretmanager.secretVersionManager\tserviceAccount:%s\n' "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"
      ;;
    GOOGLE_MAPS_BROWSER_API_KEY)
      printf 'roles/secretmanager.secretVersionManager\tserviceAccount:%s\n' "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"
      ;;
    GOOGLE_MAPS_ANDROID_API_KEY)
      printf 'roles/secretmanager.secretAccessor\tserviceAccount:%s\n' "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"
      printf 'roles/secretmanager.secretVersionManager\tserviceAccount:%s\n' "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"
      ;;
    GOOGLE_OAUTH_SERVER_CLIENT_ID)
      printf 'roles/secretmanager.secretAccessor\tserviceAccount:%s\n' "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"
      ;;
  esac
}

test "${#permanent_secret_names[@]}" -eq 17 || {
  echo 'ERROR: Permanent Secret Manager inventory count drifted from 17.' >&2
  exit 1
}

for secret_name in "${permanent_secret_names[@]}"; do
  resource_name="$(gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)')"
  case "$resource_name" in
    "projects/$GOOGLE_CLOUD_PROJECT/secrets/$secret_name"|"projects/$project_number/secrets/$secret_name") ;;
    *)
      echo 'ERROR: Secret resource is not bound to the protected Production project.' >&2
      exit 1
      ;;
  esac

  state="$(gcloud secrets versions describe latest --secret "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(state)')"
  test "$state" = ENABLED || {
    echo 'ERROR: A permanent Production secret has no ENABLED latest version.' >&2
    exit 1
  }

  policy_json="$(gcloud secrets get-iam-policy "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format=json)"
  jq -e '[.bindings[]?.members[]?] | all(. != "allUsers" and . != "allAuthenticatedUsers")' <<<"$policy_json" >/dev/null || {
    echo 'ERROR: A Production secret contains a public IAM principal.' >&2
    exit 1
  }
  if jq -e 'any(.bindings[]?; has("condition"))' <<<"$policy_json" >/dev/null; then
    echo 'ERROR: Conditional Secret Manager IAM is outside the canonical bootstrap contract.' >&2
    exit 1
  fi

  expected_policy="$(expected_policy_lines "$secret_name" | LC_ALL=C sort -u)"
  actual_policy="$(jq -r '.bindings[]? as $binding | $binding.members[]? | [$binding.role, .] | @tsv' <<<"$policy_json" | LC_ALL=C sort -u)"
  test -n "$expected_policy"
  test "$actual_policy" = "$expected_policy" || {
    echo 'ERROR: Secret-level IAM differs from the exact canonical role/member allowlist.' >&2
    exit 1
  }
  verify_no_inherited_secret_access "$secret_name"
done

echo "READY: LIVE_SECRET_METADATA_COUNT=${#permanent_secret_names[@]}"
echo "READY: LIVE_SECRET_PROJECT=$GOOGLE_CLOUD_PROJECT"
echo 'READY: SECRET_PAYLOADS_READ=0'
echo 'NOTE: BOOTSTRAP_ADMIN_SECRET is one-time and is certified separately by Production Bootstrap Admin before mutation.'
