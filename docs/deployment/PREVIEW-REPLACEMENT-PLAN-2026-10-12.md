# Preview replacement plan — 2026-10-12

## Replacement Preview infrastructure verified — secret-list CLI repair prepared — 2026-10-12

This checkpoint supersedes the previous launcher handoff and older infrastructure/cost/access next actions. The owner requested grouped execution; do not repeat completed infrastructure creation or pricing reads. The owner clarified that the intended product is the still-unfinished site on Floot. Continue its development and required cloud integration; infrastructure readiness does not mean Floot is connected, the product is finished or a launch is authorized.

- **Completed infrastructure:** owner-run output received 2026-10-12T16:53:04+03:00 contains create=58/unchanged=0, 58 unique creation-complete addresses, `Apply complete! Resources: 58 added, 0 changed, 0 destroyed.` and `PREVIEW_V2_INFRASTRUCTURE_VERIFIED`. Attachment SHA-256: `f6f1403e6132fba7300da686711f92a6c931f8b41f6b50a3cd27ec904a23b178`. Target is `khedmah-preview-v2-20261012` / `1044962071847`, organization `594049370623`, region `europe-west1`; protected state storage was reused, and source storage, Artifact Registry, five identities/scoped IAM, SQL/database and eleven empty secret containers were created. SQL identity/region/RUNNABLE readback passed. Infrastructure repair `dae0ba64d8becef29bd851c9eb7c23254294bc34` is completed; do not rerun bootstrap.
- **Completed diagnosis — user result received 2026-10-12T17:17:02+03:00:** projected SQL user inventory for `khedmah-preview-v2-db` returned exactly `[{"name":"postgres"}]`; both type and databaseRoles were absent. This explains the earlier `SQL_USERS_ALREADY_PRESENT_RECONCILE` guard failure, which required explicit type. That attempt stopped before password generation, per-run credential journal, SQL mutations or secret publication. Only the local recovery root/lock may exist; preserve it. These timestamps are message receipt, not Google operation timestamps.
- **Implemented repair:** `fbb03730ead2a8881cd5ca221fc04c2050be666a` changes `scripts/configure-preview-v2-database.py` and `tests/test_preview_v2_database.py`. The [official SQL Admin User contract](https://docs.cloud.google.com/sql/docs/postgres/admin-api/rest/v1beta4/users) defines the built-in type as the default. The validator accepts exactly one postgres entry with absent type or explicit BUILT_IN; explicit null/empty/unknown/IAM types still stop. Empty, extra, duplicate, wrong-name or malformed inventories still stop. Malformed inventory and unexpected type now have distinct error markers. No credential/SQL/API write logic or target scope changed.
- **Latest attempt — result received 2026-10-12T17:27:11+03:00:** the corrected user-type batch stopped with `STOP: GCLOUD_SECRETS_FAILED` before `PREVIEW_V2_DATABASE_PREFLIGHT_PASSED`. No credential generation, SQL/user/password mutation or secret publication occurred in this attempt. The generic marker hides which secret read failed and its stderr; it does not establish an IAM denial or missing secret.
- **Confirmed source defect and repair:** implementation `dac3046a04004e17df538941c8da89385e718f93` changes both preflight and pre-publication version-list calls to `gcloud secrets versions list SECRET`. The [official list command](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/list) requires the positional secret; the former `--secret=...` form was invalid. This is a definite source defect consistent with the stop, but the original stderr was not emitted. The distinct [version describe command](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/describe) correctly retains `latest --secret=...`. Secret read failures now identify DESCRIBE, VERSIONS_LIST or VERSIONS_DESCRIBE plus an allowlisted error category when recognized, without printing captured output. No IAM grant, credential/SQL write logic, recovery deletion or target change is introduced.
- **Next concrete action:** execute the new checksum-pinned combined database launcher at the top of `docs/deployment/PREVIEW-REPLACEMENT-PLAN-2026-10-12.md` once. Its live preflight remains mandatory; it stops before mutation if metadata, permissions or fresh-state checks fail. Preserve the recovery root/lock and any per-run journal. Return only sanitized stage/error output. The fixed version has **not yet run in the owner's Cloud Shell**; database identities/credentials remain pending.
- **Intended batch scope:** initialize an ephemeral postgres bootstrap credential only on the new instance; verify an empty application catalog; create separate non-login runtime/migration roles and their two limited logins; verify attributes, memberships and allowed/denied DDL with fresh connections; publish/read back only new `DATABASE_URL` and `DATABASE_MIGRATION_URL` versions; rotate postgres again on success. Passwords/tokens/payloads are not printed, passed in argv, committed or placed in Terraform state. Private mode-0600 recovery material remains on partial failure; do not paste it or retry an uncertain write. No Production/old Preview credential copy, key creation, federation, Firebase/Maps/mail change, migration or application deployment is included.
- **Validation/integrity:** Python compilation and **30 offline tests passed**. Fixtures now enforce the documented positional secret in both the real preflight path and the simulated full batch; they reject the old flag. Version-describe syntax remains separately checked. New tests cover precise sanitized read-error categories and project/account-pinned CLI arguments. Existing omitted-type, extra-user, privilege, recovery, login/publication ordering and credential-output checks remain green. The earlier mocks accepted the invalid list arguments and therefore missed this defect. Google CLI and PostgreSQL are not installed locally; external calls are mocked and no live assistant-run cloud mutation is claimed. Bash launcher parsing passed. Corrected blob `b333c7a16a198e2ddaf15ec555f88e15f4b706a1`; SHA-256 `62348bfccccb610152cab783eed8d8871c4060d74bb0ba3f9c79e620f93857a8`.
- **Repository checkpoint:** reviewed PR #274 head `57184510c4c7b0b2637bd39a7c2bf41abca4448f` is open/unmerged with zero returned workflow runs; main remains `bc5a5c764413498189147cc34c7e857c78aa3d2c`. This pass changes the helper/test and the same five checkpoint documents, using `[skip ci]`. Existing deployment source/hold stays `0aab5966dba0b1d32029aaf4ae003b548a262ae8`; no current-head CI, merge or deployment certification.
- **Remaining work after database evidence:** success marker `PREVIEW_V2_DATABASE_IDENTITIES_VERIFIED_SCHEMA_PENDING` still leaves schema/runtime-object-grants/application/Floot false. Review ordered migrations and scoped object grants (including append-only/security-definer contracts), then isolated Firebase/browser Maps/mail configuration and source consumers: `.github/workflows/preview-deployment.yml`, `scripts/deployment/ensure-*-nonproduction-schema.sh`, `deploy-cloud-run-environment.sh`, `preview-schema-job-pool.mjs`, `read-preview-mail-metadata.mjs` and `cloudbuild.*.yaml`. Migration helpers still use runtime/DATABASE_URL, frontend/backend share an identity and build/source identities are implicit. Coordinate identity/namespace/hash/WIF/protected configuration before releasing the hold. Browser/auth/CORS/CSRF and Floot acceptance remain pending. Do not overwrite Khedma Business Desk based only on its name. Production/Staging and old Preview retirement remain separate.

### Corrected combined database identity launcher — execute once

The failed attempt stopped in preflight. This version fixes the two version-list calls and retains the postgres default-type repair. Existing users, populated credentials or a prior per-run recovery directory still stop the batch. Return sanitized output only; private recovery files may contain passwords.

```bash
(
set -euo pipefail
umask 077
khedmah_database_script="$(mktemp)"
trap 'rm -f -- "$khedmah_database_script"' EXIT

gh api --hostname github.com \
  repos/khedma-sy/khedmah-digital-v1/git/blobs/b333c7a16a198e2ddaf15ec555f88e15f4b706a1 \
  --jq '.content' | base64 --decode > "$khedmah_database_script"

printf '%s  %s\n' \
  '62348bfccccb610152cab783eed8d8871c4060d74bb0ba3f9c79e620f93857a8' \
  "$khedmah_database_script" | sha256sum --check --status

python3 "$khedmah_database_script" --apply
)
```

Status: infrastructure verified; database identity/credential setup awaits successful execution. The unfinished Floot site still needs schema/object grants, configuration, reviewed identity/WIF wiring and integration testing.

## Owner direction and source

The owner asked why a new Preview could not replace the inaccessible project, then instructed «أبدأ» at 2026-10-12T14:38:46+03:00. Proceed with replacement preparation and prerequisite reads under the current management account. This supersedes the previous next action that made recovery of the old Preview the sole forward path; it does not authorize bypassing that project's IAM.

Reviewed PR #274 head: `beaabdf43321c3de495f273cab153a94bfb3d57a`, open/unmerged. Reviewed main: `bc5a5c764413498189147cc34c7e857c78aa3d2c`. The documentation head has zero returned workflow runs. Deployment/workflow source and existing tests remain unchanged from `0aab5966dba0b1d32029aaf4ae003b548a262ae8`; its deliberate mail hold remains intact. The standalone permission reader added at `7a46afc90f39d812892934717f09228190573221` remains unchanged. The separate operator-invoked billing helper added at `929931a757dbc490bd3f89572bbd8dd7cccde061` has now been executed successfully by the owner; it is not wired into CI. This pass adds an operator-invoked public Cloud SQL price reader and updates the same five documents. This plan has no new runtime acceptance evidence.

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

The assistant has no connected authenticated Google Cloud/Cloud Shell execution tool. The prerequisite inventory has been supplied. Both permission results have now been supplied. Creation/readback has also been supplied. Billing link/readback has also been supplied. Core API enablement/readback has also been supplied. The next missing evidence is the public Cloud SQL price-candidate read for the planned region.

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

## Step 5 — completed core API enablement and readback

The owner completed this bounded stage. Result received at `2026-10-12T15:49:33+03:00`: operation `operations/acf.p2-1044962071847-c671033d-c4b4-49b4-8dbe-5a977c13b27a` finished successfully and all following 13 requested APIs were returned ENABLED. The full post-read includes five extra ENABLED services: `containerregistry.googleapis.com`, `pubsub.googleapis.com`, `storage-api.googleapis.com`, `storage-component.googleapis.com`, `telemetry.googleapis.com` (18 total). Their precise activation history is not established by a single post-read; do not disable them as presumed mistakes. Do not repeat the completed core enablement. The command below is historical execution evidence. It does not explicitly create SQL instances, Cloud Run services, build executions or other runtime capacity. Google may enable dependencies and create service agents as part of activation; the full enabled-service readback is intentionally retained. Do not disable automatic dependencies merely because they are not in the requested list.

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

Require all 13 requested service names in ENABLED state. Preserve any error and list current service state before retrying an uncertain operation; partial enablement is not rolled back by disabling services. The native commands enforce the caller's applicable IAM/policy constraints; a denial does not justify granting Owner or changing caller. The prepared shell command passed Bash parsing, and its explicit service list was checked. The owner has supplied successful core activation/readback; no application runtime deployment is implied.

## Step 6 — public regional SQL price candidates; pending owner execution

The interactive SQL pricing page could not be reliably retrieved. Use Google's documented Catalog API instead of substituting an unverified regional number. This step has one explicit control-plane write: enable `cloudbilling.googleapis.com` in the new project. The subsequent [price reader](../../scripts/read-preview-cloud-sql-prices.py) is read-only. It uses OAuth scopes supported by the REST methods, with the current account's token captured in memory and `X-Goog-User-Project` pinned to the new project. It does not create/store an API key, read billing-account-specific contract prices, access Secret Manager or provision runtime resources.

Reader behavior:
- Reject configured impersonation/access-token/credential-file overrides, and verify exact project ID/number/parent/ACTIVE state.
- Discover the unique `Cloud SQL` service through `GET /v1/services`; do not assume an unverified service ID.
- Follow pagination of `GET /v1/services/{service}/skus?currencyCode=USD`, with bounded page sizes/count and repeated-token/duplicate-SKU rejection.
- Select OnDemand PostgreSQL, explicitly named shared-core or generic storage/backup/IP/log candidates. Require explicit regional applicability to `europe-west1`; global prices are separately labeled `GLOBAL_CANDIDATE`. Do not label a default US price, broad Europe-only scope or another region as Belgium.
- Preserve the original descriptions, categories, pricing versions/effective times, usage/base units, conversion factors, display quantity, tiers and Money units/nanos. A Money amount is `units + nanos / 1,000,000,000`; do not add nanos as whole currency units.
- Emit sanitized public price metadata only after all pages succeed. No secret/token or billing account ID is printed. HTTP failures stop with a status code; there is no caller substitution, IAM grant or automatic retry.

The proposed SQL configuration remains PostgreSQL 16 Enterprise, ZONAL, one vCPU/3.75 GiB memory (`db-custom-1-3840` candidate), 10 GiB SSD initially with proposed growth allowance to 20 GiB, seven backups/PITR days, and 730 running hours for a full-month scenario. Candidate output can include other SQL editions/families or global support SKUs: select compatible rates explicitly; do not sum every returned row or silently choose the first match.

Helper blob `85da1d0d57692dcb0bb5fb29755d7eac8a1e79cd`; SHA-256 `fc1418a5de761e34f45ae4f1bf48d4b3c216344501b3ec4f27420c3f275c846a`. The launcher verifies downloaded source before enabling the catalog API.

```bash
(
set -euo pipefail
umask 077
khedmah_price_script="$(mktemp)"
trap 'rm -f -- "$khedmah_price_script"' EXIT
gh api --hostname github.com repos/khedma-sy/khedmah-digital-v1/git/blobs/85da1d0d57692dcb0bb5fb29755d7eac8a1e79cd --jq '.content' | base64 --decode > "$khedmah_price_script"
printf '%s  %s\n' 'fc1418a5de761e34f45ae4f1bf48d4b3c216344501b3ec4f27420c3f275c846a' "$khedmah_price_script" | sha256sum --check --status

gcloud services enable cloudbilling.googleapis.com \
  --project=khedmah-preview-v2-20261012 \
  --account=haifawi30@gmail.com \
  --user-output-enabled

python3 "$khedmah_price_script"
)
```

Successful full read ends with `PREVIEW_SQL_PUBLIC_PRICE_CANDIDATES_READ` and `CANDIDATES_REQUIRE_TIER_AND_UNIT_REVIEW_NOT_A_TOTAL_QUOTE`. Those markers establish retrieval, not a finalized quote. Record the selected SKU IDs, descriptions, effective times and units next, calculate the regional SQL scenario, and add the other explicitly excluded components before deciding the resource plan. The USD catalog does not establish actual billing currency, discounts, tax or existing old-Preview charges.

Validation: Python compilation and 16 local mocked checks passed, including pagination and exact OAuth quota-project scope, no token output, foreign region/commitment/MySQL exclusion, global-price labeling, currency mismatch, preserved units/tiers, wrong project/auth overrides, denial/malformed responses, duplicate SKUs, redirect/path refusal and looping pagination. Bash parsing passed. No live Catalog API success is claimed yet.

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

1. Completed: prerequisite inventory, permission tests, project creation, billing link/readback and core API activation/readback. Next execute Step 6's catalog activation/public price read, then complete the regional SQL quote and reviewed dedicated infrastructure plan before provisioning runtime capacity.
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

The official Cloud SQL pricing page exceeded the retriever's page-size limit; the alternative fetch did not expose usable pricing. Search surfaced shared-core/default prices but did not prove the selected Belgium custom-tier rate. No such number is substituted into this worksheet. Complete an authoritative regional calculator/SKU quote before SQL capacity creation. Core API activation has completed. Step 6's public Catalog API reader is the next concrete route to regional price evidence.

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
- [Public catalog guide](https://docs.cloud.google.com/billing/v1/how-tos/catalog-api)
- [Public services and OAuth scopes](https://docs.cloud.google.com/billing/docs/reference/rest/v1/services/list)
- [Public SKUs, pagination, pricing units and OAuth scopes](https://docs.cloud.google.com/billing/docs/reference/rest/v1/services.skus/list)
- [Core API activation](https://docs.cloud.google.com/sdk/gcloud/reference/services/enable)
- [Enabled API inventory](https://docs.cloud.google.com/sdk/gcloud/reference/services/list)
- [Cloud SQL instance settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings)
- [Cloud SQL pricing — regional quote still pending](https://cloud.google.com/sql/pricing)

This checkpoint adds one standalone public-price reader and updates the same five Markdown documents. The reader passed compilation/16 local mocked checks; its launcher passed Bash parsing. New owner-supplied live evidence confirms the core API operation and 18 ENABLED services, including all 13 requested. Earlier billing/helper validation remains recorded separately. The new catalog activation/read, runtime apply, secret/IAM provisioning, workflow dispatch, migration, deployment and email send have not been reported. Existing deployment/billing-helper/test files are unchanged; no live Google action was executed by the assistant.
