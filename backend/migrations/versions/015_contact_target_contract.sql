ALTER TABLE contact_inquiries
  ALTER COLUMN business_profile_id DROP NOT NULL,
  ADD COLUMN professional_profile_id TEXT REFERENCES professional_profiles(professional_profile_identifier) ON DELETE RESTRICT,
  ADD COLUMN tracking_status TEXT NOT NULL DEFAULT 'submitted',
  ADD CONSTRAINT contact_inquiries_exactly_one_target_check CHECK ((business_profile_id IS NOT NULL) <> (professional_profile_id IS NOT NULL)),
  ADD CONSTRAINT contact_inquiries_tracking_status_check CHECK (tracking_status IN ('submitted','viewed','responded','closed'));
CREATE INDEX contact_inquiries_professional_created_idx ON contact_inquiries(professional_profile_id, created_at DESC) WHERE professional_profile_id IS NOT NULL;
