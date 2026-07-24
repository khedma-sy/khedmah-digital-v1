-- Mission 067 rollback plan for 001_core_identity_accounts.sql.
-- Reversible and non-destructive for unrelated schema: drops only indexes and table created by the paired forward migration.

DROP INDEX IF EXISTS core_user_accounts_lifecycle_status_idx;
DROP INDEX IF EXISTS core_user_accounts_account_status_idx;
DROP INDEX IF EXISTS core_user_accounts_identity_reference_idx;
DROP TABLE IF EXISTS core_user_accounts;
