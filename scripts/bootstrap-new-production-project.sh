#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-me-central1}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-khedma-sy/khedmah-digital-v1}"
TF_STATE_BUCKET="${TF_STATE_BUCKET:-${GOOGLE_CLOUD_PROJECT}-khedmah-tfstate}"
TF_STATE_LOCATION="${TF_STATE_LOCATION:-$GOOGLE_CLOUD_REGION}"
TF_STATE_PREFIX="${TF_STATE_PREFIX:-khedmah/production/bootstrap}"
BOOTSTRAP_MODE="${BOOTSTRAP_MODE:-PLAN}"
BOOTSTRAP_PLAN_FILE="${BOOTSTRAP_PLAN_FILE:-}"
BOOTSTRAP_PLAN_SHA256="${BOOTSTRAP_PLAN_SHA256:-}"
BOOTSTRAP_CONFIRMATION="${BOOTSTRAP_CONFIRMATION:-}"

legacy_project="project-""94512a0e-1a5e-4bdb-87f"
legacy_number="774201""339973"
[[ "$GOOGLE_CLOUD_PROJECT" != *"$legacy_project"* && "$GOOGLE_CLOUD_PROJECT" != *"$legacy_number"* ]] || {
  echo 'ERROR: refusing to bootstrap the legacy Google project.' >&2
  exit 2
}

for command_name in gcloud terraform git jq sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command_name" >&2
    exit 3
  }
done

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

[[ -z "$(git status --porcelain)" ]] || {
  echo 'ERROR: bootstrap requires a clean repository checkout.' >&2
  exit 4
}

git fetch origin main --quiet
CURRENT_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"
[[ "$CURRENT_SHA" =~ ^[0-9a-f]{40}$ ]]
test "$CURRENT_SHA" = "$MAIN_SHA" || {
  echo 'ERROR: bootstrap is locked to the exact latest origin/main commit.' >&2
  exit 4
}
SHA7="${CURRENT_SHA:0:7}"

gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectId)' >/dev/null
gcloud config set project "$GOOGLE_CLOUD_PROJECT" >/dev/null

billing_enabled="$(gcloud billing projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(billingEnabled)' 2>/dev/null || true)"
[[ "$billing_enabled" == "True" || "$billing_enabled" == "true" ]] || {
  echo 'ERROR: billing must be linked and enabled on the new production project before bootstrap.' >&2
  exit 5
}

bucket_status() {
  local output_file error_file
  output_file="$(mktemp)"
  error_file="$(mktemp)"
  if gcloud storage buckets describe "gs://$TF_STATE_BUCKET"     --project "$GOOGLE_CLOUD_PROJECT" --format=json >"$output_file" 2>"$error_file"; then
    rm -f "$error_file"
    cat "$output_file"
    rm -f "$output_file"
    return 0
  fi
  if grep -Eiq '(NOT_FOUND|not found|404|does not exist)' "$error_file"; then
    rm -f "$output_file" "$error_file"
    return 10
  fi
  echo 'ERROR: Terraform state bucket lookup failed; refusing to classify it as absent.' >&2
  cat "$error_file" >&2
  rm -f "$output_file" "$error_file"
  return 11
}

verify_state_bucket() {
  local bucket_json expected_project_number bucket_project_number
  bucket_json="$(mktemp)"
  if bucket_status >"$bucket_json"; then
    :
  else
    local status=$?
    rm -f "$bucket_json"
    if [[ "$status" -eq 10 ]]; then
      echo 'ERROR: Terraform state bucket does not exist. Run PREPARE_STATE first.' >&2
    fi
    return 1
  fi

  expected_project_number="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectNumber)')"
  bucket_project_number="$(jq -r '.projectNumber // .project_number // empty' "$bucket_json")"
  [[ "$expected_project_number" =~ ^[0-9]+$ ]]
  test "$bucket_project_number" = "$expected_project_number" || {
    echo 'ERROR: Terraform state bucket belongs to a different Google Cloud project.' >&2
    rm -f "$bucket_json"
    return 1
  }

  jq -e --arg bucket "$TF_STATE_BUCKET" --arg location "${TF_STATE_LOCATION^^}" '
    .name == $bucket and .location == $location and
    ((.uniform_bucket_level_access == true) or (.iamConfiguration.uniformBucketLevelAccess.enabled == true)) and
    ((.public_access_prevention == "enforced") or (.iamConfiguration.publicAccessPrevention == "enforced")) and
    ((.versioning_enabled == true) or (.versioning.enabled == true))
  ' "$bucket_json" >/dev/null || {
    echo 'ERROR: Terraform state bucket protections or location do not match the approved contract.' >&2
    rm -f "$bucket_json"
    return 1
  }
  rm -f "$bucket_json"
}

