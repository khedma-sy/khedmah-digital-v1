# Canonical database migrations

`backend/migrations/versions` is the only migration authority for the runtime application. The governed lineage contains exactly one forward file and one independently scoped rollback file for every version from `001` through `018`.

Migrations are never executed by application startup. Startup performs read-only PostgreSQL catalog verification and fails with `CANONICAL_SCHEMA_INCOMPATIBLE` when the installed schema does not meet the required canonical level.

## Lineage

| Version | Contract |
|---|---|
| 001 | Core account identity — `001_core_identity_accounts.sql` |
| 002 | Base profiles |
| 003 | Professional profile identity |
| 004 | Business prerequisite, Analytics, and Contact foundation |
| 005 | Email verification and administrative roles |
| 006 | Private-owner media storage |
| 007 | Historical provider/V2 extension |
| 008 | Canonical provider service-radius alias |
| 009 | Runtime credentials, sessions, profile locale, and audit log |
| 010 | Organizations, authorization, locations, Professional runtime projection, and supporting provider structures |
| 011 | Unified media presentation fields on `media_assets` |
| 012 | Nearby saved-location preferences |
| 013 | Nearby notification ownership, idempotency, and read state |
| 014 | Discovery-only Supplier capabilities |
| 015 | Business XOR Professional Contact target and tracking state |
| 016 | Submitter-scoped Contact submission idempotency |
| 017 | Canonical platform-governed Category taxonomy and Business/Service references |
| 018 | Shared persistent rate-limit buckets for multi-instance backend enforcement |

## Safety rules

- Mission 048 rollback and environment-separation principles remain governing safety requirements.
- Apply forward migrations in numeric order only.
- Validate the entire forward/rollback manifest before applying anything.
- Never store credentials, connection strings, tokens, or production URLs in migration files.
- Never apply or patch migrations at application startup.
- Run destructive integration tests only with `ALLOW_DESTRUCTIVE_DB_TESTS=true`, a disposable database ending in `_test` or `_ci`, and successful `current_database()` verification.
- Repository inclusion is not evidence that migrations were applied to any external environment.
