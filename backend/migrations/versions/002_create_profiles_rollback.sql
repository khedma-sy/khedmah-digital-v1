-- Mission 068 rollback: removes only objects created by 002_create_profiles.sql.
DROP INDEX IF EXISTS profiles_lifecycle_status_idx;
DROP INDEX IF EXISTS profiles_visibility_idx;
DROP INDEX IF EXISTS profiles_profile_type_idx;
DROP TABLE IF EXISTS profiles;
