#!/usr/bin/env bash
set -euo pipefail
set +x

: "${STAGING_GOOGLE_CLOUD_PROJECT:?STAGING_GOOGLE_CLOUD_PROJECT is required}"
GOOGLE_CLOUD_REGION="${GOOGLE_CLOUD_REGION:-me-central1}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-khedma-sy/khedmah-digital-v1}"

for command_name in gcloud jq; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $command_name" >&2
    exit 3
  }
done

project="$STAGING_GOOGLE_CLOUD_PROJECT"
project_number="$(gcloud projects describe "$project" --format='value(projectNumber)')"
[[ "$project_number" =~ ^[0-9]+$ ]] || {
  echo 'ERROR: unable to resolve Staging project number.' >&2
  exit 4
}

if [[ -n "${PRODUCTION_GOOGLE_CLOUD_PROJECT:-}" && "$project" == "$PRODUCTION_GOOGLE_CLOUD_PROJECT" ]]; then
  echo 'ERROR: refusing to inspect Production as Staging.' >&2
  exit 5
fi

exact_runtime="khedmah-v1-staging-runtime@${project}.iam.gserviceaccount.com"
exact_deployer="khedmah-v1-staging-deployer@${project}.iam.gserviceaccount.com"
service_accounts="$(gcloud iam service-accounts list --project "$project" --format='value(email)')"

runtime_sa=''
deployer_sa=''
if grep -F -x "$exact_runtime" <<<"$service_accounts" >/dev/null; then
  runtime_sa="$exact_runtime"
elif [[ -n "${GCP_STAGING_RUNTIME_SERVICE_ACCOUNT:-}" ]] && grep -F -x "$GCP_STAGING_RUNTIME_SERVICE_ACCOUNT" <<<"$service_accounts" >/dev/null; then
  runtime_sa="$GCP_STAGING_RUNTIME_SERVICE_ACCOUNT"
fi
if grep -F -x "$exact_deployer" <<<"$service_accounts" >/dev/null; then
  deployer_sa="$exact_deployer"
elif [[ -n "${GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT:-}" ]] && grep -F -x "$GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT" <<<"$service_accounts" >/dev/null; then
  deployer_sa="$GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT"
fi

provider=''
pool_name="projects/${project_number}/locations/global/workloadIdentityPools/khedmah-github"
if gcloud iam workload-identity-pools describe khedmah-github   --location=global --project "$project" --format='value(name)' >/dev/null 2>&1; then
  provider="$(gcloud iam workload-identity-pools providers describe github-actions     --workload-identity-pool=khedmah-github     --location=global     --project "$project"     --format='value(name)' 2>/dev/null || true)"
fi

artifact_candidates="$(gcloud artifacts repositories list   --project "$project"   --location "$GOOGLE_CLOUD_REGION"   --format='value(name)' 2>/dev/null || true)"
artifact_repository=''
if [[ -n "${STAGING_ARTIFACT_REPOSITORY:-}" ]]; then
  if grep -F "/repositories/${STAGING_ARTIFACT_REPOSITORY}" <<<"$artifact_candidates" >/dev/null; then
    artifact_repository="$STAGING_ARTIFACT_REPOSITORY"
  fi
else
  ids="$(sed -n 's#^.*/repositories/##p' <<<"$artifact_candidates" | sed '/^$/d')"
  if [[ "$(wc -l <<<"$ids" | tr -d ' ')" == "1" ]]; then artifact_repository="$ids"; fi
fi

sql_candidates="$(gcloud sql instances list   --project "$project"   --filter="region=$GOOGLE_CLOUD_REGION"   --format='value(connectionName)' 2>/dev/null || true)"
sql_connection=''
if [[ -n "${STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME:-}" ]]; then
  if grep -F -x "$STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME" <<<"$sql_candidates" >/dev/null; then
    sql_connection="$STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME"
  fi
else
  sql_count="$(sed '/^$/d' <<<"$sql_candidates" | wc -l | tr -d ' ')"
  if [[ "$sql_count" == "1" ]]; then sql_connection="$(sed '/^$/d' <<<"$sql_candidates")"; fi
fi

bucket_rows="$(gcloud storage buckets list   --project "$project"   --format='value(name,location)' 2>/dev/null || true)"
media_bucket=''
if [[ -n "${STAGING_GCS_MEDIA_BUCKET:-}" ]]; then
  if awk '{print $1}' <<<"$bucket_rows" | grep -F -x "$STAGING_GCS_MEDIA_BUCKET" >/dev/null; then
    media_bucket="$STAGING_GCS_MEDIA_BUCKET"
  fi
else
  media_candidates="$(awk '{print $1}' <<<"$bucket_rows" | grep -Ei 'media' || true)"
  if [[ "$(sed '/^$/d' <<<"$media_candidates" | wc -l | tr -d ' ')" == "1" ]]; then
    media_bucket="$(sed '/^$/d' <<<"$media_candidates")"
  fi
