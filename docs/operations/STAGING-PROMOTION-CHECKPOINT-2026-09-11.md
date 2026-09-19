# Khedmah Staging promotion checkpoint — 2026-09-11

This checkpoint is the operational handoff for the current release candidate. It records verified repository state and the exact external Staging blocker without changing product scope or Production state.

## Current source of truth

- Repository: `khedma-sy/khedmah-digital-v1`.
- Pull request: `#166`.
- Release-candidate branch: `design-system-repair-2026-09-07`.
- Verified release-candidate head before this checkpoint update: `30545eb30dc5ea7e46ffd4cab22267fb511d2ad9`.
- `develop` is identical to that release-candidate head.
- `main` remains at `5be289edba5b8c6d5238e014e9031dcacf321baa`; the release candidate is 295 commits ahead and 0 behind.
- PR #166 is mergeable but remains a draft until the Staging release gates are satisfied.

## Verified checks on the release candidate

On `30545eb30dc5ea7e46ffd4cab22267fb511d2ad9`:

- Node.js CI: passed on Node 24 LTS.
- Khedmah Test & Verify: passed.
- Database Migration Validation: passed.
- Identity production readiness repository gate: passed.
- Google production readiness repository gate: passed.
- PR Preview quality gates and Google Cloud deployment: passed.
- Preview anonymous browser evidence: 40/40 scenarios passed.
- Preview mobile assistant interactions: 20/20 passed.
- Classifieds Preview read-only acceptance: passed; frontend, same-origin proxy and direct backend all returned HTTP 200.

The PR Preview workflow remains red only because the genuine before/baseline URL is missing: `BEFORE_URL_MISSING`. Production or Preview must never be substituted for the required Staging baseline.

## Staging result on the same source

Staging run `34559876241` executed from `develop` at the same SHA.

- Staging `quality-gates` passed: build, full tests, lint, high-severity npm audit gate, Firebase validation, Google validation, deployment-contract validation and secret-usage validation.
- `deploy-staging` stopped at `Validate Staging deployment configuration` before Workload Identity authentication and before any Google Cloud mutation.
- Google authentication, resource preflight, rollout, deployment and Staging browser acceptance were therefore correctly skipped.

The protected GitHub `staging` environment supplied none of these required values:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_STAGING_DEPLOYER_SERVICE_ACCOUNT`
- `GCP_STAGING_RUNTIME_SERVICE_ACCOUNT`
- `DEVELOPMENT_GOOGLE_CLOUD_PROJECT`
- `PREVIEW_GOOGLE_CLOUD_PROJECT`
- `STAGING_GOOGLE_CLOUD_PROJECT`
- `STAGING_GOOGLE_CLOUD_PROJECT_NUMBER`
- `PRODUCTION_GOOGLE_CLOUD_PROJECT`
- `DEVELOPMENT_FIREBASE_PROJECT_ID`
- `PREVIEW_FIREBASE_PROJECT_ID`
- `STAGING_FIREBASE_PROJECT_ID`
- `PRODUCTION_FIREBASE_PROJECT_ID`
- `GOOGLE_CLOUD_REGION`
- `STAGING_ARTIFACT_REPOSITORY`
- `STAGING_CLOUD_SQL_INSTANCE_CONNECTION_NAME`
- `STAGING_GCS_MEDIA_BUCKET`
- `STAGING_EMAIL_FROM`

This is an environment/bootstrap blocker, not a code failure. The validator remains fail-closed.

## Staging bootstrap boundary

`infra/iac/bootstrap` can create or reconcile the Staging foundation after a real isolated Staging Google Cloud project is selected and verified. Its outputs provide:

- Artifact Registry identity/URL.
- Staging deployer service-account email.
- Staging runtime service-account email.
- Workload Identity Provider resource name.
- Workload Identity project number.
- Secret Manager secret container IDs.

The bootstrap intentionally does not invent or provision the application database, secret payloads, private media bucket, verified email sender, migrations or Cloud Run application deployment. `infra/iac/bootstrap/staging.tfvars.example` therefore keeps `project_id = "REPLACE_WITH_ISOLATED_STAGING_PROJECT_ID"`; no real Staging project ID is committed in the repository.

The current GitHub connector can modify repository source and Actions runs but does not expose environment-variable or secret administration APIs. Protected Staging values must therefore come from verified infrastructure/admin configuration, not from guessed, Preview or Production identities.

## Promotion order

The release order remains fixed:

1. Select/verify the isolated Staging Google Cloud/Firebase project and prerequisites.
2. Apply/reconcile the Staging bootstrap foundation and required persistent resources/secrets.
3. Populate the protected GitHub `staging` environment from verified outputs and resource identities.
4. Rerun Staging Deployment and collect runtime/data-integrity/authenticated acceptance evidence.
5. Bind the healthy approved Staging frontend as `STAGING_FRONTEND_URL` for Preview visual comparison.
6. Rerun PR Preview and require the genuine before/after gate to pass.
7. Only then move PR #166 out of draft and merge to `main` while preserving history.
8. Run Production readiness review against the exact merged `main` SHA; Production deployment remains a separate explicit operation.

`TAXI_TRIPS_ENABLED` stays false while Taxi SQL is candidate-only. Classifieds migration `025` remains governed by its non-production staged migration/feature-flag contract.

No Production deployment, Production migration, DNS cutover or production feature enablement is authorized by this checkpoint.

## Rollback references

Preserve these references until Production acceptance is complete:

- `backup/design-system-repair-2026-09-11`
- `backup/develop-before-staging-2026-09-11`
- `backup/design-system-repair-node24-2026-09-11` (points to `30545eb30dc5ea7e46ffd4cab22267fb511d2ad9`)
