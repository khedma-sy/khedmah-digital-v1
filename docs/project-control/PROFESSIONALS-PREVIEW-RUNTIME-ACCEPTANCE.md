# Professionals platform — Preview runtime acceptance matrix

Date: 2026-11-05 UTC
Scope: professional profiles, discovery/search/categories/Nearby, classifieds, store, restaurant orders, taxi/courier, account and relevant admin. **Khedmah Business Desk is excluded.**
Source baseline: protected `main` `495f9073a6f8599b12cae32e0f66d04b1d61317c`. Refresh the live ref, open PRs and Actions before each execution.

## Evidence and interpretation

| Check | Evidence | State |
| --- | --- | --- |
| Backend liveness | Operator-provided Preview `GET /api/v1/health` HTTP 200, 2026-11-05 13:29 UTC | PASS (operator-observed) |
| Runtime DB readiness | Operator-provided Preview `GET /api/v1/health/ready` HTTP 200, `dependencies.database=ok` | PASS (operator-observed) |
| Anonymous session boundary | Preview `GET /api/v1/auth/session` HTTP 401 without credentials | EXPECTED; does not prove authorized behavior |
| Google login, normal account | Operator confirmed interactive login | PASS (operator-observed) |
| Session persistence | Operator confirmed login persisted after page refresh | PASS (operator-observed) |
| Admin login/role boundary | Not tested with admin account | NOT VERIFIED |
| All feature journeys below | No current end-to-end receipts | NOT VERIFIED |

**Evidence rule:** CI passing is not a runtime acceptance receipt. Do not infer permissions, push delivery, order fulfillment or taxi activation from a loaded page or a healthy API. Never record access tokens, ID tokens, cookies, phone numbers, personal documents, secret values or full session payloads in GitHub.

## Acceptance scenarios (Preview only)

Each row must record test account **role only**, timestamp, frontend revision, backend revision, request/correlation ID where safe, expected result, actual result and pass/fail. Use non-sensitive synthetic data and delete it using approved test-data processes; never modify production data.

| Journey | Positive acceptance | Negative/security acceptance |
| --- | --- | --- |
| Account | Google login, refresh, logout, new browser session | Unauthenticated protected API rejects; ordinary user cannot access admin |
| Professionals | Owner creates/edits profile; reviewer approves; public sees approved profile | Pending/rejected profiles remain private; another user cannot modify owner record |
| Search/categories/Nearby | Pagination, filters, city discovery and empty states work | Malformed page/coordinate bounds rejected; no fabricated geolocation |
| Classifieds | Create/edit, required-field validation, moderation, publish and view | Rejected/pending content not public; daily/weekly quota enforced by backend |
| Store | Merchant product lifecycle, stock/price validation, order creation and status | Other merchant cannot edit products/orders; invalid amounts rejected |
| Restaurant orders | Customer submits; merchant receives; merchant accepts/rejects; customer sees result | Non-owner cannot act; retries do not duplicate; background push remains NOT VERIFIED until token registration, worker, dispatch and delivery are proven |
| Taxi/courier | Enrollment/document review, matching, trip lifecycle and cancellation in isolated tests | Unverified drivers blocked; forbidden transitions denied; **do not enable `TAXI_TRIPS_ENABLED`** before separate migration/role/route acceptance |
| Admin/smart admin | Approved review decisions produce auditable state transitions | Normal user denied admin API; sensitive verification and financial/legal decisions require human approval |
| Frontend integration | Floot/Preview buttons map to correct backend contract; loading/error states are actionable | No silent success when API fails; no production endpoint leakage |

## Stop conditions and release holds

1. Any cross-tenant read/write, privilege escalation, unintended public disclosure, incorrect payment or order state, or production endpoint use: STOP and file a focused security issue with redacted evidence.
2. Restaurant high-priority alerts must not be advertised as working until foreground/background delivery, permission handling, worker, token lifecycle, retries and actual merchant receipt are demonstrated on target devices.
3. Taxi trips remain disabled until schema compatibility, verified driver/vehicle documents, transitions, dispatch and rollback are approved.
4. The Preview backend was manually scaled to one instance by the operator; earlier PR #344 documentation assumed manual zero. Reconcile those prerequisites before reusing its validator. Do not replay any scaling or schema mutation from this document.
5. No Production mutation, live deployment, Floot publication, schema 036/037 migration, external financial commitment or merge without the applicable gates and fresh exact-head CI.

## Next safe actions

1. Re-read live `main`, open PRs, Actions and `docs/project-control/{CURRENT-STATE,NEXT-ACTION}.md`; note their dated pointers.
2. Capture browser-only Preview admin login, session persistence and ordinary-user admin denial without copying credentials into logs.
3. Execute the account and classifieds/professional journeys first, recording actual outcomes; open narrow repair branches with regression tests for confirmed failures.
4. Follow with store and restaurant order tests, then taxi/courier disabled-state and admin authorization checks.
5. Update this matrix with dated evidence; leave untested scenarios as NOT VERIFIED.

## Professional registration and smart-admin acceptance — code review (2026-11-05)