fi

identity_state="$(gcloud services describe identitytoolkit.googleapis.com   --project "$project" --format='value(state)' 2>/dev/null || true)"
firebase_project_id=''
if [[ "$identity_state" == "ENABLED" ]]; then firebase_project_id="$project"; fi

required_secrets=(
  DATABASE_URL
  OPERATIONS_PRODUCT_ROLE_BINDINGS
  FIREBASE_API_KEY
  RESEND_API_KEY
  GOOGLE_MAPS_BROWSER_API_KEY
  NEXT_PUBLIC_FIREBASE_API_KEY
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  NEXT_PUBLIC_FIREBASE_PROJECT_ID
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  NEXT_PUBLIC_FIREBASE_APP_ID
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
)
missing_secret_versions=()
enabled_secret_versions=()
for secret_name in "${required_secrets[@]}"; do
  state="$(gcloud secrets versions describe latest     --secret "$secret_name"     --project "$project"     --format='value(state)' 2>/dev/null || true)"
  if [[ "$state" == "ENABLED" ]]; then
    enabled_secret_versions+=("$secret_name")
  else
    missing_secret_versions+=("$secret_name")
  fi
done

printf 'STAGING_DISCOVERY_PROJECT=%s\n' "$project"
printf 'STAGING_GOOGLE_CLOUD_PROJECT_NUMBER=%s\n' "$project_number"
printf 'GOOGLE_CLOUD_REGION=%s\n' "$GOOGLE_CLOUD_REGION"
printf 'GCP_WORKLOAD_IDENTITY_PROVIDER=%s\n' "${provider:-UNRESOLVED}"
printf 'GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT=%s\n' "${deployer_sa:-UNRESOLVED}"
printf 'GCP_STAGING_RUNTIME_SERVICE_ACCOUNT=%s\n' "${runtime_sa:-UNRESOLVED}"
printf 'STAGING_ARTIFACT_REPOSITORY=%s\n' "${artifact_repository:-UNRESOLVED}"
printf 'STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME=%s\n' "${sql_connection:-UNRESOLVED}"
printf 'STAGING_GCS_MEDIA_BUCKET=%s\n' "${media_bucket:-UNRESOLVED}"
printf 'STAGING_FIREBASE_PROJECT_ID=%s\n' "${firebase_project_id:-UNRESOLVED}"
printf 'STAGING_EMAIL_FROM=%s\n' "${STAGING_EMAIL_FROM:-UNRESOLVED}"
printf 'ENABLED_STAGING_SECRET_VERSIONS=%s\n' "$(IFS=,; echo "${enabled_secret_versions[*]}")"
printf 'MISSING_STAGING_SECRET_VERSIONS=%s\n' "$(IFS=,; echo "${missing_secret_versions[*]}")"

unresolved=()
[[ -n "$provider" ]] || unresolved+=(GCP_WORKLOAD_IDENTITY_PROVIDER)
[[ -n "$deployer_sa" ]] || unresolved+=(GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT)
[[ -n "$runtime_sa" ]] || unresolved+=(GCP_STAGING_RUNTIME_SERVICE_ACCOUNT)
[[ -n "$artifact_repository" ]] || unresolved+=(STAGING_ARTIFACT_REPOSITORY)
[[ -n "$sql_connection" ]] || unresolved+=(STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME)
[[ -n "$media_bucket" ]] || unresolved+=(STAGING_GCS_MEDIA_BUCKET)
[[ -n "$firebase_project_id" ]] || unresolved+=(STAGING_FIREBASE_PROJECT_ID)
[[ -n "${STAGING_EMAIL_FROM:-}" ]] || unresolved+=(STAGING_EMAIL_FROM)
(("${#missing_secret_versions[@]}" == 0)) || unresolved+=(SECRET_MANAGER_LATEST_VERSIONS)

# These separation values cannot be derived safely from the Staging project alone.
for name in   DEVELOPMENT_GOOGLE_CLOUD_PROJECT PREVIEW_GOOGLE_CLOUD_PROJECT PRODUCTION_GOOGLE_CLOUD_PROJECT   DEVELOPMENT_FIREBASE_PROJECT_ID PREVIEW_FIREBASE_PROJECT_ID PRODUCTION_FIREBASE_PROJECT_ID; do
  [[ -n "${!name:-}" ]] || unresolved+=("$name")
done

if (("${#unresolved[@]}" > 0)); then
  printf 'UNRESOLVED_STAGING_GITHUB_CONFIGURATION=%s\n' "$(IFS=,; echo "${unresolved[*]}")"
  exit 2
fi

echo 'READY: Staging metadata and Secret Manager version states are sufficient for GitHub environment wiring.'
