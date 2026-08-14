-- P1-01 rollback: remove only the idempotency object owned by Migration 016.
-- Migration 015 Contact inquiries, target constraints, and indexes remain intact.
DROP TABLE IF EXISTS contact_submission_idempotency;
