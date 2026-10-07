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

migration_alias_role_id='khedmahDatabaseMigrationAliasManager'
expected_migration_alias_role="projects/$GOOGLE_CLOUD_PROJECT/roles/$migration_alias_role_id"
if ! migration_alias_role_json="$(gcloud iam roles describe "$migration_alias_role_id" --project "$GOOGLE_CLOUD_PROJECT" --format=json)"; then
  echo 'ERROR: Could not read the canonical migration alias role definition; refusing certification.' >&2
  exit 1
fi
# A custom role name alone cannot prove its permissions. The IAM Role API omits
# stage for ALPHA and deleted for false; explicit malformed values fail closed.
jq -se --arg role "$expected_migration_alias_role" '
  length == 1 and (.[0] |
    type == "object" and .name == $role and
    (if has("deleted") then .deleted == false else true end) and
    (if has("stage") then
      (.stage | type == "string") and
      (.stage as $stage | ["ALPHA", "BETA", "GA", "DEPRECATED", "EAP"] | index($stage) != null)
    else true end) and
    (.includedPermissions | type == "array") and
    (.includedPermissions | sort == ["secretmanager.secrets.get", "secretmanager.secrets.update"])
  )
' <<<"$migration_alias_role_json" >/dev/null || {
  echo 'ERROR: Migration alias role definition differs from the exact canonical permissions or usable lifecycle.' >&2
  exit 1
}

ancestor_json="$(gcloud projects get-ancestors "$GOOGLE_CLOUD_PROJECT" --format=json)"
ancestor_scopes="$(jq -r '.[] | select(.type == "folder" or .type == "organization") | [.type, .id] | @tsv' <<<"$ancestor_json")"
analysis_scope="project:$GOOGLE_CLOUD_PROJECT"
while IFS=$'\t' read -r scope_type scope_id; do
  case "$scope_type" in
    folder) analysis_scope="folder:$scope_id" ;;
    organization) analysis_scope="organization:$scope_id" ;;
  esac
done <<<"$ancestor_scopes"

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

deferred_secret_names=(
  GOOGLE_MAPS_ANDROID_API_KEY
  GOOGLE_MAPS_SERVER_API_KEY
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
      printf '%s\tserviceAccount:%s\n' "$expected_migration_alias_role" "$OPERATIONS_DEPLOYER_SERVICE_ACCOUNT"
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

effective_iam_policy_file=""

prepare_effective_secret_iam_policies() {
  local scope_type="${analysis_scope%%:*}"
  local scope_id="${analysis_scope#*:}"
  local scope_path
  case "$scope_type" in
    project) scope_path="projects/$scope_id" ;;
    folder) scope_path="folders/$scope_id" ;;
    organization) scope_path="organizations/$scope_id" ;;
    *)
      echo 'ERROR: Could not establish a supported IAM ancestor scope.' >&2
      return 1
      ;;
  esac

  local resource
  local -a protected_resources=()
  for secret_name in "${permanent_secret_names[@]}"; do
    protected_resources+=("//secretmanager.googleapis.com/projects/$project_number/secrets/$secret_name")
  done
  test "${#protected_resources[@]}" -eq 17 || {
    echo 'ERROR: Effective IAM resource inventory drifted from 17 protected secrets.' >&2
    return 1
  }

  local names_csv
  names_csv="$(IFS=,; printf '%s' "${protected_resources[*]}")"
  effective_iam_policy_file="$(mktemp)"
  if ! gcloud asset get-effective-iam-policy \
    --scope="$scope_path" \
    --names="$names_csv" \
    --format=json >"$effective_iam_policy_file"; then
    rm -f "$effective_iam_policy_file"
    effective_iam_policy_file=""
    echo 'ERROR: Effective Secret Manager IAM batch lookup failed; refusing certification.' >&2
    return 1
  fi

  jq -e --argjson expected 17 '
    type == "object" and
    (.policyResults | type == "array") and
    (.policyResults | length) == $expected and
    ([.policyResults[].fullResourceName] | unique | length) == $expected
  ' "$effective_iam_policy_file" >/dev/null || {
    rm -f "$effective_iam_policy_file"
    effective_iam_policy_file=""
    echo 'ERROR: Effective Secret Manager IAM batch was incomplete or duplicated.' >&2
    return 1
  }
}

role_grants_secret_payload_access() {
  local role="$1"
  local role_json
  case "$role" in
    roles/*)
      role_json="$(gcloud iam roles describe "$role" --format=json)" || return 2
      ;;
    projects/*/roles/*)
      local role_project role_id
      role_project="${role#projects/}"
      role_project="${role_project%%/roles/*}"
      role_id="${role##*/roles/}"
      role_json="$(gcloud iam roles describe "$role_id" --project "$role_project" --format=json)" || return 2
      ;;
    organizations/*/roles/*)
      local role_org role_id
      role_org="${role#organizations/}"
      role_org="${role_org%%/roles/*}"
      role_id="${role##*/roles/}"
      role_json="$(gcloud iam roles describe "$role_id" --organization "$role_org" --format=json)" || return 2
      ;;
    *)
      return 2
      ;;
  esac
  jq -e '.includedPermissions // [] | index("secretmanager.versions.access") != null' <<<"$role_json" >/dev/null
}

