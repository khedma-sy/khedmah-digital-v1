# Preview replacement plan — 2026-10-12

Status: preparation complete; cloud prerequisites pending. No replacement project has been created.

## Owner direction and source

The owner asked why a new Preview could not replace the inaccessible project, then instructed «أبدأ» at 2026-10-12T14:38:46+03:00. Proceed with replacement preparation and prerequisite reads under the current management account. This supersedes the previous next action that made recovery of the old Preview the sole forward path; it does not authorize bypassing that project's IAM.

Reviewed PR #274 head: `44d70ab227eb138554cf75973a28c37a4c9a711c`, open/unmerged. Reviewed main: `bc5a5c764413498189147cc34c7e857c78aa3d2c`. The documentation head has zero returned workflow runs. Executable source remains `0aab5966dba0b1d32029aaf4ae003b548a262ae8`; its deliberate mail hold remains intact. This plan has no new runtime acceptance evidence.

## Proposed target

| Item | Proposed value / evidence limit |
| --- | --- |
| Current management account | haifawi30@gmail.com |
| New project ID | `khedmah-preview-v2-20261012` — proposed, not reserved or proven available |
| Region | `europe-west1` |
| Parent organization/folder | Unselected; read metadata first and verify creation authority on the chosen parent |
| Billing account | Unselected; no billing-account ID or link permission is known |
| Project number | Generated on creation; never copy the old namespace |
| Database | New isolated PostgreSQL test database, synthetic data only; sizing/edition/backup policy to be costed before provisioning |
| Existing Preview | `khedmah-preview-774201339973` / `195546947562`; access investigation remains open |
| Production | `khedma-dl` / `311026134906`; excluded from replacement resources, credentials and mutations |
| Staging | Retain its independently configured identity and baseline; do not silently substitute the new Preview |

No transfer of old Preview data is assumed. Keep old resource/billing reconciliation on the backlog: creating a new project does not close, delete or stop charging for the old one.

## Step 1 — owner-run read-only prerequisite inventory

Run these in the existing Cloud Shell session. They explicitly use the current account; neither changes the default project or cloud configuration.

```bash
gcloud projects describe khedma-dl \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --format='yaml(projectId,projectNumber,parent)'

gcloud billing accounts list \
  --account=haifawi30@gmail.com \
  --filter='open=true' \
  --user-output-enabled \
  --format='table(name,displayName,open)'
```

These reads identify a parent candidate and visible open billing accounts. They do not prove permission to create a project or link billing. The accessible project's parent is a candidate, not an automatic destination. An empty billing list is not proof that no billing account exists.

After results:
- Resolve the chosen organization/folder and verify `resourcemanager.projects.create` there; if there is no parent, inspect the supported personal-project creation path and quota instead of inventing an organization.
- Verify `billing.resourceAssociations.create` on the selected billing account, and the required project-side billing assignment/service-use permissions for the new project. Do not infer these from Owner access to Production or visibility in the billing list.
- Check the applicable project quota and organization policies; an unavailable proposed name needs a reviewed replacement ID.
- If multiple billing accounts or plausible parent destinations are returned, resolve the intended one before linking resources. Do not select by list order.
- Preserve denials as denials. Do not repeat the old Preview queries, switch to the historical account or impersonate its service account.

The assistant has no connected authenticated Google Cloud/Cloud Shell execution tool. The user's output is the missing evidence for this stage, not a pending permission to conduct these already authorized reads.

## Resource and identity manifest to finalize

