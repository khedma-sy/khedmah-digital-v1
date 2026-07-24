# Backend Migration Framework Foundation

## Mission 066 Boundary

Migrations will be introduced later as executable files only after explicit implementation approval. Mission 048 rollback rules remain the governing migration safety baseline. No database tables are created in this foundation.


This folder contains the migration framework foundation only. It defines migration naming, versioning, execution planning, rollback compatibility, and safety rules. It does not create business migrations, database tables, seed scripts, production migration execution, production deployment, credentials, tokens, secrets, or database URLs.

## Migration Naming Convention

Migration files must use `NNN_lowercase_snake_case.sql`, where `NNN` is a three-digit version such as `001`, `002`, or `066`.

## Migration Execution Structure

Future migration execution must follow: validate name, read plan, apply forward, verify forward, prepare rollback, and verify rollback.

## Rollback Compatibility

Every future migration must have a rollback plan, forward verification, and rollback verification before execution. Phase 1 does not execute SQL and does not create business tables.

## Forbidden Migration Scope

Marketplace, payment, order, commission, advertising, ranking, social graph, tracking, user, profile, organization, and service table migrations are forbidden in this phase.
