-- Mission 069Q rollback: remove only objects owned by 003_create_professional_profiles.sql.

DROP INDEX IF EXISTS professional_profiles_visibility_idx;
DROP INDEX IF EXISTS professional_profiles_lifecycle_status_idx;
DROP INDEX IF EXISTS professional_profiles_profession_type_idx;
DROP INDEX IF EXISTS professional_profiles_user_identifier_idx;
DROP TABLE IF EXISTS professional_profiles;