| Component | Required preparation |
| --- | --- |
| Project/APIs | New isolated project with a verified parent, billing association, required API inventory and quota |
| State | Separate protected state bucket/prefix and explicit new project provider; never reuse the Production Terraform state |
| GitHub trust | New Preview WIF provider and deployer; restrict repository identity, protected `preview` environment and intended PR workflow claims; retain fresh-source checks and reviewers |
| Build | Dedicated verified build identity, Artifact Registry repository, build source/log storage access; inspect actual build identity instead of assuming a default |
| Cloud SQL | New instance/database/users and reviewed runtime/migration privileges, connection name, recovery policy and independent credentials |
| Application | PR-numbered backend/frontend services plus nine bounded schema Job slots; retain serialized mutations, labels, execution-state checks and PR cleanup |
| Secrets/config | New environment-specific database credentials, seven `NEXT_PUBLIC_FIREBASE_*` build values, restricted Maps browser key and dedicated mail credential where required |
| Firebase/auth | Isolated Firebase configuration and authorized test domains; verify backend Firebase binding as well as the frontend build configuration |
| Mail | Preview-only Resend credential and sender verification; metadata read rights for the required reader, payload access only for the identity that needs it; no credential copy from Production |
| Media | Verify Preview's actual storage contract. Provision/bind isolated storage only where the selected acceptance scope needs persistent media; do not claim Staging's media configuration is already applied to Preview |
| Cost controls | Reviewed database sizing, build/image retention, Cloud Run scaling caps and a project-filtered budget/alerts |

Do not execute `infra/iac/bootstrap` as-is: its defaults include Production-oriented account/instance names, a Production workflow/ref, state assumptions and adopted-resource lifecycle rules. A dedicated Preview configuration/plan is required. WIF for pull requests cannot be inferred from the Production main-ref allowlist.

The current nonproduction schema helpers run with `RUNTIME_SERVICE_ACCOUNT` and `DATABASE_URL`. Therefore a newly restricted runtime user may not be able to execute DDL. Resolve migration identity/credential wiring explicitly before provisioning or rollout; do not claim separate migration credentials work without adapting and checking their actual consumers.

## Source changes required before any retargeted deployment

1. `scripts/deployment/preview-schema-job-pool.mjs` pins the old project's SHA-256 and numeric namespace. Replace them only with the verified new identity; preserve rejection of Production, foreign resources and wrong regions. Do not remove the target guard.
2. `scripts/deployment/read-preview-mail-metadata.mjs` also defaults to the old numeric namespace. Update the projected Secret Manager resource validation consistently.
3. `.github/workflows/preview-deployment.yml` currently deliberately exits after metadata diagnostics. Keep that hold during provisioning/configuration work. Releasing it must be a bounded deployment change after the new environment's prerequisites pass.
4. The current `.github/classifieds-preview-stage` is `frontend-on`; its resolver selects Migration 025 **verify**. An empty new database requires the reviewed **apply-025**, then verify and feature-acceptance sequence. Do not start with the old verify-only assumption.
5. Check all active consumers and tests for the old pin/namespace and environment metadata; historical cleanup manifests remain old-target-only and must never be repurposed for the new project.
6. The Preview email resolver accepts an enabled version but the runtime binds `latest`. Verify the exact bound version is enabled and accessible; an arbitrary enabled historical version is insufficient. Provisioning a new project does not establish sender verification or delivery.
7. Keep the independent Staging baseline, source freshness, non-cancelling cloud queue and environment separation gates. Do not bypass them to make replacement deployment green.

### Protected GitHub configuration to reconcile together

| Setting | Target |
| --- | --- |
| `PREVIEW_GOOGLE_CLOUD_PROJECT` | Verified new project ID |
| `PREVIEW_FIREBASE_PROJECT_ID` | Verified new isolated Firebase project |
| `GOOGLE_CLOUD_REGION` | `europe-west1` |
| `PREVIEW_ARTIFACT_REPOSITORY` | New project's reviewed image repository |
| `PREVIEW_CLOUD_SQL_INSTANCE_CONNECTION_NAME` | New project's exact regional connection name |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | New Preview WIF provider |
| `GCP_PREVIEW_DEPLOYER_SERVICE_ACCOUNT` | New Preview deployer |
| `GCP_PREVIEW_RUNTIME_SERVICE_ACCOUNT` | New Preview runtime |
| Production identity variables | Retain canonical `khedma-dl` exclusions |
| Development/Staging identities and `STAGING_FRONTEND_URL` | Retain independently verified values |

Validate these under the protected environment with deployment held; do not echo secret values into logs. Do not publish a partially switched environment while an old deployment/cleanup execution can still run.

## Provisioning and acceptance order

