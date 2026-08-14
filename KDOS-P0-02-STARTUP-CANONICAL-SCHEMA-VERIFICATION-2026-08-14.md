# KDOS P0-02 — Startup Canonical Schema Verification Hardening

**Date:** 2026-08-14  
**Scope:** P0-02 only

## 1. Autopsy

`DatabaseMigrator.onModuleInit()` executed a large embedded `SCHEMA_SQL` statement. It created and altered objects, logged success without inspecting the resulting catalog, and represented a second, legacy schema authority. In particular, it created `professional_directory_profiles`, while the governed canonical migration creates `professional_profiles`. This was both fail-open verification and forbidden startup DDL.

The repository contains forward/rollback files numbered 001 through 008. It does **not** contain forward files 009 through 015 or a migration ledger in this checkout. The required code-lineage contract supplied for this repair nevertheless requires canonical level 015. The verifier therefore uses explicit 001–015 domain anchors, including the distinctive 015 Contact anchors, rather than claiming that file presence proves an applied database.

### Autopsy matrix

| Domain | Required migration | Table | Critical columns | Integrity constraint | Operational/correctness index | Previously verified? | Risk |
|---|---:|---|---|---|---|---|---|
| Identity account | 001 | `core_user_accounts` | identifiers and lifecycle | — | — | No | Wrong identity authority accepted |
| Base profile | 002 | `profiles` | identifiers, lifecycle, visibility | — | — | No | Ownership/visibility drift |
| Professional | 003 | `professional_profiles` | canonical identifiers, moderation, lifecycle | lifecycle CHECK | — | No | Legacy directory schema accepted |
| Contact | 004/015 | `contact_inquiries`, `contact_action_events` | both targets, status, tracking, time | target XOR; tracking CHECK | professional/created index | No | 014 schema accepted; ambiguous target |
| Sessions | 009 | `identity_sessions` | identity, token, expiry, revocation | — | — | No | Authentication repository mismatch |
| Business | 010 | `business_profiles` | visibility, moderation, trust, status | — | — | No | Ineligible profile exposure |
| Location/org/auth | 010 | `locations`, `organizations`, `roles`, `permissions` | table anchors | — | — | No | Active authority dependencies absent |
| Media | 011 | `media_assets` | table anchor | — | — | No | Runtime persistence failure |
| Nearby | 012 | `nearby_preferences` | owner, coverage, location | — | — | No | Discovery preference mismatch |
| Notification | 013 | `nearby_notifications` | owner, idempotency, `read_at` | — | owner/idempotency index | No | Read-state/idempotency failure |
| Supplier | 014 | `supplier_capabilities` | identity, business, type, coverage, status | — | — | No | Active discovery queries fail |

## 2. Existing verification weakness

The old implementation did not verify any migration version, catalog column, named constraint, or named index. `IF NOT EXISTS` also concealed incompatible pre-existing objects. Its success log meant only that PostgreSQL accepted the DDL batch.

## 3. Migration-state decision

No canonical applied-migration ledger exists in this checkout. P0-02 does not introduce a heavyweight framework or write a ledger at startup. The smallest reliable read-only state marker is the complete anchor set, with the migration-015 named Contact constraint/index as the terminal marker. This is stronger than a mutable version number alone: a database cannot claim 015 while omitting the 015 structure.

The absence of migration files 009–015 is recorded as repository lineage debt; this mission neither reconstructs nor applies migrations.

## 4. Required schema version

`REQUIRED_CANONICAL_SCHEMA_VERSION` is explicitly `015`. It is included in every incompatibility error and the success log. The anchor declarations retain the introducing migration for diagnostic output.

## 5. Table anchors

Startup verifies active identity, profiles, professional, contact, sessions, business, location, organization, authorization, media, nearby, notification, and supplier tables. Table matching is exact and limited to `current_schema()`.

## 6. Column anchors

Critical repository-facing identity/session identifiers, eligibility/lifecycle fields, Contact 015 discriminator/tracking fields, notification read state, nearby ownership/coverage, and supplier discovery capability/coverage fields are verified.

## 7. Constraint anchors

The verifier checks named security/integrity anchors rather than every cosmetic constraint: Professional lifecycle, Contact exactly-one-target, and Contact tracking-state CHECK contracts.

## 8. Index anchors

Only correctness/operational contract indexes are required: the 015 professional/created Contact index and notification owner/idempotency index. Startup is not an exhaustive performance auditor.

## 9. Contact 015

`professional_profile_id`, `tracking_status`, the target XOR CHECK, tracking CHECK, and `contact_inquiries_professional_created_idx` are mandatory. An otherwise complete 014-equivalent catalog fails.

## 10. Notification 013

`nearby_notifications.read_at`, notification ownership/idempotency columns, and the owner/idempotency index are mandatory.

## 11. Supplier 014

The minimum non-transactional discovery contract is `supplier_capabilities` with capability identity, owning business, supplier type, coverage location, and status. No inventory, order, payment, or transaction field was added.

## 12. Professional canonical protection

Only `professional_profiles` with canonical identifier, owner, visibility, moderation, and lifecycle columns satisfies the verifier. `professional_directory_profiles` is neither queried as an alias nor accepted as fallback.

## 13. Legacy DDL decision

The embedded legacy schema was private to `DatabaseMigrator`, had no other reference, and was removed. There is no startup execution path for `CREATE`, `ALTER`, migration patching, or legacy fallback.

## 14. Fail-fast behavior

The verifier throws `CanonicalSchemaError` with `CANONICAL_SCHEMA_INCOMPATIBLE`, required level, domain, anchor kind/name, and introducing migration. It never interpolates connection settings or `DATABASE_URL`.

## 15. Startup ordering and health

Nest awaits provider `onModuleInit()` during application initialization. `main.ts` calls `createBackendApp()` before `app.listen()`. A rejected verifier prevents creation from completing and therefore prevents the listener and `/health` readiness endpoint from being advertised. There is no degraded-success branch.

## 16. Test matrix

Unit/contract tests use catalog rows in memory and a mocked `DatabasePool`; they require no PostgreSQL and perform no destructive operation. Cases cover full pass, missing table, column, XOR, tracking CHECK, notification `read_at`, supplier coverage, legacy Professional only, 014-equivalent state, no-DDL query behavior, sanitized diagnostics, and rejected initialization.

## 17. Environment limitations

PostgreSQL integration was not attempted, as explicitly required. This environment therefore provides source-side/catalog-contract proof only. The repository's absent 009–015 migration artifacts must be reconciled by the separate governed migration lineage process before a real database can satisfy this verifier.

## 18. Files

- `apps/backend/src/database/database.migrator.ts`
- `apps/backend/src/database/database.migrator.test.ts`
- `KDOS-P0-02-STARTUP-CANONICAL-SCHEMA-VERIFICATION-2026-08-14.md`

## 19. Commit

This report is finalized in the same P0-02 commit as the verifier and tests. The final commit identifier is reported by the delivery record because a commit cannot truthfully cite its own final object ID from within its contents.

## 20. Remaining P1 list

P1 remains exactly **8**, unchanged. P0-02 did not begin, redefine, or implement any P1 item.

---

P0-02 =  
PASS (source-side)

P0 SOURCE BLOCKERS REMAINING =  
0

P0 EXTERNAL ENVIRONMENT GATES =  
P0-01 PostgreSQL Runtime Verification

P1 REMAINING =  
8

NEXT LEGAL MISSION =  
P0-01 PostgreSQL Runtime Verification when the approved external PostgreSQL environment is available; otherwise stop pending governed mission selection.
