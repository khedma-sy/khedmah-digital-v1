# Schema and release gates — repository review, not execution approval

Initial review: 2026-10-04 at `5a961be5035dce1197ba2d0c65519e86f65ca4c6`. Reconciled 2026-10-05 with main `a2a26f8b27e63a2e041e43d5657cf2ce78700c24` in `khedma-sy/khedmah-digital-v1`; the schema/release source-map files below are unchanged between those commits. #250 changed role-bootstrap classification and tests, not the schema lineage.

The current operating mode allows one reviewed read-only Cloud Shell command at a time. This document does not authorize Production workflows, credential rotation, database writes, DNS changes or Floot changes. Continue [Production reconciliation](PRODUCTION-RECONCILIATION.md) before selecting an operation.

## Source-backed correction to the earlier plan
The prior plan began schema work at 025. That is not a complete fresh-database path. The canonical source says version 023 is intentionally unused, and it lists the earlier baseline and retained versions 021, 022, and 024. Their installed Production state has NOT been established by this review.

Do not infer missing or completed database work from the file names, from a failed PREPARE, or from green Preview tests. Select the next migration only after reviewing actual installed schema and execution evidence. Do not replay an already installed migration blindly.

## Source map
All links below refer to repository paths reviewed at the source SHA above. Re-read their current versions before execution.

| Stage | Source authority | What is established in source | Live evidence still required |
| --- | --- | --- | --- |
| Lineage | [backend/migrations/README.md](../../backend/migrations/README.md) | Canonical forward/rollback lineage through 034, with 023 intentionally unused; startup verifies but does not apply migrations. | Installed schema/catalog level and historical execution records. |
| Baseline 001–020 | [production-baseline-001-020.yml](../../.github/workflows/production-baseline-001-020.yml) | Fresh-database initialization; exact latest-main SHA, confirmation and recent successful backup gates; baseline manifest derived from twenty named SQL files. | A proven fresh database if initialization is needed, role isolation, reviewed manifest, and successful baseline evidence. |
| 021 / 022 / 024 | [production-operator.yml](../../.github/workflows/production-operator.yml) and [run-production-migration.sh](../../scripts/run-production-migration.sh) | Separate schema operator with three explicit APPLY modes; runner accepts only the three approved names and pinned checksums. | Which retained versions are installed, checksum/identity checks, and backup evidence for the selected operation. |
| 025–034 | [production-migrations-025-034.yml](../../.github/workflows/production-migrations-025-034.yml) | Exactly one selected migration per workflow; explicit migration number, latest-main SHA, confirmation and backup inputs. | Prerequisite schema, execution-specific success/postcondition evidence and the correct backup for each approved operation. |
| Release | [production-operator-new-account.yml](../../.github/workflows/production-operator-new-account.yml) | Separate VERIFY_ONLY / DEPLOY_PRODUCTION modes. The hardened-role predeploy job runs only for DEPLOY_PRODUCTION. Taxi trips must remain false in this source. | Actual hardened database, release readiness, owner approval and postdeployment acceptance. |

## Governed order for a proven fresh database

Role cutover and verification → baseline 001–020 → 021 → 022 → 024 → 025 → 026 → 027 → 028 → 029 → 030 → 031 → 032 → 033 → 034 → HARDEN and verification → release readiness → approved deployment and acceptance.

This is a dependency map, not a command queue. On an existing database, first determine which steps have already been applied. Baseline initialization is not a generic repair operation. Never create version 023 to fill the intentional gap.

## Exact retained names after the baseline

| Version | Source name |
| --- | --- |
| 021 | `021_provider_reports` |
| 022 | `022_expand_category_taxonomy` |
| 023 | Intentionally unused; no operation. |
| 024 | `024_product_store` |
| 025 | `025_classifieds` |
| 026 | `026_cash_fulfillment_orders` |
| 027 | `027_mobility_document_reviews` |
| 028 | `028_platform_notifications` |
| 029 | `029_taxi_pricing_revisions` |
| 030 | `030_billing_credits_subscriptions` |
| 031 | `031_taxi_operational_approvals` |
| 032 | `032_taxi_operational_profile_gate` |
| 033 | `033_billing_admin_role` |
| 034 | `034_food_order_promotions` |

The obsolete draft PR #172's `026_ai_admin_control_plane` is not the canonical 026 above and must not be reinstated.

## Backup and confirmation evidence is operation-specific

The database role-bootstrap workflow is different from the schema workflows below: it has no backup input, backup-age gate or PITR/restore check. Its transition secret/password writes occur before the prepare SQL compares the actual system-role manifest. Review manifest, effective IAM and recovery evidence before dispatch; do not apply the schema workflow's automatic backup guarantees to PREPARE. See [the gate matrix](PRODUCTION-RECONCILIATION.md#gate-matrix).

The reviewed baseline workflow requires backup status SUCCESSFUL, description `khedmah-before-baseline-<sha7>`, and end time no more than 86,400 seconds old. Its confirmation pattern is `INITIALIZE_KHEDMAH_SCHEMA_001_020_<sha7>`.

The reviewed 025–034 workflow requires backup status SUCCESSFUL, description `khedmah-before-<NNN>-<sha7>`, and end time no more than 86,400 seconds old. Its confirmation pattern is `APPLY_KHEDMAH_MIGRATION_<NNN>_<sha7>`.

These are patterns extracted from the source, not ready-to-run confirmations. Recompute against the actual latest approved main. Do not reuse an old backup identifier without checking instance, operation description, completion time, and recovery suitability. This review has not tested a restore or the current PITR state.

## Two VERIFY_ONLY modes are not interchangeable

1. `production-operator.yml`, VERIFY_ONLY: the reviewed verify job checks configured target, service-account metadata, instance region and enabled migration-secret alias. The migration job is conditional on an APPLY mode. This mode alone does not certify the installed schema.
2. `production-operator-new-account.yml`, VERIFY_ONLY: the reviewed source runs Google/Firebase/identity/operations/deployment-readiness validators. Its separate `Verify hardened production database roles before deployment` step is explicitly conditional on DEPLOY_PRODUCTION. Therefore do not treat a VERIFY_ONLY success as proof that this particular hardened-role job executed.

Always record workflow path, mode, exact source SHA, run ID, execution ID where applicable, and the specific checks that actually ran. A green label without its scope is insufficient.

## Operator checklist — one reviewed read-only step at a time

- Re-read main and the active implementation PR head; confirm the recorded #249/#250 merge evidence and check the active head's own CI and review findings. Do not resume the merged documentation PR as unfinished work.
- Resolve actual Production PostgreSQL role memberships and the latest execution-specific system-role manifest; do not repeat the already supplied blank metadata table as though it were new proof.
- Verify canonical deployer and necessary IAM, alias/version metadata without secret payloads, current backup/PITR evidence, and restore plan.
- Establish installed canonical schema through supported read-only catalog checks and available historical evidence. Do not assume a migration ledger exists or invent a ledger query.
- Choose one approved operation only after all relevant prerequisites and explicit owner authorization. Give one short reviewed command at a time; do not store executable production commands tied to stale SHAs.

## Unresolved limits

This document verifies repository contracts only. It does not establish actual Production role state, baseline completion, applied migrations, live IAM correctness, current recovery readiness, or Floot compatibility. The original review used GitHub reads; the 2026-10-05 reconciliation also has a local checkout and selected owner-supplied Cloud Shell metadata, but no connected database/Cloud Shell session in this workspace. [CURRENT-STATE.md](CURRENT-STATE.md#progress-reporting) records the planning indicator and its provenance; it is not measured elapsed labor or a certified product completion percentage.
