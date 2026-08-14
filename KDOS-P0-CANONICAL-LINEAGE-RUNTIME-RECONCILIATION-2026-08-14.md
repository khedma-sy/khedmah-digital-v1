# KDOS P0 Canonical Migration Lineage and Runtime Contract Reconciliation — 2026-08-14

## 1. Root cause

The repository declared canonical schema level `016`, while its governed migration directory contained only `001–008` and `016`. Active repositories also addressed legacy tables that disagreed with the startup verifier. A clean database could therefore neither apply the declared lineage nor satisfy startup.

## 2. Historical autopsy

The deleted startup `SCHEMA_SQL` was inspected from Git history as evidence, not restored or executed. It explained the active legacy repository names but was not a canonical migration authority. Current migrations, runtime SQL, tests, startup anchors, CI manifests, and rollback dependencies were compared before implementation.

| Domain | Competing state | Canonical decision |
|---|---|---|
| Identity | `user_accounts/user_profiles/user_sessions` vs canonical account/profile identifiers | `core_user_accounts`, `profiles`, `identity_credentials`, `identity_sessions` |
| Professional | `professional_directory_profiles` vs `professional_profiles` | Extend and use `professional_profiles` only |
| Contact | `contact_actions` vs `contact_action_events`; missing target contract | `contact_action_events`; Migration 015 owns XOR/tracking |
| Media | owner/storage model vs entity/presentation model on one table | One `media_assets` owner/storage model with presentation columns added by 011 |
| Business | table assumed before the migrations that extend it | Business prerequisite is created in 004; later shared runtime structures are 010 |

## 3. Dependency correction

Migration 004 now creates the minimal Business prerequisite before historical migrations 007/008 extend it. Foreign keys in 004–007 now point to `core_user_accounts`. Contact tracking was removed from 007 so the approved target/tracking invariant has one owner: Migration 015.

## 4. Canonical 009–015 lineage

| Migration | Owned contract |
|---|---|
| 009 | Private credentials, canonical sessions, locale, audit log |
| 010 | Locations, Organizations, roles/permissions, canonical Professional runtime projection, provider support tables |
| 011 | Canonical media presentation extension without a second asset table |
| 012 | Saved Nearby location/radius/alerts preference |
| 013 | Owned/idempotent Nearby notifications and `read_at` |
| 014 | Discovery-only Supplier capabilities |
| 015 | Business XOR Professional Contact target, tracking CHECK, Professional-created index |

Every version `001–016` now has exactly one forward file and one rollback file. CI and database-readiness manifests enumerate the complete chain.

## 5. Identity runtime

The Identity repository now joins `core_user_accounts` to private `identity_credentials`, persists base profiles in `profiles`, and persists sessions in `identity_sessions`. Registration writes account and credential state transactionally. Email confirmation updates canonical lifecycle/account status. No active production Identity SQL references legacy account/profile/session tables.

## 6. Professional runtime

The Professional repository now reads and writes `professional_profiles`. Migration 010 adds the public-directory projection and moderation fields to that canonical table. Public and featured queries enforce `visibility=public`, `moderation_status=approved`, and `lifecycle_status=active`. Service Catalog eligibility uses the same canonical boundary.

## 7. Contact runtime

Contact action writes now use `contact_action_events`. Business inquiry eligibility now requires public visibility, approved moderation, approved trust, and active status. Professional eligibility remains public/approved/active. Migration 015 owns the target XOR, tracking CHECK, and Professional-created index; Migration 016 remains the submitter-scoped idempotency owner.

## 8. Media runtime

Migration 006 remains the owner/storage authority. Migration 011 adds `asset_type` and `sort_order` to the same table. Business and Professional repositories now translate their presentation API to canonical `owner_type`, `owner_id`, `storage_key`, and `public_url` columns instead of querying a competing entity schema.

## 9. Destructive-test safety

`createTestPool` now fails closed unless `ALLOW_DESTRUCTIVE_DB_TESTS=true`, accepts only database names ending `_test` or `_ci`, rejects known dangerous targets, and requires an explicit `SELECT current_database()` verification before fixture DDL. PostgreSQL-backed suites call that verification before setup.

## 10. Startup

Startup remains verification-only. It performs no migration, `CREATE`, `ALTER`, patch, or legacy fallback. Required schema level remains `016`, now backed by a locally complete migration chain. Business anchors are attributed to their actual creation migration (004).

## 11. Source tests

New contracts prove one forward/rollback pair for each version, the required anchors in 009–015, absence of active legacy repository names, and destructive database-name rejection. Existing migration workflow governance and schema-verifier contracts remain active.

## 12. Environment evidence

No PostgreSQL installation or retry was performed. Applying the complete chain to a disposable PostgreSQL database, rolling it back, and exercising real repository transactions remain an external runtime gate. Source completion must not be represented as PostgreSQL runtime proof.

## 13. Remaining work

- PostgreSQL forward/rollback and concurrent Contact evidence remains external.
- Browser/E2E remains external.
- Nearby, Notifications, and Supplier application modules remain separately authorized P1 work; this P0 created only the database contracts required by the declared canonical lineage.
- The historical 007 V2 extension requires a separate V1 scope-governance decision; it was not silently deleted or renumbered.
- Legacy-only test fixtures should converge on migration-applied fixtures before PostgreSQL runtime certification; the destructive guard prevents unsafe execution in the meantime.

## 14. Files

- Migrations `009–015` and paired rollbacks.
- Dependency repairs in migrations `004–007` and canonical FK reinforcement in `016`.
- Identity, Professional, Contact, Business, Media-facing repositories/services/types.
- Startup anchor attribution, migration workflow/readiness manifest, migration README.
- Destructive test pool guard and source contracts.

P0 CANONICAL LINEAGE SOURCE =
PASS

P0 ACTIVE LEGACY RUNTIME REFERENCES =
0

CANONICAL SCHEMA =
016 — COMPLETE SOURCE LINEAGE

POSTGRESQL RUNTIME =
EXTERNAL ENVIRONMENT GATE

BROWSER =
EXTERNAL ENVIRONMENT GATE

NEXT LEGAL MISSION =
POSTGRESQL CANONICAL 001–016 FORWARD / ROLLBACK VERIFICATION IN AN APPROVED DISPOSABLE ENVIRONMENT

STOP — AWAIT KDOS.