1. Obtain the prerequisite inventory, verify destination/permissions, and select the costed resource manifest.
2. Prepare a deterministic Preview-specific infrastructure plan with exact targets, additions, IAM scope and cost assumptions; ensure no existing environment appears in its mutation set.
3. Provision the new project/resources in bounded stages. Read back the actual project number, regional SQL connection, identities, secret metadata and WIF bindings. Keep provisioning evidence separate from deployment evidence.
4. Configure isolated credentials through secure provider interfaces, then prepare/review the source and protected-variable retargeting together. Old Preview access is not needed to manufacture or extract replacement credentials.
5. Pass meaningful target-isolation, migration and current-source CI checks before the controlled first new-environment rollout. The original Preview's passing tests are historical evidence, not certification of the replacement.
6. Apply/verify the schema on the new database in its governed order. Deploy immutable images and validate backend health, frontend, exact credentialed CORS, authentication/session/logout/authorization, mobile/RTL and module journeys.
7. Verify email delivery with an explicitly selected test recipient before certifying mail readiness. Metadata success alone is not delivery evidence.
8. Record new URLs and acceptance evidence. On partial failure, retain the deployment hold and reconcile the completed stages; do not blind-retry or silently restore access to an old inaccessible target.
9. Retain the existing Production release gates and the old-resource investigation. Any retirement of old resources is a distinct exact-resource decision once legitimate access exists.

## Floot relationship

The existing [migration plan](../floot-migration/MIGRATION-PLAN.md) and [integration gate](../project-control/FLOOT-GOOGLE-INTEGRATION-GATE.md) keep Floot as the experience layer and Google as the API/data authority. This new environment supplies a possible isolated API test target; Floot's own preview URL is a different surface.

A Floot origin still requires an accepted API/auth transport, cookie/session handling, exact CORS/CSRF rules and actual browser verification. Existing Next.js acceptance does not prove Floot acceptance. No Floot app, credentials, domains or Production DNS changes are included in this preparation.

## Cost worksheet — not a price quote

A defensible monetary estimate is pending the instance size/edition, storage, retained backups, run/build usage and billing currency. Do not copy the Production tier or assert that scaling Cloud Run to zero makes Cloud SQL free.

Estimate separately:
- SQL compute: provisioned hours × selected regional hourly rate; use 730 hours only as a clearly stated full-month planning assumption.
- SQL storage and backups: projected GiB-month × their current regional rates.
- Cloud Run requests/CPU/memory and schema Job execution.
- Cloud Build minutes, image storage and retained build artifacts.
- Media/network/logging, Secret Manager, Firebase/Maps and email usage as applicable.

The official Cloud SQL pricing page was found, but its interactive price table did not load reliably in this session; no region-specific price was verified or copied into this plan. Complete a dated calculator estimate before incurring the new recurring resource cost. A budget alert is not a guaranteed spending cap. The old project's residual charges must be considered separately.

## Sources and validation limits

Source owners reviewed at the pinned PR head:
- `.github/workflows/preview-deployment.yml`
- `.github/classifieds-preview-stage`
- `scripts/deployment/preview-schema-job-pool.mjs`
- `scripts/deployment/read-preview-mail-metadata.mjs`
- `scripts/deployment/preview-job-inventory.mjs`
- `scripts/deployment/deploy-cloud-run-environment.sh`
- `scripts/deployment/resolve-classifieds-preview-stage.sh`
- `scripts/deployment/ensure-foundation-nonproduction-schema.sh`
- `scripts/deployment/ensure-classifieds-nonproduction-schema.sh`
- `scripts/deployment/resolve-preview-email-config.sh`
- `cloudbuild.preview.yaml`
- `infra/iac/bootstrap/main.tf` and `variables.tf`
- Preview architecture, Floot migration and API/auth contracts.

Official references reviewed:
- [Project creation](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
- [Project metadata command](https://docs.cloud.google.com/sdk/gcloud/reference/projects/describe)
- [Billing account inventory command](https://docs.cloud.google.com/sdk/gcloud/reference/billing/accounts/list)
- [Billing association permissions](https://docs.cloud.google.com/billing/docs/how-to/modify-project)
- [Cloud SQL pricing — estimate still pending](https://cloud.google.com/sql/pricing)

This pass changes documentation only. No cloud permission test, project creation, billing link, secret read/write, IAM change, resource apply, workflow dispatch, migration, deployment or email send has been executed. No new tests are claimed; validation is source review and the documentation-only change check.
