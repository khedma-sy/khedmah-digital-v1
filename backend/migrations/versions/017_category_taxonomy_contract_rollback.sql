-- SEQ-02I rollback: remove Category references before their canonical authority.
ALTER TABLE service_listings DROP CONSTRAINT IF EXISTS service_listings_category_code_fk;
ALTER TABLE business_profiles DROP CONSTRAINT IF EXISTS business_profiles_category_code_fk;
DROP TABLE IF EXISTS categories;
