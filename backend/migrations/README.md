# Backend Migration Framework Foundation

## Mission 066 Foundation and Mission 067 Implementation Status

Mission 048 rollback rules remain the governing migration safety baseline. Mission 067 explicitly authorized `versions/001_core_identity_accounts.sql` and its paired rollback. Migrations 002 through 004 are not present in this repository state, so the dependency chain is incomplete and Migration 005 is not ready to be introduced.


This folder contains the migration framework foundation and explicitly approved implementation migrations. It defines migration naming, versioning, execution planning, rollback compatibility, and safety rules. It does not contain seed scripts, production migration execution, production deployment, credentials, tokens, secrets, or database URLs.

## Migration Naming Convention

Migration files must use `NNN_lowercase_snake_case.sql`, where `NNN` is a three-digit version such as `001`, `002`, or `066`.

## Migration Execution Structure

Migration execution must follow: validate name, read plan, apply forward, verify forward, prepare rollback, and verify rollback.

## Rollback Compatibility

Every migration must have a rollback plan, forward verification, and rollback verification before execution. Repository inclusion does not imply automatic or production execution.

## Forbidden Migration Scope

Marketplace, payment, order, commission, advertising, ranking, social graph, tracking, and other unapproved table migrations remain forbidden. Profile, professional profile, business profile, and organization migrations require their own explicit implementation missions and complete dependency predecessors.