verify_state_bucket_policy() {
  local expected_deployer="${1:-}"
  local policy_json
  policy_json="$(mktemp)"
  if ! gcloud storage buckets get-iam-policy "gs://$TF_STATE_BUCKET"     --project "$GOOGLE_CLOUD_PROJECT" --format=json >"$policy_json"; then
    echo 'ERROR: unable to read Terraform state bucket IAM policy.' >&2
    rm -f "$policy_json"
    return 1
  fi

  jq -e '
    [.bindings[]?.members[]?] | all(. != "allUsers" and . != "allAuthenticatedUsers")
  ' "$policy_json" >/dev/null || {
    echo 'ERROR: Terraform state bucket must not grant public IAM principals.' >&2
    rm -f "$policy_json"
    return 1
  }

  if [[ -n "$expected_deployer" ]]; then
    jq -e --arg member "serviceAccount:$expected_deployer" '
      any(.bindings[]?;
        .role == "roles/storage.objectAdmin" and
        any(.members[]?; . == $member)
      )
    ' "$policy_json" >/dev/null || {
      echo 'ERROR: Terraform state bucket is missing the deployer objectAdmin binding.' >&2
      rm -f "$policy_json"
      return 1
    }
  fi
  rm -f "$policy_json"
}

verify_bootstrap_services() {
  local enabled_apis
  enabled_apis="$(gcloud services list --enabled --project "$GOOGLE_CLOUD_PROJECT" --format='value(config.name)')"
  for api in serviceusage.googleapis.com storage.googleapis.com; do
    grep -F -x -- "$api" <<<"$enabled_apis" >/dev/null || {
      echo "ERROR: required bootstrap prerequisite API is not enabled: $api" >&2
      return 1
    }
  done
}

terraform_init() {
  terraform -chdir=infra/iac/bootstrap init     -input=false     -reconfigure     -backend-config="bucket=$TF_STATE_BUCKET"     -backend-config="prefix=$TF_STATE_PREFIX"
}

terraform_vars=(
  "-var=project_id=$GOOGLE_CLOUD_PROJECT"
  "-var=region=$GOOGLE_CLOUD_REGION"
  "-var=terraform_state_bucket_name=$TF_STATE_BUCKET"
  "-var=artifact_registry_repository_id=khedmah-digital"
  "-var=cloud_sql_instance_id=khedmah-v1-db"
  "-var=cloud_sql_database_name=khedmah"
  "-var=cloud_sql_tier=db-custom-1-3840"
  "-var=runtime_service_account_id=khedmah-v1-runtime"
  "-var=deployer_service_account_id=khedmah-v1-deployer"
  "-var=build_service_account_id=khedmah-v1-build"
  "-var=migration_service_account_id=khedmah-v1-migrator"
  "-var=github_repository=$GITHUB_REPOSITORY"
  "-var=github_workflow_path=.github/workflows/production-operator-new-account.yml"
  '-var=github_additional_workflow_paths=[".github/workflows/production-operator.yml",".github/workflows/production-baseline-001-020.yml",".github/workflows/production-bootstrap-admin.yml",".github/workflows/production-migrations-025-034.yml",".github/workflows/production-database-role-bootstrap.yml",".github/workflows/terraform-media-apply.yml",".github/workflows/terraform-media-plan.yml",".github/workflows/terraform-media-state-handoff.yml",".github/workflows/terraform-client-maps-plan.yml",".github/workflows/terraform-client-maps-apply.yml",".github/workflows/android-release-certification.yml"]'
  '-var=github_ref=refs/heads/main'
  '-var=runtime_secret_names=["DATABASE_URL","FIREBASE_API_KEY","FIREBASE_APP_ID","GOOGLE_MAPS_BROWSER_API_KEY","GOOGLE_MAPS_SERVER_API_KEY","GOOGLE_OAUTH_SERVER_CLIENT_ID","NEXT_PUBLIC_FIREBASE_API_KEY","NEXT_PUBLIC_FIREBASE_APP_ID","NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN","NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID","NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID","NEXT_PUBLIC_FIREBASE_PROJECT_ID","NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET","OPERATIONS_PRODUCT_ROLE_BINDINGS","RESEND_API_KEY"]'
)

