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
