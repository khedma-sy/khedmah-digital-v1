-- Mission 069P rollback: remove only objects owned by 002_create_profiles.sql.

DROP INDEX IF EXISTS profiles_visibility_idx;
DROP INDEX IF EXISTS profiles_lifecycle_status_idx;
DROP TABLE IF EXISTS profiles;
