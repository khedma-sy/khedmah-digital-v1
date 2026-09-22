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

for account in "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT" "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" "$OPERATIONS_BUILD_SERVICE_ACCOUNT" "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT"; do
  [[ "$account" == *"@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" ]] || {
    echo 'ERROR: Production service account is outside the protected Google project.' >&2
    exit 1
  }
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
done

echo "READY: LIVE_SECRET_METADATA_COUNT=${#permanent_secret_names[@]}"
echo "READY: LIVE_SECRET_PROJECT=$GOOGLE_CLOUD_PROJECT"
echo 'READY: SECRET_PAYLOADS_READ=0'
echo 'NOTE: BOOTSTRAP_ADMIN_SECRET is one-time and is certified separately by Production Bootstrap Admin before mutation.'
