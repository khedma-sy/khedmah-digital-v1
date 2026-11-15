# Khedma Digital — Verified lab recovery and next executable release gate (2026-11-15)

> This is a dated owner-evidence handoff. It **supersedes the restore-not-yet-done statements** in the 2026-11-12 front-door documents. It does **not** certify launch, authorize production changes or authorize lab SQL migrations. **Full platform NO-GO; fixed-weight indicator 47/100 provisional** until signed new evidence warrants recalculation.

## What has actually been achieved (owner Cloud Shell receipts)

- Independent lab GCP project: `khedmah-restore-lab-20261112`. Source remains `khedmah-preview-v2-20261012`; no source database mutation in supplied receipts.
- Lab billing enabled and prerequisite APIs enabled. The lab has a separate custom-mode VPC `khedmah-restore-private`, subnet `khedmah-restore-ew1` (`10.240.8.0/24`), Private Services Access allocation `10.166.0.0/16` and an active private-services peering. No reuse of the default network for SQL.
- Lab egress VPC rules individually read back **VERIFIED**: `khedmah-lab-deny-egress` denies IPv4 to `0.0.0.0/0` at priority 1000; `khedmah-lab-allow-postgres` allows TCP/5432 into PSA CIDR at priority 900. A configuration match does **not** prove packet-level Cloud Run isolation or hierarchical firewall policy status.
- Both source and target project VPC-SC perimeter lookups returned no enforced/dry-run perimeter. Temporary organization IAM reader role was removed and **verified removed**.
- Isolated lab Cloud SQL `khedmah-restore-pg16-20261114`: PostgreSQL 16 Enterprise `db-custom-1-3840`, ZONAL, private IP present, public IPv4 disabled, SSL mode `ENCRYPTED_ONLY`, `RUNNABLE`, target-only access verified.
- Source backup `1794621600000`, completed **2026-11-14T02:30:28.008Z**, had been `SUCCESSFUL`. Cross-project restore to the lab SQL target **completed successfully**. Verified target operation **`RESTORE_VOLUME DONE`**, errors zero, target project/instance match, target remains RUNNABLE and private-only, database `khedmah` exists. Earlier `RESTORE_OPERATION_UNVERIFIED` was a postflight false negative due to querying only the wrong operation-type string. **Do not repeat restore.**
- Catalog-level SQL query against the restored lab has **NOT run**. Two bare SQL attempts were accidentally submitted to Bash and never touched PostgreSQL. Lab instance showed `DATA_API: NOT_ENABLED`, `IAM_DATABASE_AUTH: False`; this only blocks that particular gcloud execute-sql path, **not** the successful restore.

## Floot published/editor proof on 2026-11-15

- Published app is **LIVE**, Floot release `17944528331124c03df28-23e1-4345-ad73-f248adfce602` from 2026-11-12T03:07:07Z, mapped to the user's custom domains. Current editor source version at audit `1794668406559`; NOT re-published in this pass.
- Editor TypeScript **clean** and the **160 current helper spec files PASS** in 8 complete 20-file batches, including two hook specs (160 passed, 0 failed).
- Anonymous GETs against the published origin: canonical classifieds and legacy classifieds **200 JSON**; categories **200 JSON** (114 returned); cities **200 JSON** (14 returned); professional/business city search **200 JSON** (0 matched rows for the queried Damascus filters); GPS nearby search **200 JSON** (0 matched rows for the queried coordinates). Zero rows are *not* proof of a fault or success of real user onboarding.
- Canonical anonymous KORA admin endpoint `/_api/integrations/khedmah_admin_modules?module=kora` **401 JSON** (correct protected behavior), likewise categories admin. The obsolete/nonexistent alias `/_api/integrations/khedmah_kora` returns 404 and is **not** evidence that the canonical module is broken. `/platform/admin/kora` and `/platform/map` return 200 HTML **shell only**; logged-in UX, map display and real location/roles are unproved.
- No new Floot publish or production backend mutation was attempted in this pass.

## Next actionable stage — only missing proof, no recycled checks

1. **Lab catalog proof with isolated access:** establish a dedicated *lab-only* PostgreSQL read-only login, VPC-attached query execution in `europe-west1` with `all-traffic` egress and no external network, or an explicitly approved equivalent. Run `BEGIN READ ONLY` / catalog-only proof comparing the restored database to current-main Backend `REQUIRED_CANONICAL_SCHEMA_VERSION = '037'` and its canonical anchors, especially 035 specialized admin role check, 036 rolling classifieds quota function and 037 media private-evidence constraints. No source-project secret reuse, public Cloud SQL IP, automatic Data API enabling or production migrations.
2. **If needed, authorized lab-only migration:** classify exact missing prerequisites first; use repo-governed lineage and SHA-pinned scripts, one scoped step at a time. No blind replay of 035–037; version 023 deliberately absent. Lab restoration does not certify the schema.
3. **Isolated compatible Backend:** build from reviewed immutable main source (record Git SHA/image digest), deploy into lab only with nonproduction database credentials, no SMTP/FCM/payment/dispatch real credentials, no scheduler/worker/background writes unless approved for synthetic fixtures; target custom VPC and all-traffic egress. Verify runtime health/readiness and actual catalog contract, not merely build success.
4. **Release gates:** run signed authenticated distinct-identity E2E, customer→merchant→courier with exact quote / stale 409 / idempotency; restaurant foreground + locked-screen notification; taxi full ride and document Smart Admin human-review activation; professional registration→review→Nearby plus location map, and cross-role denial. Never unlock taxi/native approvals/billing from a source-only green run.
5. **Cost control:** the lab Cloud SQL is billable while RUNNABLE. Budget/alert is not an automatic hard cap. Record elapsed runtime and remove or safely deactivate lab infrastructure after the bounded test; preserve handoff/results without revealing records, tokens, PII or passwords.

## Immutable source/status scope

GitHub main last observed `b661729a505ad4d25b5ab0748e32543ae2827f54`, zero open PRs before this documentation branch. `docs/project-control/CURRENT-STATE.md` and `NEXT-ACTION.md` date their own front-door data 2026-11-12; those documents contain older historical baselines that must not be mistaken for the current recovery result. Evidence log: [issue #373](https://github.com/khedma-sy/khedmah-digital-v1/issues/373). This handoff is **readiness documentation**, not a deployment authorization. Production readiness **NO-GO / 47/100 provisional**.
