# Khedma Digital — Preview V2 live owner receipts, 11 November 2026

> **State: NO-GO / evidence only.** This document is a persistent, human-reviewable receipt of owner-supplied Cloud Shell output and source inspection. It is not an authorization to execute SQL migrations, deploy Cloud Run, change IAM, publish Floot, or merge code. No secrets, connection strings, passwords or application data rows are reproduced.

## 1. Scope and source-of-truth reconciliation

- Owner confirms the site has **not officially launched and has no real users**. This does **not** certify an empty database or an absence of demo/system data, external clients, automated writers or costs.
- Verified GitHub protected `main`: `2cae37037da91e2a75f0d482f04d9773a5bdde10` (#367 merged). At the pre-write inspection, the only open PR was documentation-only **DRAFT #368** on head `31b72df28db301556b74827c4620d92e8124ce5f`, and its three exact-head workflows (Node.js CI, PR Preview, Khedmah - Test & Verify) had concluded successfully. **A subsequent documentation commit invalidates those exact-head receipts for the new HEAD; recheck CI before any merge.**
- Preview GCP project: `khedmah-preview-v2-20261012`; region: `europe-west1`; database instance: `khedmah-preview-v2-db`; database: `khedmah` (PostgreSQL 16.15). This is the present shared Preview environment, **not** a verified disposable test database.
- Owner's authorization is for **prelaunch investigation on existing Preview**; no blanket permission to delete data, stop a writer, change traffic, migrate schema or publish has been inferred.

## 2. Confirmed database schema and reason for NO-GO

Read-only source-pinned inspector: `python3 scripts/read-preview-v2-approval-schema.py --inspect`, UTC `2026-11-11T15:24:25.724645Z`. The follow-up `--inspect-quota` ran at `2026-11-11T15:27:30.876421Z`. Both used a read-only repeatable-read transaction with the existing verified migrator identity and reported zero schema/application-data/cloud mutations; no application data rows or credential values were printed.

| Catalog signal | Observed value | Meaning |
|---|---|---|
| `classification` | `prerequisite-invalid` | Transition readiness is **NOT** verified |
| `required_relation_anchors` / `quota_columns_exact` | `true` / `true` | These prerequisites match |
| `quota_target` | `false` | Exact 036 quota successor is absent |
| `body_025_exact` / `body_036_exact` | `true` / `false` | Installed `public.enforce_ad_free_slot_limit()` body is **exact canonical 025**, not target 036 |
| `routine_count`, `routine_failed_checks` | `1`, `[]` | Routine count/metadata correct |
| `named_trigger_count`, `trigger_failed_checks` | `1`, `[]` | Named INSERT trigger metadata correct |
| `user_insert_trigger_count`, `insert_rule_count` | `1`, `0` | Required trigger count; no extra INSERT rule |
| `role_predecessor` / `role_target` | `false` / `true` | Administrative role prerequisite is at target |
| `asset_predecessor` / `asset_target` | `true` / `false` | Verification media remains at pre-037 state |
| `private_constraint_absent` / `private_constraint_target` | `true` / `false` | Media privacy target constraint not yet present |
| `schema_readiness_verified` / `release_gates_verified` | `false` / `false` | No schema transition or release permission |

Exact classifier in `scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh` yields `prerequisite-invalid` when required relations, exact quota columns **or quota target** fail; the first two are true, so **`quota_target=false` is the proven cause of this classifier**. No finding of a corrupted trigger or routine flags. Do **not** hand-edit the function or invoke migrations 036/037 on this evidence.

Current main `apps/backend/src/database/database.migrator.ts` requires `REQUIRED_CANONICAL_SCHEMA_VERSION = '037'` at application start and does not run migrations at startup. The latest built-only candidate below must **not** replace the running Backend against this unverified schema.

## 3. Cloud Run Jobs and asynchronous sources

Owner's read-only regional `gcloud run jobs list` shows **9** configured schema Jobs, all with last displayed runs on `2026-10-16` UTC:

| Job suffix / schema scope | Most recent displayed run (UTC, 2026-10-16) |
|---|---|
| `foundation-001-022` | `20:13:23` |
| `product-store-024` | `20:14:39` |
| `classifieds-025` | `20:16:13` |
| `fulfillment-026-028` | `20:17:41` |
| `taxi-pricing-029` | `20:19:06` |
| `billing-030-033` | `20:20:16` |
| `taxi-operational-031` | `20:21:32` |
| `taxi-operational-032` | `20:22:34` |
| `food-promotions-034` | `20:23:42` |

All nine were created by the existing Preview deployer identity. No named 036/037 Job appears **in that region's listing**. The sampled `gcloud run jobs executions list --limit=30` returned **30** executions with start and completion times; latest listed completion: `2026-10-16T20:24:21.579667Z` for `food-promotions-034-8gx9f`. **Completion time does not prove successful conclusion; the 30-result limit does not prove absence of any unlisted or later execution.** Prior billing executions included historical failures and later success receipts; never replay old jobs to fill schema gaps.

- `gcloud scheduler jobs list --location=europe-west1 --format=json` returned exactly `[]`: **no Scheduler jobs listed in this specific region at that time**, not an all-regions/external scheduler attestation.
- `gcloud tasks queues list --location=europe-west1 --format=json` was blocked with `SERVICE_DISABLED`: `cloudtasks.googleapis.com` was not enabled; **NOT** an empty-queue inventory. Do not enable an API just to obtain a zero result.
- Cloud Run Jobs, Scheduler, Tasks, revisions, external clients, Cloud SQL connections, credentials and all regions are distinct writer surfaces; none alone proves quiescence.

## 4. Backend service and PostgreSQL activity snapshot

Owner ran `python3 scripts/read-preview-v2-approval-successor-gates.py --inspect` at `2026-11-11T15:41:16.222054Z`. The pinned script used read-only SQL against `pg_stat_activity`, Cloud Run GETs and permission troubleshooting; **no Cloud Run scaling/traffic/schema/role/application-data mutation**.

| Signal | Observed | Interpretation |
|---|---|---|
| `runtime_sessions_total` | `0` | Zero at **one instant**, not a writer fence |
| `migrator_sessions_other` / `other_sessions_by_identity` | `0` / `0` | Zero at this instant |
| `pg_read_all_stats_member` | `false` | Inspector lacks activity detail privilege |
| `runtime_sessions_active` / `runtime_sessions_idle_in_transaction` | `null` / `null` | Active/idle breakdown **unavailable**, not zero |
| `writer_quiescence_verified` | `false` | Correctly NOT certified |
| `service_scaling` | `MANUAL`, `manualInstanceCount=1` | Backend still running; can reconnect/write |
| `latest_ready_revision` | `khedmah-pr-274-backend-00008-tg8` | Old Backend is still current |
| `traffic` / `tagged_revision_count` | `100%` to `00008-tg8` / `0` | Single traffic target, no tagged URL observed |
| `revisions` | 8 ready revisions (`00001`–`00008`) | **Only one** currently receives 100% traffic; older ready revisions must be considered during fence planning |
| `authority.all_granted` | `true` (7 checks) | Permission capability is NOT execution approval |
| `release_gates_verified` / `production_readiness_verified` | `false` / `false` | NO-GO |

The inspector's embedded candidate reference is **historical** (`backend@sha256:2146d382...`, build `8b1b7aee...`); do not use it as the current deployment target.

## 5. Frontend service identity and Cloud SQL IAM evaluation

- Exact Cloud Run Frontend service: `khedmah-pr-274-frontend`. Owner `gcloud run services describe ... --format=value(spec.template.spec.serviceAccountName)` returned `khedmah-pv2-frontend@khedmah-preview-v2-20261012.iam.gserviceaccount.com`.
- Exact-member read of the project's IAM bindings returned **`NO_DIRECT_PROJECT_BINDINGS`** for that Frontend service account. This tests only that project's direct bindings, not inheritance, resource-level grants or indirect paths.
- Owner then ran **Policy Troubleshooter** with resource `//cloudsql.googleapis.com/projects/khedmah-preview-v2-20261012/instances/khedmah-preview-v2-db`, principal the exact Frontend service account, permission `cloudsql.instances.connect`; reported **`overallAccessState: CANNOT_ACCESS`**. This is evidence that this **IAM Cloud SQL connect permission** is denied under that evaluation. **It is not proof that Frontend cannot reach Backend indirectly, possesses no DB credential, cannot use direct PostgreSQL TCP/public IP, or that all global IAM paths are blocked.** No IAM changes occurred.

## 6. Release candidate, Floot and source checks

- Backend service currently health/ready HTTP `200`; old app version `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`. Unauthenticated session GET `401` is expected. This does not validate authenticated product flows.
- Owner executed from `apps/backend`: `node --import tsx --test --test-concurrency=1 src/orders/order-validation-safety.test.ts src/orders/order.service.test.ts`: **20 passed, 0 failed** (offline/service tests only; not live SQL/E2E).
- Candidate backend Cloud Build **SUCCESS** ID `43477d0a-d1a1-4e15-8d14-54c4a0ccd397`, build-only immutable image `europe-west1-docker.pkg.dev/khedmah-preview-v2-20261012/khedmah-preview/backend@sha256:04c05ae59664ee8a51c4f3795aee50c4b94c257776c64c029ef4dc957ccb6a6c`. **Not deployed**, and currently schema-incompatible until 037 is attested.
- Floot public release unchanged since `2026-11-04T00:01:39.684Z`, source digest `49d52b158ff4bc3baf73905b343a4b1b1bbc6bca801a9f514baf3bbefc587c08`, domains `khedmah.uk` and `www.khedmah.uk`; editor changes are NOT public.
- Floot editor had **157/157** prior complete suite results and clean TypeScript; additional focused checks **3/3 PASS** and TypeScript clean on 11 November. These certify editor source only.
- Public canonical `/_api/integrations/khedmah_classifieds?view=list&page=1` HTTP `200`; legacy `/_api/integrations/khedmah_public?section=classifieds` live HTTP `502` vs editor `200`; anonymous KORA live `404` vs editor `401`. Floot public health proxy returned one transient `502` followed by `200`. Do not claim a permanent health outage or blanket classifieds outage.
- Release blocker [#369](https://github.com/khedma-sy/khedmah-digital-v1/issues/369): serving backend `f4f8ce2...` does not implement current-main atomic `expectedQuote` enforcement; editor forwarding and source-level 409 tests do not establish live API support. The new strict quote flag is opt-in and is not verified enabled.

## 7. Decision, remaining gates and safe next steps

**NO-GO — do not apply SQL migration 036/037, deploy either image, switch Preview traffic, enable strict quote/financial/taxi/Smart Admin functionality, merge a draft as a release authorization, or publish Floot.** Documentation commits and nonmutating inventory are allowed.

1. **Finish writer-surface inventory:** verify Cloud Run Frontend runtime account's effective access and database path (Policy Troubleshooter Cloud SQL connect now `CANNOT_ACCESS` for the requested principal/instance; indirect routes remain unverified), region-wide and cross-region services and Jobs, executing tasks, Scheduler in all applicable regions, external integrations/clients, and current PostgreSQL sessions. A zero snapshot cannot fence an active MANUAL ONE Backend.
2. **Recovery proof:** reconcile recent successful automated backups and PITR with an **independently validated isolated restore target and rollback/runbook**. Never restore onto or reset the existing Preview DB to manufacture readiness.
3. **Guarded schema evolution:** independent review of maintenance identity without DB access, revision retirement, DB writer fence and bounded, ordered migrations 036 then 037 (only after fresh catalog and predecessor locks); require acknowledged SQL COMMIT and independent exact readback. Handle unknown outcomes by staying in maintenance, not blind retry.
4. **Exact candidate, safe deployment:** verify image digest and source commit for `sha256:04c05...` on an approved compatible/nonproduction test lane, prove startup against confirmed 037 and rollback compatibility, then explicitly authorize reversible Preview-only canary.
5. **Authenticated acceptance:** real Google OAuth desktop/mobile; independent admin/business/professional/driver roles; legitimate customer→merchant→courier order; stale timestamp/total/currency returns `409` without state mutation/retry; taxi and restaurant dispatch and real-device alerting; recovery and observability sign-off.
6. **Only after GO:** evaluate a separate, explicitly authorized Floot public publication and staged production decision. Keep the source/Editor/live distinction and no-users assumption clearly documented.

**Evidence links:** [release blocker and chronological receipts, issue #369](https://github.com/khedma-sy/khedmah-digital-v1/issues/369); [release document PR #368](https://github.com/khedma-sy/khedmah-digital-v1/pull/368); `docs/project-control/CURRENT-STATE.md`, `NEXT-ACTION.md`, `FLOOT-SYNC-LEDGER.md`.

**Integrity summary:** All receipts here are either owner-pasted Google Cloud outputs or read-only GitHub/Floot checks, explicitly bounded by date and tool scope. This documentation-only update performs no GCP, Cloud SQL, IAM, API-enablement, runtime deployment, traffic, public Floot or production changes.
