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

## Build both images

Submit the repository root as the build context. The explicit substitutions keep the pushed image names identical to those in the deployment commands.

```bash
gcloud builds submit . \
  --config=cloudbuild.staging.yaml \
  --substitutions="_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_TAG=${IMAGE_TAG}"
```

## Deploy the backend

This command deploys the exact backend image produced above, uses Cloud Run's required port, and configures the existing application environment variables without opening the UI wizard.

```bash
gcloud run deploy khedmah-backend-staging \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/backend:${IMAGE_TAG}" \
  --region="${REGION}" \
  --platform=managed \
  --port=8080 \
  --set-env-vars="NODE_ENV=staging,APP_VERSION=${IMAGE_TAG}" \
  --allow-unauthenticated \
  --quiet
```

Capture the authoritative backend URL returned by Cloud Run and verify its health endpoint:

```bash
export BACKEND_URL="$(gcloud run services describe khedmah-backend-staging --region="${REGION}" --format='value(status.url)')"
curl --fail --silent --show-error "${BACKEND_URL}/api/v1/health"
```

## Deploy the frontend

Deploy the frontend only after the backend health check passes:

```bash
gcloud run deploy khedmah-frontend-staging \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/frontend:${IMAGE_TAG}" \
  --region="${REGION}" \
  --platform=managed \
  --port=8080 \
  --allow-unauthenticated \
  --quiet
```

Retrieve and verify the frontend URL:

```bash
export FRONTEND_URL="$(gcloud run services describe khedmah-frontend-staging --region="${REGION}" --format='value(status.url)')"
curl --fail --silent --show-error "${FRONTEND_URL}/"
```

## Deployment boundary

The build file creates and pushes application containers only. The `gcloud run deploy` commands create new revisions and move traffic through Cloud Run. Database provisioning, migrations, secret creation, custom domains, and production deployment remain outside this staging runbook.