- Owner `POST /professionals` creates a profile with `moderation_status='pending'`, `lifecycle_status='created'`; owner `POST /professionals/:id/submit` requests content moderation. No implicit public publication on registration.
- Content moderation is a **separate** reviewer decision: `approveModeration` requires `security.manage` or `content.approvals.approve`; rejection and suspension require `security.manage`. The reviewer must use the current revision; a stale decision must fail.
- Identity/evidence verification is **not** content moderation. A professional can request verification only for their own profile and with 1–3 private evidence assets. The verification review service explicitly requires an authorized human reviewer, rejects self-approval and stale revisions, and does not publish or activate the professional profile.
- Public discovery/detail requires **all three**: `visibility='public'`, `moderation_status='approved'`, `lifecycle_status='active'`. A pending registration must never appear in public results.
- **Smart-admin limitation:** no autonomous professional verification approval is established by these paths. Automated assessment/triage can assist, but sensitive identity proof remains human-only. Do not label a submitted professional as automatically accepted without a separately implemented, tested, bounded moderation decision.
- Hardening applied in this PR: professional owner workspace, submission and moderation responses use `Cache-Control: private, no-store` and `Vary: Cookie` to prevent sensitive reviewer/owner state being reused from shared caches. This is source-level hardening, not a runtime test result.

### Required Preview acceptance receipts

1. Create professional as a normal user; confirm owner workspace shows pending/created and public search returns no entry.
2. Submit for moderation; confirm authorized review queue shows the exact revision and ordinary user cannot approve/reject/suspend.
3. Approve content as authorized reviewer; verify stale revision fails, and publication still requires active lifecycle plus public visibility.
4. Submit verification without evidence (must fail), with 1–3 private assets (pending), and attempt self-approval or ordinary-user approval (must fail).
5. Have a distinct authorized human reviewer approve verification; verify audit history and **no implicit** moderation/publication change.
6. Repeat for rejected/suspended profiles; verify no public exposure, and owner/reviewer responses are not cacheable.

### Correction from source-level review

The content-moderation **approval** transaction in `moderation/profile-review-write.ts` also sets a professional's `lifecycle_status='active'` atomically; submission sets it to `pending`. Therefore content approval + public visibility can make the profile discoverable immediately. Verification remains a distinct human-only workflow, and professional verification approval does **not** independently publish the profile. The acceptance run must explicitly test whether any profession category requires verification *before* publication, and treat any mismatch with approved product policy as a release hold. Do not assume an additional activation action is required after content approval.

Added regression test `professional-controller-cache-privacy.test.ts` for the six owner/reviewer endpoints hardened in this PR. CI status must be checked at the exact latest commit before merge.

## Approved product requirement: smart-admin post-review acceptance

The product owner confirms that smart administration **must be able to approve professional content after review**. This is a requirement, **not evidence that an autonomous executor is deployed**.

Source review shows a bounded content approval permission (`content.approvals.approve`), a human/admin moderation endpoint, exact-revision checks, a prohibition on approving one's own profile, and an audit history write. The inspected source does **not** establish a scheduled or event-driven smart-admin worker that performs those checks and calls the approval transition automatically. Do not report this feature as operational without that evidence.

Safe implementation acceptance criteria: review complete snapshot; deterministic policy with explicit allowed categories and risk thresholds; only low-risk content auto-approval; independently authorized service identity (never impersonate the owner); atomic exact-revision compare; fail closed on incomplete/changed evidence; decision reason, policy version and actor recorded; replay/idempotency and concurrency tests; human escalation for ambiguous or sensitive cases. Identity/evidence verification remains human-only, and taxi/driver activation remains separately gated. No blanket approval of all new profiles.

## Owner authorization — routine professional smart-admin decisions (2026-11-05)

The owner explicitly authorizes **automatic approval of ordinary professional content profiles after smart-admin review**, without an individual owner confirmation for each eligible case. This is authorization to implement and test the bounded workflow, **not** authorization to bypass release gates or to grant production permissions blindly.

Acceptance contract:
1. Only complete, submitted, low-risk professional content, evaluated against an explicit reviewed allowlist and policy version, can be auto-approved. A draft, stale review snapshot, missing evidence, policy uncertainty or flagged content must fail closed and escalate.
2. The automated decision must run under an authenticated, independently provisioned service principal with *only* content approval authority; no human impersonation or browser-supplied role claim.
3. Reuse the existing atomic revision check, no-self-approval and trust-history audit. Persist a traceable decision reason and policy version; ensure retries cannot create duplicate decisions.
4. Identity verification, sensitive documentation, driver/vehicle approvals, taxi activation and financial/legal commitments remain human-gated.
5. Test safe approval, escalation, stale revision, concurrency, permission denial, audit trail and no publication before the authorized content transition. Verify actual preview E2E and the current deployment/schema gates before any activation.

The repository currently proves a human-operated approval endpoint and bounded role definitions, but does not yet prove a deployed autonomous worker. No live role binding or deployment is implied by this authorization.

## Owner request: expanded automated review of sensitive domains (2026-11-05)

The owner requests automated post-check approval for identity/personal documents, driver and vehicle documents, and Taxi operational activation, in addition to routine content. **This request does not itself establish reliable document authenticity verification or authorize bypassing existing human-only service gates.** The current source explicitly enforces human review for sensitive verification, and the established deployment gates remain closed.

Implementation is **blocked pending a separately reviewed security and legal acceptance design** demonstrating trustworthy identity/document authenticity, expiration, ownership matching, fraud and duplicate detection, current/latest evidence, non-self approval, auditability, independent service authority, fail-closed handling of uncertainty, and applicable transport/insurance/licensing prerequisites. Suspicious or noncompliant submissions must not be automatically approved; escalate or reject per policy. Never equate OCR or a successful upload with authenticity. Do not enable production permissions or Taxi activation until these controls and preview E2E are proven.
