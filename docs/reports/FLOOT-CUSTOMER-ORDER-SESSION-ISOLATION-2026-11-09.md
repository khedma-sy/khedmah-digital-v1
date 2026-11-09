# Floot customer orders / Google session isolation — source acceptance checkpoint
Date: 2026-11-09 (observed live editor). Audit: EXPOSE, AUTOPSY, IQ200, CTO, SDET, Privacy and Release.

## Executive result
The Floot EDITOR contains a source-level fix for a privacy/race bug in the customer's **طلباتي** page. Prior to the change, all customer orders shared one React Query key `["khedmah-orders"]`, permitting cached data from a previous Google session to be considered for display while the current account was not freshly verified. This audit identified a risk of stale private data appearing on the same browser after account changes. The backend still has its own per-request ownership guards; this fix is an additional **client cache and UI isolation control**, not a claim of confirmed cross-account backend authorization bypass.

## Code changed in Floot editor (NOT yet mirrored as runnable GitHub code)
- `pages/platform.orders.tsx`: fresh checked server session before any order list, query keys partitioned as `["khedmah-orders", actorId]`, and an **after-fetch identity check** before accepting a list. The private order list and review controls disappear while the current session is being rechecked, on denial, or when the user changes. Only scoped cached orders are read for customer tracking and post-action updates.
- `pages/platform.orders.tsx`: verify the actor once more immediately before a sensitive cash-total confirmation, cancellation or review POST; reject mismatched actor without dispatch. Track associated actor with location response; never show an old actor's location or stale courier assignment. Abort active requests and erase transient UI state on actor changes. **Preserve uncertain mutation fingerprints across transient re-checks of the same actor** so a response with unknown outcome cannot be replayed accidentally.
- `components/KhedmahCheckout.tsx`: manual recovery list is only cached under `["khedmah-orders", customer]` after an independent post-read server session verification; a late result from a different actor is discarded.
- `helpers/khedmahCommerceUi.spec.tsx`, `helpers/khedmahCustomerTrackingPrivacy.spec.tsx`, `helpers/khedmahCommerceRecoveryUi.spec.tsx`: updated explicit verified-session and customer-scoped read expectations.
- New `helpers/khedmahCustomerOrderAccountIsolation.spec.tsx`: covers old-account cache not displayed during new session proof, actor change between list fetch and receipt, live switch of accounts in one browser, denial before payment confirmation, unknown-outcome no-replay after same-actor session refresh, and unauthorized session not querying private orders.
- `helpers/khedmahNotifications.spec.tsx`: updated in-app notification test to model the real independent session check introduced by recent editor updates; no unauthorized/incomplete session may display inbox contents.

## Evidence
- Floot project id `5e271f43-96a6-40de-a634-ec3eae023a49`.
- Editor source version **`1794204241298`**.
- Restore checkpoint **`d181ba1a-6e4d-470e-9fc5-cb88dd2b4162`**.
- 152/152 Jasmine spec **files** passed, across eight independent batches (20/20 × 7 + 12/12).
- TypeScript typecheck: **clean**.
- Contract/regression coverage is local jsdom and mocked network replies, **not** a real cross-account desktop/mobile browser acceptance of Google/Firebase, nor a deployed Cloud SQL acceptance.
- Last verified published Floot release remains `1793750504473f0272d7f-c673-4f61-acff-130b2f13d3e9`, published **2026-11-04T00:01:39.684Z**; the public site does **not** automatically include the editor fix.
- GitHub protected `main` last observed `cc8d49809cb9543ee1620432d9c0ba73fb801cbb`, unchanged as of this audit. This document is a **handoff note in PR #352**; it does not transfer Floot editor source into GitHub main or deploy it.

## Remaining safety gates / next safe action
1. Independent formal human `APPROVED` reviews and **exact-current-head** CI before PR #352 or other PR merges. Do not interpret passing tests or CODEOWNERS self-review as authorization.
2. Real mobile/desktop Google identity-switch and logout/re-login E2E with two dedicated users; verify no stale private orders, contacts or courier locations ever appear in the other account's view. Check browser back/focus, slow network, aborted fetch and unknown confirmation response.
3. Complete real restaurant and courier FCM/device registration, outbox/worker, deduplication, retries and background delivery. Foreground sound/vibration is explicitly not background push.
4. Independent Preview Cloud Run/Cloud SQL image/revision, traffic, writer-quiescence/backup, role grants, schema and rollback evidence. Keep Smart Admin approvals, driver-document uploads, taxi activation and financial commitments disabled until individually approved.
5. Verify Floot editor-vs-public source provenance and run a reviewed, reversible canary with rollback; broader Production launch only after its own gates close.

**No public Floot publication, no main merge, no Google Cloud/Cloud SQL mutation, no order/financial action, no automation activation and no independent reviewer approval occurred in this source-audit work.**
