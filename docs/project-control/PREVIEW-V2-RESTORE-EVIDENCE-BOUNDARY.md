# Preview V2 — database writer isolation and recovery evidence boundary

**2026-11-12: NO-GO.** This document separates what GitHub Actions can actually prove from what still requires authorized Google Cloud access. No code in this PR touches `khedmah-preview-v2-db`, production services, runtime credentials, IAM, secrets or Floot public release.

## A. Synthetic PostgreSQL recovery rehearsal in CI

- Workflow: `.github/workflows/isolated-postgres-recovery.yml`, **pull_request only**, no OIDC, no Google Cloud secrets, `contents: read` only.
- Database engine: new **ephemeral** PostgreSQL 16 service on a GitHub-hosted Linux runner. Fixed source `khedmah_recovery_source_test`, separate restore target `khedmah_recovery_target_test`, host fixed to `127.0.0.1:5432`; all credentials are synthetic and discarded with the job.
- Script: `scripts/rehearse-isolated-postgres-recovery.sh`; refuses non-PR, non-GitHub-hosted, wrong repository, missing/forked/local environment, shared `DATABASE_URL`, Cloud SQL attachment or Google service credentials. Fixed DB names both end with `_test`; no arbitrary supplied destination, remote endpoint or production database.
- Actions performed **inside the ephemeral CI PostgreSQL instance only**: create three related synthetic fixture tables/rows, `pg_dump -Fc`, compute SHA-256, create **different** temporary target database, `pg_restore`, compare row/count/content signatures, prove the source remains unchanged by the restore, insert a later source-only row to show the snapshot/replay boundary, prove a target transaction rolls back, and prove a target **read-only role** can SELECT but cannot INSERT.
- The report includes local `restore_seconds`, the synthetic archive hash, and explicit `cloud_sql_backup_restored=false`, `cloud_sql_writer_isolation_verified=false`, `production_readiness_verified=false`, `release_authorized=false`. This is a **test of the procedure**, not a measurement of Cloud SQL RTO/RPO and not a recovery of application data or canonical schema.
- A successful job does **not** imply any Preview writer is blocked, that migrations 036/037 are safe, or that the Cloud SQL automated backup can be restored.

## B. Current live Preview V2 observations (prior owner-supplied receipts)

- Project `khedmah-preview-v2-20261012`, region `europe-west1`, backend `khedmah-pr-274-backend`, database instance `khedmah-preview-v2-db`.
- 2026-11-11 owner read-only report: Backend manual instance count **1**, serving revision `00008-tg8`, traffic 100% there; point-in-time PostgreSQL session count **0**, **not** durable writer quiescence. Inspector lacked `pg_read_all_stats` membership, so active/idle details were unknown. Cloud Run regional Jobs and Scheduler inventoried; Cloud Tasks API returned `SERVICE_DISABLED`, which is **not** zero queues; other regions and external clients not covered.
- Exact frontend SA failed Cloud SQL connect in Policy Troubleshooter for the instance, but no-direct-project-binding and that one denial **do not rule out indirect backend writing, direct TCP or external clients**.
- Cloud SQL PITR / automated backup metadata is not a verified independent restore. Previous 2026-10-11 isolated restore of a **different** `khedmah-v1-db` backup returned zero application tables. Do not replay it or classify it as current Preview V2 recovery readiness.
- 2026-11-11 catalog showed successor schema `036/037` prerequisites **not met** (`quota_target=false`); migration execution and serving backend cutover remain blocked. Current served backend version `f4f8ce2...` predates required atomic `expectedQuote` contract.

Sources: `docs/project-control/PREVIEW-V2-OWNER-READONLY-RECEIPTS-2026-11-11.md`, `docs/project-control/PRODUCTION-RECONCILIATION.md`, GitHub issues [#369](https://github.com/khedma-sy/khedmah-digital-v1/issues/369) and [#373](https://github.com/khedma-sy/khedmah-digital-v1/issues/373).

## C. Gates required to claim **live** writer isolation and recovery

1. **Authorized read-only GCP inventory:** all Cloud Run services/revisions/jobs/executions **across relevant regions**; Scheduler/Cloud Tasks (a disabled API is unknown); database connection paths, inherited IAM and service accounts, external credentials/clients and active DB sessions with sufficient privileges. Pinned script `scripts/read-preview-v2-regional-writer-surfaces.py --inspect` addresses only services/jobs/executions in one region. Preserve timestamps, exact project/instance and sanitized evidence, never emit secrets.
2. **Durable writer fence:** independently reviewed runbook proving *every* writer is unable to write during schema/restore boundaries. A zero-session snapshot or `manualInstanceCount=0` alone is not proof. No scaling, IAM revoke, secret rotation, SQL role mutation or service stop is authorized by this document.
3. **Real isolated Cloud SQL recovery:** separately approved **new target instance**, never existing Preview/Production. Restore a **current verified** `khedmah-preview-v2-db` backup (or PITR point) only to that target; verify target network isolation, role separation, catalog/table/constraints, selected non-sensitive integrity counts, restore-operation timeline and rollback procedure. Confirm RPO/RTO from full timeline and record teardown separately; never claim successful populated-data recovery from a metadata-only operation.
4. **Serving/backend acceptance:** independently inspected immutable Backend image with compatible 037 schema, and authenticated synthetic customer→merchant→courier E2E with stale quote HTTP 409/no mutation, customer/merchant ownership restrictions, Google login, mobile location/push notification checks. No production/public deployment or Floot publication without GO.

## Decision

**Source-only CI is permitted. Current Preview/Production Cloud SQL restore, IAM changes, writer disablement, schema 036/037 migrations, deployment and Floot publication remain NO-GO** pending separate independent evidence and authorization.
