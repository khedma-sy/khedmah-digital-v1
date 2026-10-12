# Preview replacement plan — 2026-10-12

Status: project creation and billing link/readback are completed. Core API enablement/readback is prepared. Resource names/sizing and a partial cost scenario are documented; SQL regional pricing and runtime provisioning remain pending.

## Owner direction and source

The owner asked why a new Preview could not replace the inaccessible project, then instructed «أبدأ» at 2026-10-12T14:38:46+03:00. Proceed with replacement preparation and prerequisite reads under the current management account. This supersedes the previous next action that made recovery of the old Preview the sole forward path; it does not authorize bypassing that project's IAM.

Reviewed PR #274 head: `929931a757dbc490bd3f89572bbd8dd7cccde061`, open/unmerged. Reviewed main: `bc5a5c764413498189147cc34c7e857c78aa3d2c`. The documentation head has zero returned workflow runs. Deployment/workflow source and existing tests remain unchanged from `0aab5966dba0b1d32029aaf4ae003b548a262ae8`; its deliberate mail hold remains intact. The standalone permission reader added at `7a46afc90f39d812892934717f09228190573221` remains unchanged. The separate operator-invoked billing helper added at `929931a757dbc490bd3f89572bbd8dd7cccde061` has now been executed successfully by the owner; it is not wired into CI. This pass changes documentation only. This plan has no new runtime acceptance evidence.

## Verified project and planned resources

| Item | Value / evidence limit |
| --- | --- |
| Current management account | haifawi30@gmail.com |
| New project ID | `khedmah-preview-v2-20261012` — created, ACTIVE |
| Planned resource region | `europe-west1`; the project itself is not regional |
| Parent organization/folder | Organization `594049370623`, confirmed in the new project's creation readback |
| Billing account | One visible open account, `My Billing Account`; full ID supplied privately by the owner. The owner supplied successful project-side/account-side preflight and new-project `billingEnabled=true`, `billingAccountMatches=true` readback on 2026-10-12 |
| Project number | `1044962071847`, confirmed in creation readback; never copy the old namespace |
| Database | New isolated PostgreSQL test database, synthetic data only; sizing/edition/backup policy to be costed before provisioning |
| Existing Preview | `khedmah-preview-774201339973` / `195546947562`; access investigation remains open |
| Production | `khedma-dl` / `311026134906`; excluded from replacement resources, credentials and mutations |
| Staging | Retain its independently configured identity and baseline; do not silently substitute the new Preview |

No transfer of old Preview data is assumed. Keep old resource/billing reconciliation on the backlog: creating a new project does not close, delete or stop charging for the old one.

## Step 1 — completed owner-run read-only prerequisite inventory

The owner supplied successful output for both commands in the message received at 2026-10-12T14:49:12+03:00: organization `594049370623` is the parent of `khedma-dl`, and one open `My Billing Account` is visible. No command execution timestamp was emitted. Do not rerun this completed inventory without a concrete freshness need. Commands are retained below as evidence.

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

Remaining prerequisites after the supplied inventory:
- Completed: organization `594049370623` is identified and its `resourcemanager.projects.create` test returned allowed=true.
- Completed: project-side billing assignment/service-use permissions and billing-account association permission were checked by the billing helper, and linking/readback passed.
- Completed: Google accepted creation under the selected organization and returned the exact new project ACTIVE. This does not establish quotas for future services.
- If multiple billing accounts or plausible parent destinations are returned, resolve the intended one before linking resources. Do not select by list order.
- Preserve denials as denials. Do not repeat the old Preview queries, switch to the historical account or impersonate its service account.

The assistant has no connected authenticated Google Cloud/Cloud Shell execution tool. The prerequisite inventory has been supplied. Both permission results have now been supplied. Creation/readback has also been supplied. Billing link/readback has also been supplied. The next missing evidence is core API enablement/readback.

## Step 2 — completed checksum-pinned permission-only probe

The later output supplied at 2026-10-12T14:58:59+03:00 confirmed `billingEnabled=true` on Production and repeated its account/project metadata. Its marker was `READ_ONLY_PROJECT_BILLING_STATE_OK_NO_MUTATION`; it did not test either permission below. A later result received at 2026-10-12T15:08:16+03:00 supplies both required permission booleans as true and the expected IAM completion marker. Do not rerun either completed read solely to reproduce evidence.

Use the existing current-account credentials to call these official APIs:

| Target | API | Requested permission |
| --- | --- | --- |
| Organization `594049370623` | `POST https://cloudresourcemanager.googleapis.com/v3/organizations/594049370623:testIamPermissions` | `resourcemanager.projects.create` |
| The owner-supplied open billing account | `POST https://cloudbilling.googleapis.com/v1/billingAccounts/{billing_account}:testIamPermissions` | `billing.resourceAssociations.create` |

These POST requests test IAM only; they do not create projects, link billing or grant permissions. The standalone [permission reader](../../scripts/read-preview-project-access.py) checks for configured impersonation/credential overrides, captures `gcloud auth print-access-token` in memory without printing it, refuses redirects and emits projected permission booleans. HTTP/authentication/invalid-response failures stop as read errors, not as evidence that permission is absent.

Observed owner-supplied output includes `PROJECT_CREATE: allowed=true`, `BILLING_LINK: allowed=true`, `read_only=true` on each result, and `PREVIEW_PARENT_AND_BILLING_IAM_PASSED_NO_MUTATION`. No API execution timestamp was emitted; the recorded timestamp is receipt of the owner's message. Both permissions must be assessed under the current account. A successful probe does not establish quota/name availability, organization-policy compliance, the new project's billing assignment permissions or billable account standing.

Validation performed: six local mocked checks passed (both permissions present, missing permission, HTTP denial, auth override, malformed response and invalid billing-account ID), including fixed API/permission scope and no token in output. No live Google API request or mutation was executed. No monetary estimate or resource apply is established by a permission result alone.

The full billing account ID remains an operator argument, not committed configuration. Helper SHA-256: `90b832c077641f5bd642041ee7435e3651f6baa9d7fc064679bd19808ba3785a`; immutable Git blob: `361e986116a4e3b361a9b11fb36a88fdc9fedfe6`. The new helper is not automatically called by CI and its existing deployment hold is unchanged.

Completed reader reference only; do not rerun without a concrete reason. The private billing identifier remains an argument:

```bash
(
set -euo pipefail
khedmah_access_script="$(mktemp)"
trap 'rm -f -- "$khedmah_access_script"' EXIT
gh api --hostname github.com repos/khedma-sy/khedmah-digital-v1/git/blobs/361e986116a4e3b361a9b11fb36a88fdc9fedfe6 --jq '.content' | base64 --decode > "$khedmah_access_script"
printf '%s  %s\n' '90b832c077641f5bd642041ee7435e3651f6baa9d7fc064679bd19808ba3785a' "$khedmah_access_script" | sha256sum --check --status
python3 "$khedmah_access_script" --billing-account=OWNER_SUPPLIED_BILLING_ACCOUNT_ID
)
```

A download/checksum failure stops before execution. The owner has supplied both true permission booleans and the success marker. The helper itself performs no project creation or billing mutation.

## Step 3 — completed project-container creation

The owner completed this bounded stage. Scope was one new project container under the verified organization. Google returned `createTime: 2026-10-12T12:13:49.031Z`, project number `1044962071847`, ACTIVE state and the exact parent/labels shown below; receipt was `2026-10-12T15:15:58+03:00`. Operation `create_project.global.5239605183562174711` completed successfully. Do not rerun creation. The command below is retained only as execution evidence. This stage deliberately does not attach billing or create runtime capacity, so resource sizing/cost decisions remain prerequisites for the later billable infrastructure stage.

| Change | Exact target |
| --- | --- |
| Create project ID | `khedmah-preview-v2-20261012` |
| Display name | `Khedmah Preview V2` |
| Parent | `organizations/594049370623` |
| Caller | `haifawi30@gmail.com` |
| Labels | `environment=preview,application=khedmah` |
| Cloud API bundle | Do not enable automatically: `--no-enable-cloud-apis` |
| Billing, runtime resources, default configuration | No link, resource provisioning or default-project switch in this command |

```bash
(
set -euo pipefail
gcloud projects create khedmah-preview-v2-20261012 \
  --organization=594049370623 \
  --account=haifawi30@gmail.com \
  --name='Khedmah Preview V2' \
  --labels=environment=preview,application=khedmah \
  --no-enable-cloud-apis \
  --user-output-enabled

gcloud projects describe khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --format='yaml(projectId,projectNumber,name,lifecycleState,parent,labels,createTime)'
)
```

