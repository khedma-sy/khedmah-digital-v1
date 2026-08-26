CREATE TABLE provider_reports (
  report_identifier TEXT PRIMARY KEY,
  reporter_user_identifier TEXT NOT NULL REFERENCES core_user_accounts(user_identifier) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('business', 'professional')),
  business_profile_id TEXT REFERENCES business_profiles(id) ON DELETE CASCADE,
  professional_profile_identifier TEXT REFERENCES professional_profiles(professional_profile_identifier) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK (reason_code IN ('inaccurate_information', 'inappropriate_content', 'impersonation', 'closed_business', 'other')),
  details TEXT NOT NULL CHECK (CHAR_LENGTH(details) BETWEEN 10 AND 1000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'resolved', 'dismissed')),
  reviewed_by_user_identifier TEXT REFERENCES core_user_accounts(user_identifier) ON DELETE SET NULL,
  resolution_note TEXT CHECK (resolution_note IS NULL OR CHAR_LENGTH(resolution_note) BETWEEN 5 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_reports_exactly_one_target_check CHECK (
    (target_type = 'business' AND business_profile_id IS NOT NULL AND professional_profile_identifier IS NULL)
    OR
    (target_type = 'professional' AND professional_profile_identifier IS NOT NULL AND business_profile_id IS NULL)
  )
);

CREATE INDEX provider_reports_status_created_idx ON provider_reports(status, created_at DESC);
CREATE UNIQUE INDEX provider_reports_open_reporter_target_idx ON provider_reports (
  reporter_user_identifier,
  target_type,
  COALESCE(business_profile_id, ''),
  COALESCE(professional_profile_identifier, '')
) WHERE status IN ('submitted', 'in_review');
