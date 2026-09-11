# Google Cloud staging deployment

This runbook builds the bounded backend and frontend images with Cloud Build and deploys them directly to the isolated Staging project. It does not use the Cloud Run console wizard, does not expose secret values, and does not authorize Production deployment.

## Bootstrap boundary

`infra/iac/bootstrap` prepares only the shared Staging foundation: required Google APIs, Artifact Registry, runtime/deployer service accounts, Workload Identity Federation, runtime secret **containers**, and the minimum IAM needed for deployment/runtime access. It does not create a Cloud SQL database instance, populate secret values, create the media bucket, apply application migrations, or deploy Cloud Run services.

The bootstrap API set includes Cloud Run, Cloud Build, Artifact Registry, Secret Manager and Cloud SQL Admin. The runtime identity receives `roles/cloudsql.client`; the deployer receives read-only Cloud SQL and Service Usage visibility in addition to its existing deployment roles. Secret values continue to be managed outside Terraform.

For an existing project with manually created resources, import/reconcile them before applying Terraform. Do not create duplicate resources or overwrite an existing secret value merely to satisfy the bootstrap stack.

## Required protected Staging configuration

The protected `staging` GitHub environment must define isolated Staging identities and resource references. In addition to the development/preview/production separation variables, the deployment requires:

- `STAGING_GOOGLE_CLOUD_PROJECT`
- `STAGING_GOOGLE_CLOUD_PROJECT_NUMBER`
- `GOOGLE_CLOUD_REGION`
- `STAGING_ARTIFACT_REPOSITORY`
- `STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME`
- `STAGING_GCS_MEDIA_BUCKET`
- `STAGING_EMAIL_FROM`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT`
- `GCP_STAGING_RUNTIME_SERVICE_ACCOUNT`

The Cloud SQL connection name must belong to the selected Staging project and region. The project, Firebase project, WIF provider and service accounts must remain isolated from Preview and Production.

## Required Secret Manager versions

Before deployment, Staging must have an enabled `latest` version for the runtime/build secrets used by the current source:

- `DATABASE_URL`
- `OPERATIONS_PRODUCT_ROLE_BINDINGS`
- `FIREBASE_API_KEY`
- `RESEND_API_KEY`
- `GOOGLE_MAPS_BROWSER_API_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

The repository never prints these values. `scripts/deployment/validate-staging-cloud-resources.sh` checks only API/resource metadata and secret-version state after WIF authentication; it never calls `secrets versions access`, never enables an API, and never creates or updates a cloud resource.

## Cloud resources that must already exist

The following are deployment prerequisites, not side effects of the application deployment workflow:

1. The Artifact Registry repository in the selected Staging region.
2. A Cloud SQL instance matching `STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME`.
3. The Staging database and valid `DATABASE_URL` secret value.
4. A private media bucket referenced by `STAGING_GCS_MEDIA_BUCKET`, with the runtime identity authorized for the required object operations.
5. Enabled secret versions listed above.

The cloud-resource preflight verifies the first, second and secret-version state. Bucket existence/IAM is deliberately proved through authenticated media acceptance after deployment rather than by granting the deployer unnecessary storage permissions.

## Deployment flow

The GitHub Staging workflow runs, in order:

1. source build/tests/security/deployment contract gates against disposable PostgreSQL;
2. protected configuration validation **before** Google authentication;
3. WIF authentication into the isolated Staging project;
4. environment-separation validation;
5. read-only cloud-resource preflight;
6. optional Classifieds 025 verification/apply stage according to its protected rollout marker;
7. backend image build;
8. read-only release data-integrity Cloud Run Job;
9. backend service deployment;
10. frontend build using the authoritative backend URL;
11. frontend deployment;
12. backend `CORS_ORIGIN` and `NEXT_PUBLIC_SITE_URL` binding to the authoritative Staging frontend URL;
13. backend/frontend health and credentialed CORS preflight;
14. six runtime health observations and, when enabled, Classifieds browser acceptance.

The backend Staging revision receives persistent Cloud SQL plus these production-like runtime bindings:

- `DATABASE_URL`
- `OPERATIONS_PRODUCT_ROLE_BINDINGS`
- `FIREBASE_API_KEY`
- `RESEND_API_KEY`
- `GCS_MEDIA_BUCKET`
- `EMAIL_FROM`

This is required for authenticated admin/reviewer acceptance, social sign-in verification, verification/recovery mail, and persistent media behavior. A Staging backend that only returns a green `/health` response without these bindings is not accepted as a production-like test environment.

Taxi trips remain explicitly disabled by this deployment path while the Taxi SQL is candidate-only. Preview/Staging deployment refuses `TAXI_TRIPS_ENABLED=true` until a reviewed migration/role/rollback path replaces the candidate schema.

## Manual operator path

For a controlled manual Staging deployment from the repository root, select only the isolated Staging project and export the same protected references used by CI:

```bash
export GOOGLE_CLOUD_PROJECT="YOUR_STAGING_PROJECT_ID"
export GOOGLE_CLOUD_REGION="YOUR_STAGING_REGION"
export ARTIFACT_REPOSITORY="YOUR_STAGING_ARTIFACT_REPOSITORY"
export RUNTIME_SERVICE_ACCOUNT="YOUR_STAGING_RUNTIME_SERVICE_ACCOUNT"
export CLOUD_SQL_INSTANCE_CONNECTION_NAME="YOUR_STAGING_PROJECT_ID:YOUR_STAGING_REGION:YOUR_STAGING_SQL_INSTANCE"
export GCS_MEDIA_BUCKET="YOUR_STAGING_MEDIA_BUCKET"
export EMAIL_FROM="YOUR_VERIFIED_STAGING_SENDER"
export PRODUCTION_GOOGLE_CLOUD_PROJECT="YOUR_PRODUCTION_PROJECT_ID_FOR_EXCLUSION"

scripts/deployment/validate-staging-cloud-resources.sh
scripts/deployment/deploy-cloud-run-environment.sh staging "$(git rev-parse HEAD)"
```

Do not paste secret payloads into shell history. The deployment script references Secret Manager by secret name only.

## Acceptance boundary

A successful deploy proves only the executed deployment and health checks. Before Staging can satisfy the release gate, use test-only accounts to exercise registration/login/recovery or approved external sign-in, owner media persistence across service revisions, owner/reviewer/admin authorization including multi-admin conflict handling, and any enabled Classifieds flows. Media acceptance must prove that an uploaded object remains readable after a new instance/revision rather than relying on process-local storage.

The Staging frontend URL can be used as `STAGING_FRONTEND_URL` for the protected Preview visual baseline only after this environment is healthy and approved. Never substitute Production or Preview as that baseline.

Database provisioning, destructive account-deletion lifecycle, Taxi candidate-schema promotion, custom Production domains, and Production deployment remain outside this runbook.
