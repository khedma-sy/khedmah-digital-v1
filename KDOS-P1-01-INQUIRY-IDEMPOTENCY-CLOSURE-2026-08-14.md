# KDOS P1-01 — Inquiry Idempotency Closure

**Date:** 2026-08-14  
**Scope:** P1-01 only

## 1. Root cause

The Contact service generated a fresh inquiry UUID for every accepted call and the repository protected only that random primary key. The form disabled its button while React state said `submitting`, but there was no durable identity for a retry, no submitter-scoped uniqueness, and no conflict detection. Network retries and concurrent requests could therefore create separate inquiries.

## 2. Idempotency architecture

The client sends an opaque `Idempotency-Key` header. The authenticated session supplies the submitter identity; no submitter identifier is accepted from the client. The service normalizes the legal Contact fields and canonical target, hashes that representation with SHA-256, and asks the repository to atomically persist the inquiry and idempotency marker.

The repository first supports a fast lookup by `(submitter_user_id, idempotency_key)`. The authoritative race boundary is still PostgreSQL: inquiry and marker inserts run in one transaction and the named composite UNIQUE constraint serializes concurrent attempts. A losing transaction rolls back its tentative inquiry and reads the winner's receipt.

## 3. Key lifecycle

A key must be 16–128 opaque ASCII characters in the restricted safe alphabet. The frontend creates it only when final submission begins. A failed/network retry retains the key; an in-flight double click is ignored; a successful receipt permanently closes that guard. The explicit “send another inquiry” action starts a new journey and clears the key.

Missing and invalid keys produce the existing safe Contact validation error. No expiration mode was adopted, so no unsupported/expired-key state exists.

## 4. Migration 016

`016_contact_submission_idempotency.sql` adds only `contact_submission_idempotency`. It stores submitter, opaque key, resulting inquiry reference, normalized-payload fingerprint, and creation time. It adds format checks, the submitter/key uniqueness boundary, inquiry uniqueness, and an inquiry foreign key.

The independent rollback drops only the Migration 016 table. It does not alter or remove Migration 015 Contact objects.

## 5. Database uniqueness

`contact_submission_idempotency_submitter_key_unique` enforces uniqueness on `(submitter_user_id, idempotency_key)`. This is race-safe and deliberately allows the same opaque key for different authenticated users. `contact_submission_idempotency_inquiry_unique` prevents multiple markers from claiming one inquiry.

## 6. Payload conflict handling

The fingerprint covers normalized target type, target identifier, name, lower-cased email, and trimmed message. It is not used to deduplicate different keys. Same key plus the same normalized payload returns the existing receipt; same key plus any material target or field change returns safe HTTP 409 without a second inquiry.

## 7. Business

The existing Business route sends a canonical `{type: business, id}` target through the shared Contact service. Existing visibility and approval checks remain in force for first submission.

## 8. Professional

A Professional inquiry route uses the same service, repository, idempotency table, fingerprint, transaction, and receipt contract. First submission requires the canonical Professional profile to be public, approved, and active. Contact remains one domain; no duplicate Professional Contact implementation was created.

## 9. Frontend

`InquirySubmissionGuard` owns the pending key and synchronous in-flight latch. This closes the small pre-render double-click window that a React state check alone cannot close. The API client sends the key only as `Idempotency-Key`; it sends no submitter identity.

## 10. Retry behavior

- First legal request creates one inquiry and marker and returns its receipt.
- Same-user/same-key/same-payload retry returns the stored receipt.
- Concurrent duplicates converge on one committed inquiry.
- Conflicting reuse returns HTTP 409.
- A different key remains a legal new inquiry.
- Receipt state cannot POST; only explicit new-journey reset permits another submission.

## 11. Security

Every marker lookup includes authenticated `submitter_user_id`; guessing another user's key cannot retrieve their receipt. The payload fingerprint is one-way and does not add raw personal fields. Database errors are not returned to clients. Key conflicts expose only the safe conflict contract.

## 12. Retention

Markers live with their inquiry lifecycle and are deleted by the inquiry foreign key's `ON DELETE CASCADE`. This is the minimal practical conservative policy without cron infrastructure: retries remain stable while the canonical inquiry exists, and markers do not outlive deleted inquiries. No independent indefinite archive or cleanup service was introduced.

## 13. Startup verification update

The required canonical level is now `016`. Startup verifies the idempotency table, its runtime columns, and the named submitter/key uniqueness constraint. Existing 001–015 fail-fast anchors remain unchanged.

## 14. Test bootstrap

The database readiness migration inventory includes forward and rollback Migration 016. The Contact PostgreSQL fixture includes the Migration 015 target shape and Migration 016 object. The P0-01S safety guard was not changed or bypassed.

## 15. PostgreSQL evidence

Real integration cases are prepared for first submission, same retry, concurrent double submission, conflicting reuse, different key, Business target, Professional target, and cross-user key isolation. PostgreSQL was unavailable at `127.0.0.1:5432`, so runtime race-proof evidence remains an external evidence debt and is not claimed as executed PASS.

## 16. Tests

Source contracts verify Migration 016 ownership/uniqueness/rollback, the transactional repository boundary, submitter scoping, Professional target support, and startup level 016. Frontend unit tests execute double-click, retry-key reuse, new-journey key replacement, and receipt non-resubmission behavior. Repository-wide tests, builds, audit, and diff checks are recorded in delivery evidence.

## 17. Files

- `backend/migrations/versions/016_contact_submission_idempotency.sql`
- `backend/migrations/versions/016_contact_submission_idempotency_rollback.sql`
- `apps/backend/src/contact/*` (controller, DTO, validation, service, repository, types, errors, module, tests)
- `apps/backend/src/database/database.migrator.ts`
- `apps/backend/src/database/database.migrator.test.ts`
- `apps/frontend/lib/api-client.ts`
- `apps/frontend/app/business-profiles/[id]/contact-inquiry-form.tsx`
- `apps/frontend/app/business-profiles/[id]/inquiry-idempotency.ts`
- `apps/frontend/tests/inquiry-idempotency.test.ts`
- `tests/contact-inquiry-idempotency-contract.test.mjs`
- `scripts/validate-database-readiness.mjs`

## 18. Commit

The implementation, tests, migration, rollback, and this closure report are committed together. The delivery record provides the final commit identifier because a commit cannot embed its own final object ID.

## 19. Remaining P1 count

P1-01 closes one of eight P1 items source-side. No P1-02 work was started.

---

P1-01 =  
PASS (source-side; PostgreSQL runtime evidence pending)

P1 REMAINING =  
7

P0 EXTERNAL GATE =  
PostgreSQL runtime verification

NEXT LEGAL MISSION =  
PostgreSQL runtime verification when an approved external environment is available; otherwise stop pending governed selection of P1-02.
