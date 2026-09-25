#!/usr/bin/env bash
set -euo pipefail

# Reject stale hosting configuration before any cloud call.
if [[ "${GOOGLE_CLOUD_REGION:-}" != "europe-west1" ]]; then
  echo "ERROR: GOOGLE_CLOUD_REGION must be europe-west1 for approved Production operations." >&2
  exit 64
fi
if [[ "${GCS_MEDIA_LOCATION:-}" != "europe-west1" ]]; then
  echo "ERROR: GCS_MEDIA_LOCATION must be europe-west1 for approved Production operations." >&2
  exit 64
fi

: "${GOOGLE_CLOUD_PROJECT:?GOOGLE_CLOUD_PROJECT is required}"
: "${GOOGLE_CLOUD_REGION:?GOOGLE_CLOUD_REGION is required}"
: "${OPERATIONS_RUNTIME_SERVICE_ACCOUNT:?OPERATIONS_RUNTIME_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_BUILD_SERVICE_ACCOUNT:?OPERATIONS_BUILD_SERVICE_ACCOUNT is required}"
: "${OPERATIONS_MIGRATION_SERVICE_ACCOUNT:?OPERATIONS_MIGRATION_SERVICE_ACCOUNT is required}"
: "${GCS_MEDIA_BUCKET:?GCS_MEDIA_BUCKET is required}"
: "${GCS_MEDIA_LOCATION:?GCS_MEDIA_LOCATION is required}"

AR_REPOSITORY="${OPERATIONS_ARTIFACT_REPOSITORY:-khedmah-digital}"
BACKEND_SERVICE="${OPERATIONS_BACKEND_SERVICE:-backend}"
FRONTEND_SERVICE="${OPERATIONS_FRONTEND_SERVICE:-frontend}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE_CONNECTION_NAME:?CLOUD_SQL_INSTANCE_CONNECTION_NAME is required}"
SOURCE_BUCKET="${GOOGLE_CLOUD_PROJECT}-cloudbuild-source"

if [[ "$CLOUD_SQL_INSTANCE" != "${GOOGLE_CLOUD_PROJECT}:${GOOGLE_CLOUD_REGION}:"* ]]; then
  echo "ERROR: Cloud SQL connection name is outside the approved project or region." >&2
  exit 1
fi

required_apis=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  identitytoolkit.googleapis.com
  run.googleapis.com
  secretmanager.googleapis.com
  sqladmin.googleapis.com
  storage.googleapis.com
)
enabled_apis="$(gcloud services list --enabled --project "$GOOGLE_CLOUD_PROJECT" --format='value(config.name)')"
for api in "${required_apis[@]}"; do
  grep -F -x -- "$api" <<<"$enabled_apis" >/dev/null || {
    echo "ERROR: Required API is not enabled: $api" >&2
    exit 1
  }
done

[[ "$OPERATIONS_BUILD_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo "ERROR: Build service account is outside the approved project." >&2
  exit 1
}
BUILD_SERVICE_ACCOUNT="$OPERATIONS_BUILD_SERVICE_ACCOUNT"
gcloud iam service-accounts describe "$BUILD_SERVICE_ACCOUNT" --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null
[[ "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo "ERROR: Migration service account is outside the approved project." >&2
  exit 1
}
gcloud iam service-accounts describe "$OPERATIONS_MIGRATION_SERVICE_ACCOUNT" --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null
[[ "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" == *"@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" ]] || {
  echo "ERROR: Runtime service account is outside the approved project." >&2
  exit 1
}
gcloud iam service-accounts describe "$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" --project "$GOOGLE_CLOUD_PROJECT" --format='value(email)' >/dev/null
gcloud storage buckets describe "gs://${SOURCE_BUCKET}" --project "$GOOGLE_CLOUD_PROJECT" --format='value(name)' >/dev/null
test "$GCS_MEDIA_BUCKET" != "$SOURCE_BUCKET" || {
  echo "ERROR: Media bucket must not reuse the Cloud Build source bucket." >&2
  exit 1
}
MEDIA_BUCKET_JSON="$(mktemp)"
MEDIA_POLICY_JSON="$(mktemp)"
trap 'rm -f "$MEDIA_BUCKET_JSON" "$MEDIA_POLICY_JSON"' EXIT
EXPECTED_PROJECT_NUMBER="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectNumber)')"
[[ "$EXPECTED_PROJECT_NUMBER" =~ ^[0-9]+$ ]]
MEDIA_BUCKET_IN_PROJECT="$(gcloud storage buckets list   --project "$GOOGLE_CLOUD_PROJECT"   --filter="name=${GCS_MEDIA_BUCKET}"   --format='value(name)' | head -n1)"
test "$MEDIA_BUCKET_IN_PROJECT" = "$GCS_MEDIA_BUCKET" || {
  echo "ERROR: Media bucket is not owned by the approved Google Cloud project." >&2
  exit 1
}
gcloud storage buckets describe "gs://${GCS_MEDIA_BUCKET}" --project "$GOOGLE_CLOUD_PROJECT" --format=json > "$MEDIA_BUCKET_JSON"
jq -e --arg bucket "$GCS_MEDIA_BUCKET" --arg location "${GCS_MEDIA_LOCATION^^}" '
  .name == $bucket and .location == $location and
  ((.uniform_bucket_level_access == true) or (.iamConfiguration.uniformBucketLevelAccess.enabled == true)) and
  ((.public_access_prevention == "enforced") or (.iamConfiguration.publicAccessPrevention == "enforced")) and
  ((.versioning_enabled == true) or (.versioning.enabled == true))
' "$MEDIA_BUCKET_JSON" >/dev/null || {
  echo "ERROR: Media bucket metadata does not match the approved private Production contract." >&2
  exit 1
}
gcloud storage buckets get-iam-policy "gs://${GCS_MEDIA_BUCKET}" --format=json > "$MEDIA_POLICY_JSON"
jq -e --arg member "serviceAccount:$OPERATIONS_RUNTIME_SERVICE_ACCOUNT" '
  any(.bindings[]?; .role == "roles/storage.objectAdmin" and any(.members[]?; . == $member)) and
  ([.bindings[]?.members[]?] | all(. != "allUsers" and . != "allAuthenticatedUsers"))
' "$MEDIA_POLICY_JSON" >/dev/null || {
  echo "ERROR: Media bucket IAM is public or missing the runtime objectAdmin binding." >&2
  exit 1
}
gcloud artifacts repositories describe "$AR_REPOSITORY" \
  --project "$GOOGLE_CLOUD_PROJECT" --location "$GOOGLE_CLOUD_REGION" \
  --format='value(name)' >/dev/null
