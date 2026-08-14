DROP TABLE IF EXISTS trust_history;
DROP TABLE IF EXISTS verification_requests;
DROP TABLE IF EXISTS business_social_links;
DROP TABLE IF EXISTS business_branches;
DROP TABLE IF EXISTS business_opening_hours;
DROP TABLE IF EXISTS service_listings;
DROP INDEX IF EXISTS professional_profiles_public_eligibility_idx;
ALTER TABLE professional_profiles DROP COLUMN IF EXISTS featured_at, DROP COLUMN IF EXISTS is_featured, DROP COLUMN IF EXISTS skills,
  DROP COLUMN IF EXISTS country_code, DROP COLUMN IF EXISTS city_code, DROP COLUMN IF EXISTS availability, DROP COLUMN IF EXISTS bio_en,
  DROP COLUMN IF EXISTS bio_ar, DROP COLUMN IF EXISTS headline_en, DROP COLUMN IF EXISTS headline_ar, DROP COLUMN IF EXISTS moderation_status;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_organization_fk;
DROP TABLE IF EXISTS organization_members;
DROP TABLE IF EXISTS organizations;
DROP TABLE IF EXISTS locations;