verify_plan_target() {
  local plan_json="$1"
  jq -e     --arg project "$GOOGLE_CLOUD_PROJECT"     --arg region "$GOOGLE_CLOUD_REGION"     --arg state_bucket "$TF_STATE_BUCKET"     --arg repository "$GITHUB_REPOSITORY" '
      .variables.project_id.value == $project and
      .variables.region.value == $region and
      .variables.terraform_state_bucket_name.value == $state_bucket and
      .variables.github_repository.value == $repository and
      .variables.github_ref.value == "refs/heads/main" and
      .variables.github_workflow_path.value == ".github/workflows/production-operator-new-account.yml" and
      .variables.artifact_registry_repository_id.value == "khedmah-digital" and
      .variables.cloud_sql_instance_id.value == "khedmah-v1-db" and
      .variables.cloud_sql_database_name.value == "khedmah" and
      .variables.cloud_sql_tier.value == "db-custom-1-3840" and
      .variables.runtime_service_account_id.value == "khedmah-v1-runtime" and
      .variables.deployer_service_account_id.value == "khedmah-v1-deployer" and
      .variables.build_service_account_id.value == "khedmah-v1-build" and
      .variables.migration_service_account_id.value == "khedmah-v1-migrator" and
      ((.variables.github_additional_workflow_paths.value | sort) == ([
        ".github/workflows/android-release-certification.yml",
        ".github/workflows/production-baseline-001-020.yml",
        ".github/workflows/production-bootstrap-admin.yml",
        ".github/workflows/production-database-role-bootstrap.yml",
        ".github/workflows/production-migrations-025-034.yml",
        ".github/workflows/production-operator.yml",
        ".github/workflows/terraform-client-maps-apply.yml",
        ".github/workflows/terraform-client-maps-plan.yml",
        ".github/workflows/terraform-media-apply.yml",
        ".github/workflows/terraform-media-plan.yml",
        ".github/workflows/terraform-media-state-handoff.yml"
      ] | sort)) and
      ((.variables.runtime_secret_names.value | sort) == ([
        "DATABASE_URL",
        "FIREBASE_API_KEY",
        "FIREBASE_APP_ID",
        "GOOGLE_MAPS_BROWSER_API_KEY",
        "GOOGLE_MAPS_SERVER_API_KEY",
        "GOOGLE_OAUTH_SERVER_CLIENT_ID",
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_APP_ID",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
        "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
        "OPERATIONS_PRODUCT_ROLE_BINDINGS",
        "RESEND_API_KEY"
      ] | sort))
    ' "$plan_json" >/dev/null || {
      echo 'ERROR: bootstrap plan target does not match the canonical project/infrastructure/WIF/secret contract.' >&2
      return 1
    }
}
publish_outputs() {
  local outputs_json
  outputs_json="$(terraform -chdir=infra/iac/bootstrap output -json)"
  printf '%s\n' "$outputs_json" | jq '{
    artifact_registry_repository_id: .artifact_registry_repository_id.value,
    cloudbuild_source_bucket: .cloudbuild_source_bucket.value,
    cloud_sql_instance_connection_name: .cloud_sql_instance_connection_name.value,
    cloud_sql_database_name: .cloud_sql_database_name.value,
    runtime_service_account_email: .runtime_service_account_email.value,
    deployer_service_account_email: .deployer_service_account_email.value,
    build_service_account_email: .build_service_account_email.value,
    migration_service_account_email: .migration_service_account_email.value,
    database_migration_secret_id: .database_migration_secret_id.value,
    workload_identity_provider: .workload_identity_provider.value,
    bootstrap_admin_secret_id: .bootstrap_admin_secret_id.value,
    secret_ids: .secret_ids.value
  }'
}