missing_services=()
for service in "$BACKEND_SERVICE" "$FRONTEND_SERVICE"; do
  describe_err="$(mktemp)"
  if service_name="$(gcloud run services describe "$service" \
    --project "$GOOGLE_CLOUD_PROJECT" --region "$GOOGLE_CLOUD_REGION" \
    --format='value(metadata.name)' 2>"$describe_err")"; then
    test "$service_name" = "$service" || {
      echo "ERROR: Cloud Run service identity mismatch for $service." >&2
      rm -f "$describe_err"
      exit 1
    }
    rm -f "$describe_err"
  elif grep -Eiq '(NOT_FOUND|not found|Cannot find service|404)' "$describe_err"; then
    missing_services+=("$service")
    rm -f "$describe_err"
  else
    echo "ERROR: Cloud Run service lookup failed for $service; refusing to classify it as missing." >&2
    cat "$describe_err" >&2
    rm -f "$describe_err"
    exit 1
  fi
done
if (( ${#missing_services[@]} == 1 )); then
  echo "ERROR: Production Cloud Run service pair is inconsistent; exactly one service is missing: ${missing_services[*]}" >&2
  exit 1
fi
if (( ${#missing_services[@]} == 2 )); then
  echo "READY: FIRST_DEPLOY_MISSING_SERVICES=${missing_services[*]}"
else
  echo "READY: CLOUD_RUN_SERVICES=${BACKEND_SERVICE},${FRONTEND_SERVICE}"
fi

SQL_INSTANCE_NAME="${CLOUD_SQL_INSTANCE##*:}"
SQL_INSTANCE_REGION="$(gcloud sql instances describe "$SQL_INSTANCE_NAME" \
  --project "$GOOGLE_CLOUD_PROJECT" --format='value(region)')"
if [[ "$SQL_INSTANCE_REGION" != "$GOOGLE_CLOUD_REGION" ]]; then
  echo "ERROR: Cloud SQL instance region does not match GOOGLE_CLOUD_REGION." >&2
  exit 1
fi
required_secrets=(
  DATABASE_URL
  DATABASE_MIGRATION_URL
  FIREBASE_API_KEY
  FIREBASE_APP_ID
  GOOGLE_MAPS_ANDROID_API_KEY
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
for secret_name in "${required_secrets[@]}"; do
  state="$(gcloud secrets versions describe latest \
    --secret "$secret_name" --project "$GOOGLE_CLOUD_PROJECT" \
    --format='value(state)')"
  if [[ "$state" != "ENABLED" ]]; then
    echo "ERROR: Secret has no enabled latest version: $secret_name" >&2
    exit 1
  fi
done

echo "READY: DEPLOYMENT_PREREQUISITES=${GOOGLE_CLOUD_PROJECT}/${GOOGLE_CLOUD_REGION}"
echo "READY: CLOUD_BUILD_SERVICE_ACCOUNT=${BUILD_SERVICE_ACCOUNT}"
echo "READY: MEDIA_BUCKET=${GCS_MEDIA_BUCKET}/${GCS_MEDIA_LOCATION}"
echo "READY: SECRET_METADATA_COUNT=${#required_secrets[@]}"
