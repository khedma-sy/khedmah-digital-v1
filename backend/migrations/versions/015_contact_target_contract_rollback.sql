DROP INDEX IF EXISTS contact_inquiries_professional_created_idx;
ALTER TABLE contact_inquiries DROP CONSTRAINT IF EXISTS contact_inquiries_tracking_status_check,
  DROP CONSTRAINT IF EXISTS contact_inquiries_exactly_one_target_check,
  DROP COLUMN IF EXISTS tracking_status, DROP COLUMN IF EXISTS professional_profile_id;
ALTER TABLE contact_inquiries ALTER COLUMN business_profile_id SET NOT NULL;
