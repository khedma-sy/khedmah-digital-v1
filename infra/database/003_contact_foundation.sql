-- Contact foundation database boundary for Khedmah Digital V1.
-- Creates only the approved contact_inquiries entity for controlled inquiry submission.
-- This file is limited to controlled contact inquiry persistence.

CREATE TABLE contact_inquiries (
  id UUID PRIMARY KEY,
  business_profile_id UUID NOT NULL,
  submitter_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT,
  correlation_id TEXT
);

-- Future implementation must connect business_profile_id to the approved business profiles
-- persistence boundary after that boundary is present in the repository.
-- Future implementation must append audit events to the existing audit_logs boundary.