verify_no_inherited_secret_access() {
  local secret_name="$1"
  local resource="//secretmanager.googleapis.com/projects/$project_number/secrets/$secret_name"
  local project_resource_number="//cloudresourcemanager.googleapis.com/projects/$project_number"
  local project_resource_id="//cloudresourcemanager.googleapis.com/projects/$GOOGLE_CLOUD_PROJECT"

  test -n "$effective_iam_policy_file" && test -s "$effective_iam_policy_file" || {
    echo 'ERROR: Effective Secret Manager IAM batch is unavailable.' >&2
    return 1
  }

  local row attached role condition_json members_json
  while IFS=$'\t' read -r attached role condition_json members_json; do
    test -n "$role" || continue
    if ! role_grants_secret_payload_access "$role"; then
      status=$?
      if test "$status" -eq 2; then
        echo 'ERROR: Could not resolve an inherited IAM role while certifying Secret Manager payload access.' >&2
        return 1
      fi
      continue
    fi

    if test "$attached" = "$project_resource_number" || test "$attached" = "$project_resource_id"; then
      if test "$role" = "roles/owner" &&
         test "$condition_json" = "null" &&
         jq -e 'type == "array" and length > 0 and all(.[]; (type == "string") and startswith("user:"))' <<<"$members_json" >/dev/null; then
        continue
      fi
    fi

    echo 'ERROR: Inherited Secret Manager payload access exceeds the human project-Owner break-glass exception.' >&2
    return 1
  done < <(
    jq -r --arg resource "$resource" '
      .policyResults[]
      | select(.fullResourceName == $resource)
      | .policies[]?
      | select(.attachedResource != $resource)
      | .attachedResource as $attached
      | .policy.bindings[]?
      | [$attached, .role, ((.condition // null) | tojson), ((.members // []) | tojson)]
      | @tsv
    ' "$effective_iam_policy_file"
  )

  jq -e --arg resource "$resource" 'any(.policyResults[]; .fullResourceName == $resource)' "$effective_iam_policy_file" >/dev/null || {
    echo 'ERROR: Effective IAM batch omitted a protected Secret Manager resource.' >&2
    return 1
  }
}

test "${#permanent_secret_names[@]}" -eq 17 || {
  echo 'ERROR: Permanent Secret Manager inventory count drifted from 17.' >&2
  exit 1
}
test "${#deferred_secret_names[@]}" -eq 2 || {
  echo 'ERROR: Deferred Maps secret inventory count drifted from 2.' >&2
  exit 1
}

prepare_effective_secret_iam_policies
trap 'test -z "$effective_iam_policy_file" || rm -f "$effective_iam_policy_file"' EXIT

for secret_name in "${permanent_secret_names[@]}"; do
  resource_name="$(gcloud secrets describe "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)')"
  case "$resource_name" in
    "projects/$GOOGLE_CLOUD_PROJECT/secrets/$secret_name"|"projects/$project_number/secrets/$secret_name") ;;
    *)
      echo 'ERROR: Secret resource is not bound to the protected Production project.' >&2
      exit 1
      ;;
  esac

  if array_contains "$secret_name" "${deferred_secret_names[@]}"; then
    deferred_versions="$(gcloud secrets versions list "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)')"
    test -z "$deferred_versions" || {
      printf 'ERROR: Deferred Production secret %s unexpectedly has a version.\n' "$secret_name" >&2
      exit 1
    }
  else
    state="$(gcloud secrets versions describe latest --secret "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" --format='value(state)')"
    test "$state" = ENABLED || {
      echo 'ERROR: An active Production secret has no ENABLED latest version.' >&2
      exit 1
    }
  fi

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
    printf 'ERROR: Secret-level IAM differs from the exact canonical role/member allowlist for %s.\n' "$secret_name" >&2
    exit 1
  }
  verify_no_inherited_secret_access "$secret_name"
done

echo "READY: LIVE_SECRET_METADATA_COUNT=${#permanent_secret_names[@]}"
echo "READY: LIVE_SECRET_ENABLED_VERSION_COUNT=$(("${#permanent_secret_names[@]}" - "${#deferred_secret_names[@]}"))"
echo "READY: DEFERRED_SECRET_COUNT=${#deferred_secret_names[@]}"
echo "READY: LIVE_SECRET_PROJECT=$GOOGLE_CLOUD_PROJECT"
echo 'READY: BREAK_GLASS_PROJECT_OWNER_ACCESS=HUMAN_PROJECT_OWNER_ONLY'
echo 'READY: SECRET_PAYLOADS_READ=0'
echo 'NOTE: BOOTSTRAP_ADMIN_SECRET is one-time and is certified separately by Production Bootstrap Admin before mutation.'
