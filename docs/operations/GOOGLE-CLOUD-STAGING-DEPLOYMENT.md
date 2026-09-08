# Google Cloud staging deployment

This runbook builds the bounded V1 backend and frontend images with Cloud Build and deploys them directly to Cloud Run. It does not use the Cloud Run console wizard and does not store credentials, secrets, or deployment URLs in the repository.

## One-time project setup

Set the values for the target project and operator-selected immutable image tag. The tag should identify the source revision being deployed.

```bash
export PROJECT_ID="YOUR_GOOGLE_CLOUD_PROJECT_ID"
export REGION="me-central1"
export REPOSITORY="khedmah-staging"
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"

gcloud config set project "${PROJECT_ID}"
gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com
gcloud artifacts repositories describe "${REPOSITORY}" --location="${REGION}" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "${REPOSITORY}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Khedmah Digital staging images"
```

The operator must have permission to submit builds, upload images, deploy Cloud Run services, and change the public invoker policy. Organization policy may prohibit public invocation; in that case, omit `--allow-unauthenticated` rather than weakening the policy.

## Deploy the matching backend and frontend

Use the shared, tested deployment script from the repository root. Supply the isolated Staging project, region, runtime identity and existing Cloud SQL connection name. The connection must belong to the same project and region; the script refuses the Production project before making cloud calls.

```bash
export GOOGLE_CLOUD_PROJECT="${PROJECT_ID}"
export GOOGLE_CLOUD_REGION="${REGION}"
export ARTIFACT_REPOSITORY="${REPOSITORY}"
export RUNTIME_SERVICE_ACCOUNT="YOUR_STAGING_RUNTIME_SERVICE_ACCOUNT"
export CLOUD_SQL_INSTANCE_CONNECTION_NAME="${PROJECT_ID}:${REGION}:YOUR_STAGING_SQL_INSTANCE"
export PRODUCTION_GOOGLE_CLOUD_PROJECT="YOUR_PRODUCTION_PROJECT_ID_FOR_EXCLUSION"
scripts/deployment/deploy-cloud-run-environment.sh staging "${IMAGE_TAG}"
```

The existing `DATABASE_URL` secret must reference the isolated Staging database, and the runtime identity must already have permission to access that secret and connect to that Cloud SQL instance. This procedure references the secret by name; it does not create it or print its value. Staging's Firebase and Maps build values must also already exist in that project's Secret Manager.

The script builds and deploys the backend with `cloudbuild.staging-backend.yaml`, reads its authoritative Cloud Run URL, then passes that URL to `cloudbuild.staging.yaml` as the frontend's `NEXT_PUBLIC_API_URL` build argument. Next.js embeds this public value during the build; setting it only on an already-built frontend revision is insufficient.

After deploying the frontend, the script reads its authoritative URL and sets the backend's `CORS_ORIGIN` to that exact origin. Both health checks and a credentialed-origin OPTIONS preflight must pass before the script reports success. HTTPS Preview and Staging session cookies use Secure and SameSite=None; the CSRF origin middleware requires the configured isolated frontend origin.

For GitHub deployment, configure `STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME` in the protected `staging` environment. The workflow supplies disposable PostgreSQL to all tests, preserving the destructive-test guard. Deployment still requires an approved push to `develop` and the environment's existing review policy. A passing mocked deployment-flow test does not establish that Staging resources or permissions are provisioned.

## Deployment boundary

The two build files create and push application containers only. The `gcloud run deploy` commands create new revisions and move traffic through Cloud Run. Database provisioning, migrations, secret creation, custom domains, and production deployment remain outside this staging runbook.