case "$BOOTSTRAP_MODE" in
  PREPARE_STATE)
    expected_confirmation="PREPARE_KHEDMAH_BOOTSTRAP_STATE_${GOOGLE_CLOUD_PROJECT}_${SHA7^^}"
    test "$BOOTSTRAP_CONFIRMATION" = "$expected_confirmation" || {
      echo "ERROR: PREPARE_STATE requires confirmation: $expected_confirmation" >&2
      exit 6
    }

    gcloud services enable serviceusage.googleapis.com storage.googleapis.com       --project "$GOOGLE_CLOUD_PROJECT" --quiet

    bucket_json="$(mktemp)"
    if bucket_status >"$bucket_json"; then
      existing_location="$(jq -r '.location // empty' "$bucket_json")"
      expected_project_number="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectNumber)')"
      existing_project_number="$(jq -r '.projectNumber // .project_number // empty' "$bucket_json")"
      [[ "$expected_project_number" =~ ^[0-9]+$ ]]
      test "$existing_project_number" = "$expected_project_number" || {
        echo 'ERROR: refusing to mutate a Terraform state bucket owned by another Google Cloud project.' >&2
        rm -f "$bucket_json"
        exit 6
      }
      test "$existing_location" = "${TF_STATE_LOCATION^^}" || {
        echo 'ERROR: existing Terraform state bucket location cannot be changed safely.' >&2
        rm -f "$bucket_json"
        exit 6
      }
      rm -f "$bucket_json"
    else
      status=$?
      rm -f "$bucket_json"
      if [[ "$status" -ne 10 ]]; then
        exit 6
      fi
      gcloud storage buckets create "gs://$TF_STATE_BUCKET"         --project "$GOOGLE_CLOUD_PROJECT"         --location "$TF_STATE_LOCATION"         --uniform-bucket-level-access         --public-access-prevention         --quiet
    fi

    gcloud storage buckets update "gs://$TF_STATE_BUCKET"       --project "$GOOGLE_CLOUD_PROJECT"       --uniform-bucket-level-access       --public-access-prevention       --versioning       --quiet

    verify_bootstrap_services
    verify_state_bucket
    verify_state_bucket_policy
    echo "PREPARED: TF_STATE_BUCKET=$TF_STATE_BUCKET"
    echo "PREPARED: TF_STATE_PREFIX=$TF_STATE_PREFIX"
    echo 'NEXT: run BOOTSTRAP_MODE=PLAN from the same exact main commit.'
    ;;

  PLAN)
    verify_bootstrap_services
    verify_state_bucket
    verify_state_bucket_policy
    terraform_init
    terraform -chdir=infra/iac/bootstrap validate

    if [[ -z "$BOOTSTRAP_PLAN_FILE" ]]; then
      BOOTSTRAP_PLAN_FILE="${TMPDIR:-/tmp}/khedmah-production-bootstrap-${CURRENT_SHA}.tfplan"
    fi
    [[ "$BOOTSTRAP_PLAN_FILE" = /* ]] || {
      echo 'ERROR: BOOTSTRAP_PLAN_FILE must be an absolute path.' >&2
      exit 7
    }

    terraform -chdir=infra/iac/bootstrap plan       -input=false       -lock-timeout=60s       -out="$BOOTSTRAP_PLAN_FILE"       "${terraform_vars[@]}"

    PLAN_SHA256="$(sha256sum "$BOOTSTRAP_PLAN_FILE" | awk '{print $1}')"
    PLAN_JSON="${BOOTSTRAP_PLAN_FILE}.json"
    terraform -chdir=infra/iac/bootstrap show -json "$BOOTSTRAP_PLAN_FILE" >"$PLAN_JSON"
    verify_plan_target "$PLAN_JSON"
    jq -e '
      [(.resource_changes // [])[] | select(.change.actions | index("delete"))] | length == 0
    ' "$PLAN_JSON" >/dev/null || {
      echo 'ERROR: destructive bootstrap plan rejected.' >&2
      exit 7
    }

    echo "READY: BOOTSTRAP_PLAN=$BOOTSTRAP_PLAN_FILE"
    echo "READY: BOOTSTRAP_PLAN_SHA256=$PLAN_SHA256"
    echo "READY: TF_STATE_BUCKET=$TF_STATE_BUCKET"
    echo "READY: TF_STATE_PREFIX=$TF_STATE_PREFIX"
    echo 'NO_APPLY: review the saved plan and checksum before APPLY.'
    ;;

  APPLY)
    verify_bootstrap_services
    verify_state_bucket
    verify_state_bucket_policy
    terraform_init
    terraform -chdir=infra/iac/bootstrap validate

    test -n "$BOOTSTRAP_PLAN_FILE" || {
      echo 'ERROR: APPLY requires BOOTSTRAP_PLAN_FILE from an approved PLAN run.' >&2
      exit 8
    }
    test -s "$BOOTSTRAP_PLAN_FILE" || {
      echo 'ERROR: approved bootstrap plan file is missing or empty.' >&2
      exit 8
    }
    [[ "$BOOTSTRAP_PLAN_SHA256" =~ ^[0-9a-f]{64}$ ]] || {
      echo 'ERROR: APPLY requires the exact BOOTSTRAP_PLAN_SHA256 from PLAN.' >&2
      exit 8
    }
    actual_plan_sha256="$(sha256sum "$BOOTSTRAP_PLAN_FILE" | awk '{print $1}')"
    test "$actual_plan_sha256" = "$BOOTSTRAP_PLAN_SHA256" || {
      echo 'ERROR: bootstrap plan checksum mismatch.' >&2
      exit 8
    }
    expected_confirmation="APPLY_KHEDMAH_BOOTSTRAP_${GOOGLE_CLOUD_PROJECT}_${SHA7^^}"
    test "$BOOTSTRAP_CONFIRMATION" = "$expected_confirmation" || {
      echo "ERROR: APPLY requires confirmation: $expected_confirmation" >&2
      exit 8
    }

    plan_json="$(mktemp)"
    trap 'rm -f "$plan_json"' EXIT
    terraform -chdir=infra/iac/bootstrap show -json "$BOOTSTRAP_PLAN_FILE" >"$plan_json"
    verify_plan_target "$plan_json"
    jq -e '
      [(.resource_changes // [])[] | select(.change.actions | index("delete"))] | length == 0
    ' "$plan_json" >/dev/null || {
      echo 'ERROR: destructive bootstrap plan rejected at APPLY.' >&2
      exit 8
    }

    terraform -chdir=infra/iac/bootstrap apply       -input=false       -lock-timeout=60s       "$BOOTSTRAP_PLAN_FILE"

    deployer_email="$(terraform -chdir=infra/iac/bootstrap output -raw deployer_service_account_email)"
    [[ "$deployer_email" == *"@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" ]]
    verify_state_bucket_policy "$deployer_email"

    publish_outputs
    echo 'APPLIED: bootstrap infrastructure exists in the new Google project.'
    echo 'NEXT: inject secret VALUES as enabled Secret Manager versions; Terraform creates secret containers only.'
    echo 'NEXT: configure protected GitHub Production variables/secrets from the sanitized Terraform outputs.'
    ;;

  VERIFY)
    verify_bootstrap_services
    verify_state_bucket
    verify_state_bucket_policy
    terraform_init
    terraform -chdir=infra/iac/bootstrap validate
    deployer_email="$(terraform -chdir=infra/iac/bootstrap output -raw deployer_service_account_email)"
    [[ "$deployer_email" == *"@$GOOGLE_CLOUD_PROJECT.iam.gserviceaccount.com" ]]
    verify_state_bucket_policy "$deployer_email"
    publish_outputs
    echo 'VERIFIED: bootstrap state, IAM and sanitized outputs are readable from the exact latest main commit.'
    ;;

  *)
    echo 'ERROR: BOOTSTRAP_MODE must be one of PREPARE_STATE, PLAN, APPLY, VERIFY.' >&2
    exit 9
    ;;
esac