The shell stops if creation fails; it must not adopt an unrelated existing project or proceed with billing after an error. If the create command times out or its completion is uncertain, reconcile the exact operation/project with read-only metadata before any retry. A successful create enforces name availability and Google's applicable creation controls at that moment; it does not certify later service quotas.

The supplied readback matches the exact project ID, organization parent, Preview labels and ACTIVE state, with assigned number `1044962071847`. The `environment: untagged` advisory concerns Resource Manager tags and does not contradict the returned labels. No Cloud SQL, Cloud Run, WIF, secret, DNS or GitHub environment change is included here.

The command passed local Bash syntax validation and was successfully executed by the owner, not the assistant. The official [create command](https://docs.cloud.google.com/sdk/gcloud/reference/projects/create) documents `--no-enable-cloud-apis`, organization, name, labels and account flags.

## Step 4 — completed billing preflight, link and readback

The owner successfully executed this step and supplied the result at `2026-10-12T15:27:20+03:00` (message receipt, not an emitted operation timestamp): both permission checks were allowed, the preflight passed, linking was attempted, and exact-project readback returned `billingEnabled=true` and `billingAccountMatches=true`, ending with `PREVIEW_BILLING_LINK_VERIFIED`. Do not repeat this completed link. The launcher below is retained as execution evidence only. The account ID remains an operator argument and is not committed. The completed run used the [billing helper](../../scripts/link-preview-project-billing.py) through its pinned launcher below. Default invocation is plan-only; the recorded `--apply` requested the bounded link after checks passed.

The helper verifies:
- Current account `haifawi30@gmail.com`, with no configured impersonation/access-token-file/credential-file override.
- Exact project `khedmah-preview-v2-20261012` / `1044962071847`, organization `594049370623`, ACTIVE state and Preview/application labels.
- No existing foreign billing association, and an exact matching open selected account.
- Project-side `resourcemanager.projects.get`, `resourcemanager.projects.createBillingAssignment`, `serviceusage.services.list`, and `serviceusage.effectivepolicy.get` via project `testIamPermissions`.
- Billing-account `billing.resourceAssociations.create`, freshly checked as the actual mutation preflight.
- Unchanged unlinked billing state immediately before the link, then exact account match and `billingEnabled=true` after it.

The single write is `gcloud billing projects link` with the exact new project and the operator-supplied account. An already identical, enabled association is verified without another write. A foreign association, denied/missing permission, closed account, wrong identity or changed preflight state stops before linking. This is not an atomic cross-API lock; avoid concurrent billing writers. A timeout/uncertain write or failed readback stops without automatic retry. Reconcile with the read-only command below before deciding any further action.

Immutable helper blob: `a302d88fdcc00ed96fee25dca7f1900e17abcd71`. SHA-256: `1038d5d6ec02064921e27363138154959e310672bd3224910d0a27a0550071eb`.

```bash
(
set -euo pipefail
umask 077
khedmah_billing_script="$(mktemp)"
trap 'rm -f -- "$khedmah_billing_script"' EXIT
gh api --hostname github.com repos/khedma-sy/khedmah-digital-v1/git/blobs/a302d88fdcc00ed96fee25dca7f1900e17abcd71 --jq '.content' | base64 --decode > "$khedmah_billing_script"
printf '%s  %s\n' '1038d5d6ec02064921e27363138154959e310672bd3224910d0a27a0550071eb' "$khedmah_billing_script" | sha256sum --check --status
python3 "$khedmah_billing_script" --billing-account=OWNER_SUPPLIED_BILLING_ACCOUNT_ID --apply
)
```

Successful mutation/readback ends with `PREVIEW_BILLING_LINK_VERIFIED`; a previously completed matching link ends with `PREVIEW_BILLING_ALREADY_LINKED_VERIFIED_NO_MUTATION`. The output projects billing state without printing the account ID or token. No resource-capacity provisioning, API enablement, default-project change or GitHub retargeting is included.

For an uncertain link result, reconcile only:

```bash
gcloud billing projects describe khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --format='yaml(projectId,billingEnabled,billingAccountName)'
```

Validation: Python compilation and 16 local mocked checks passed: successful link, plan-only, existing identical link, wrong project, foreign association, closed account, missing permission, auth override, HTTP denial, invalid permission response, concurrent preflight change, failed post-link readback, invalid billing ID, explicit CLI scope/captured output, mutation timeout without retry, and redirect refusal. The launcher passed Bash parsing. These local checks are separate from the subsequently supplied successful live billing result above.

## Step 5 — core API enablement and readback; prepared, not executed

This bounded stage enables the following 13 core service APIs in the verified new project. It does not explicitly create SQL instances, Cloud Run services, build executions or other runtime capacity. Google may enable dependencies and create service agents as part of activation; the full enabled-service readback is intentionally retained. Do not disable automatic dependencies merely because they are not in the requested list.

| Purpose | Requested APIs |
| --- | --- |
| Project/service control | `serviceusage.googleapis.com`, `cloudresourcemanager.googleapis.com` |
| Identities and future GitHub federation | `iam.googleapis.com`, `iamcredentials.googleapis.com`, `sts.googleapis.com` |
| Runtime and build | `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com` |
| Data and configuration | `sqladmin.googleapis.com`, `secretmanager.googleapis.com`, `storage.googleapis.com` |
| Observability | `logging.googleapis.com`, `monitoring.googleapis.com` |

Firebase/Auth, Maps, API Keys, optional media integrations and any other application-specific APIs are a later explicit stage after their consumers are reconciled. Do not copy the broad Production API set wholesale or enable container scanning without accounting for its separate charges.

```bash
(
set -euo pipefail
gcloud services enable \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project=khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled

gcloud services list --enabled \
  --project=khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled \
  --sort-by=config.name \
  --format='table(config.name,state)'
)
```

Require all 13 requested service names in ENABLED state. Preserve any error and list current service state before retrying an uncertain operation; partial enablement is not rolled back by disabling services. The native commands enforce the caller's applicable IAM/policy constraints; a denial does not justify granting Owner or changing caller. The prepared shell command passed Bash parsing, and its explicit service list was checked. No API enablement has been reported yet.

## Concrete proposed resource manifest — pending provision/review

Names and settings below are a planning decision for the already created project, not a claim of live resources or an infrastructure apply. Regional resources use `europe-west1`. The new project's SHA-256 is `b299ab462a1e169173551bb6a47c508bcdfb30860f21b551d455cb7704f80e4f`; the numeric namespace is `1044962071847`.

| Resource | Proposed target/settings | Remaining gate |
| --- | --- | --- |
| Terraform state | Bucket `khedmah-preview-v2-20261012-tfstate`, prefix `khedmah/preview-v2/bootstrap`; private, uniform access, versioning | Dedicated new-environment configuration, exact plan, permissions and live-name check |
| Build source | Bucket `khedmah-preview-v2-20261012-cloudbuild-source`; private, regional, reviewed retention | Preview helpers currently use default source staging; explicitly wire this bucket before claiming it is used |
| Artifact Registry | Docker repository `khedmah-preview` | Reviewed cleanup that protects deployed images; initial planning allowance 5 GiB, not a storage cap |
| Cloud SQL | `khedmah-preview-v2-db`, PostgreSQL 16, Enterprise, `db-custom-1-3840` candidate, ZONAL, 10 GiB SSD initially, proposed autoresize limit 20 GiB | Verify regional tier/policy support and price, review exact create plan before incurring recurring capacity |
| SQL recovery/network | Proposed seven automatic backups, PITR seven days, public connector endpoint with no authorized-network allowlist | Confirm exact settings/connection contract; storage/backups continue to cost money independently of application idleness |
| Database/users | DB `khedmah`; separate `khedmah_app` and `khedmah_migrator`, new independent credentials | Runtime role must lack DDL/admin privileges; migration ownership/default grants and login binding must pass fresh catalog checks |
| Initial frontend/backend | `khedmah-pr-274-frontend`, `khedmah-pr-274-backend`; each 1 vCPU/512 MiB candidate, request-based billing, min 0, proposed max 2 and concurrency 20 | Add explicit settings/identity wiring to deployment source and verify health, memory and connection behavior |
| Schema Jobs | Nine existing `khedmah-preview-schema-<stage>` names, one task/parallelism 1, retries 0, explicit migrator identity | Retarget pool pins, adapt all migration consumers and initial apply/verify stages; queue remains serialized |
| Firebase/auth | Add Firebase to this new project; create isolated web config/auth domains | Verify backend auth binding and browser acceptance; Google Cloud project creation alone has not created Firebase configuration |
| Media | Candidate private bucket `khedmah-preview-v2-20261012-media` only after Preview media contract is confirmed | No bucket creation or public access assumed |
| Budget | Project-filtered budget with actual/forecast alerts | Amount and currency after full quote; alerts and service scaling limits are not hard account spending caps |

The Cloud Run helper currently leaves scaling/resource values implicit. These proposed caps must be written and checked, not merely documented. Multiple active PRs can create additional service pairs; initially target PR #274 only. Maximum-instance settings are operational controls, not a guarantee that cost can never exceed an amount.

### Proposed service-account separation

All five IDs below belong only to `khedmah-preview-v2-20261012.iam.gserviceaccount.com`; no keys are proposed.

| Account ID | Intended access boundary |
| --- | --- |
| `khedmah-pv2-deployer` | Scoped Cloud Run deployment, build submission, required metadata reads and actAs only on the four intended execution identities; no project-wide secret payload access |
| `khedmah-pv2-build` | Artifact writes to the new repository, source-bucket reads, logging, and access to the eight frontend build configuration secrets |
| `khedmah-pv2-runtime` | Backend Cloud SQL client and only its bound runtime secrets; media access only if the verified contract needs it |
| `khedmah-pv2-frontend` | Frontend execution identity with no SQL or secret-payload grants by default |
| `khedmah-pv2-migrator` | Cloud SQL client and the new migration-credential secret; restricted SQL migration role |

Required source work is explicit: schema helpers currently select `RUNTIME_SERVICE_ACCOUNT` and `DATABASE_URL`; frontend/backend currently share that identity; build submissions do not select the proposed dedicated build identity; Preview does not pass the proposed source-staging bucket. New identities and secret names alone do not change any of those consumers. Keep the current deployment hold until wiring and focused tests prove separation.

Proposed GitHub WIF pool/provider: `khedmah-preview-github/github-actions`, restricted to repository ID `1307435925`, owner ID `307214577`, the protected `preview` environment and reviewed Preview workflows. Verify actual claim shape and permitted PR refs before encoding trust; do not copy the Production main-only condition or introduce a broad workflow/branch wildcard. Retain independent Staging and canonical Production exclusions.

## Remaining implementation contracts

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

1. Completed: prerequisite inventory, permission tests, project creation and billing link/readback. Next execute Step 5 core API enablement/readback, then complete the regional SQL quote and reviewed dedicated infrastructure plan before provisioning runtime capacity.
2. Prepare a deterministic Preview-specific infrastructure plan with exact targets, additions, IAM scope and cost assumptions; ensure no existing environment appears in its mutation set.
3. Provision resources in the already created project in bounded stages. Use verified project number `1044962071847`; read back the regional SQL connection, identities, secret metadata and WIF bindings. Keep provisioning evidence separate from deployment evidence.
4. Configure isolated credentials through secure provider interfaces, then prepare/review the source and protected-variable retargeting together. Old Preview access is not needed to manufacture or extract replacement credentials.
5. Pass meaningful target-isolation, migration and current-source CI checks before the controlled first new-environment rollout. The original Preview's passing tests are historical evidence, not certification of the replacement.
6. Apply/verify the schema on the new database in its governed order. Deploy immutable images and validate backend health, frontend, exact credentialed CORS, authentication/session/logout/authorization, mobile/RTL and module journeys.
7. Verify email delivery with an explicitly selected test recipient before certifying mail readiness. Metadata success alone is not delivery evidence.
8. Record new URLs and acceptance evidence. On partial failure, retain the deployment hold and reconcile the completed stages; do not blind-retry or silently restore access to an old inaccessible target.
9. Retain the existing Production release gates and the old-resource investigation. Any retirement of old resources is a distinct exact-resource decision once legitimate access exists.

## Floot relationship

The existing [migration plan](../floot-migration/MIGRATION-PLAN.md) and [integration gate](../project-control/FLOOT-GOOGLE-INTEGRATION-GATE.md) keep Floot as the experience layer and Google as the API/data authority. This new environment supplies a possible isolated API test target; Floot's own preview URL is a different surface.

A Floot origin still requires an accepted API/auth transport, cookie/session handling, exact CORS/CSRF rules and actual browser verification. Existing Next.js acceptance does not prove Floot acceptance. No Floot app, credentials, domains or Production DNS changes are included in this preparation.

## Dated cost worksheet — partial scenario, not total Preview pricing

Checked on **2026-10-12**. USD list-rate illustration with no free-tier, credits, negotiated discounts or commitments deducted. Free-tier allowances can be shared with the other projects on the same billing account, so a new project is not assumed to receive a fresh independent allowance. The actual billing currency/taxes remain unverified.

| Component | Explicit monthly usage assumption | Verified rate/calculation | Scenario USD |
| --- | --- | --- | ---: |
| Cloud Run services, Belgium Tier 1 | Combined 100,000 billed vCPU-seconds, 60,000 GiB-seconds, 100,000 requests across the two services | `100000 × 0.000024 + 60000 × 0.0000025 + 0.1 × 0.40` | 2.59 |
| Cloud Run Jobs, Belgium Tier 1 | 9,000 billed vCPU-seconds and 4,500 GiB-seconds; include minimum billable execution duration | `9000 × 0.000018 + 4500 × 0.000002` | 0.17 |
| Cloud Build default pool | 1,000 total build minutes on `e2-standard-2`; migrations/rebuilds count too | Belgium default-pool rate `0.006/minute` | 6.00 |
| Artifact Registry | 5 GiB retained for 730 hours | `5 × 730 × 0.000136986`; shared free allowance ignored | 0.50 |
| **Subtotal of only these four components** | Usage assumptions, not limits or measured load | Decimal calculation: `9.260998900`, rounded | **9.26** |

Official sources: [Cloud Run rates and regional tiers](https://cloud.google.com/run/pricing), [Cloud Build Belgium default-pool prices](https://cloud.google.com/build/pricing-update), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing). Private-pool Build rates must not be used for this default-pool assumption. Future builds must explicitly verify the selected machine type; the current source leaves it implicit.

**Not included in USD 9.26:** SQL compute, SSD storage, backups/PITR logs, IP/network charges, other Cloud Storage and operations, Secret Manager, chargeable logs, Firebase/Auth, Maps, mail-provider charges and taxes. It is not a total, approved budget or promise of the eventual bill.

For the proposed PostgreSQL candidate, quote these exact inputs in `europe-west1`: Enterprise, ZONAL, one vCPU, 3.75 GiB memory, PostgreSQL 16, 730 running hours as a full-month assumption, 10 GiB SSD initially (growth allowance up to 20 GiB), seven backups and seven PITR days. Formula: `730 × (regional CPU hourly rate + 3.75 × regional RAM hourly rate) + billed SSD + retained backup/log storage + applicable network/IP`. Backup usage must be estimated from actual retained data; seven backups does not prove a fixed seven-times-disk bill.

The official Cloud SQL pricing page exceeded the retriever's page-size limit; the alternative fetch did not expose usable pricing. Search surfaced shared-core/default prices but did not prove the selected Belgium custom-tier rate. No such number is substituted into this worksheet. Complete an authoritative regional calculator/SKU quote before SQL capacity creation. This unresolved pricing item does not prevent the bounded core API activation stage.

Keep old Preview charges separate. Budget alerts are notifications, not automatic spending caps. New project creation/billing link does not stop charges in the inaccessible old project.

## Sources and validation limits

Source owners reviewed at `44d70ab227eb138554cf75973a28c37a4c9a711c` (executable source unchanged at the newly verified documentation head):
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
- [Billing link command](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/link)
- [Project billing readback](https://docs.cloud.google.com/sdk/gcloud/reference/billing/projects/describe)
- [Project permission test](https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/testIamPermissions)
- [Organization permission test](https://docs.cloud.google.com/resource-manager/reference/rest/v3/organizations/testIamPermissions)
- [Billing account permission test](https://docs.cloud.google.com/billing/docs/reference/rest/v1/billingAccounts/testIamPermissions)
- [Core API activation](https://docs.cloud.google.com/sdk/gcloud/reference/services/enable)
- [Enabled API inventory](https://docs.cloud.google.com/sdk/gcloud/reference/services/list)
- [Cloud SQL instance settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings)
- [Cloud SQL pricing — regional quote still pending](https://cloud.google.com/sql/pricing)

This checkpoint updates the same five Markdown documents only. The 13-service native command passed Bash parsing; service inventory and cost arithmetic were checked. Billing helper implementation remains at `929931a757dbc490bd3f89572bbd8dd7cccde061`: its compilation/16 mocked checks are prior local evidence, while the owner's `PREVIEW_BILLING_LINK_VERIFIED` is new live evidence. No core API enablement, new runtime apply, secret/IAM provisioning, workflow dispatch, migration, deployment or email send has been reported. No source/test files changed and no live Google action was executed by the assistant.
