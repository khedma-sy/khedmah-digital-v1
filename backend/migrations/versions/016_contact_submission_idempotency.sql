-- P1-01: race-safe Contact submission idempotency for Business and Professional targets.
-- The payload fingerprint is SHA-256 over normalized target and Contact fields; it stores no additional personal data.
CREATE TABLE contact_submission_idempotency (
  submitter_user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  inquiry_id TEXT NOT NULL,
  payload_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contact_submission_idempotency_submitter_key_unique UNIQUE (submitter_user_id, idempotency_key),
  CONSTRAINT contact_submission_idempotency_inquiry_unique UNIQUE (inquiry_id),
  CONSTRAINT contact_submission_idempotency_inquiry_fk FOREIGN KEY (inquiry_id)
    REFERENCES contact_inquiries(id) ON DELETE CASCADE,
  CONSTRAINT contact_submission_idempotency_key_format CHECK (
    CHAR_LENGTH(idempotency_key) BETWEEN 16 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT contact_submission_idempotency_fingerprint_format CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$')
);
