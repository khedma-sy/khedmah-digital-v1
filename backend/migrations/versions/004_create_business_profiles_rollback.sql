-- Mission 069 rollback: removes only objects created by 004_create_business_profiles.sql.
DROP INDEX IF EXISTS business_profiles_lifecycle_status_idx;
DROP INDEX IF EXISTS business_profiles_visibility_idx;
DROP INDEX IF EXISTS business_profiles_business_type_idx;
DROP TABLE IF EXISTS business_profiles;
