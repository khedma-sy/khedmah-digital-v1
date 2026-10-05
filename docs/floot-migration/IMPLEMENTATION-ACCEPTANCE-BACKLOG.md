# Khedmah to Floot — implementation and acceptance backlog

Status: **OPEN planning input; no finding is closed by this document.** Date: 2026-10-05.
Scope: consolidate the five existing migration contracts and index the bounded media/Classifieds slice; no application, schema, role, cloud or deployment change is authorized here.
Those contracts reviewed executable source at `5a961be5035dce1197ba2d0c65519e86f65ca4c6`. Their observations and isolated test results are historical evidence at that source, not acceptance of a later main/PR head or a running system.
Before implementation, re-read the affected source at the selected live commit and reconcile subsequent changes. Follow [CURRENT-STATE.md](../project-control/CURRENT-STATE.md), [NEXT-ACTION.md](../project-control/NEXT-ACTION.md) and their release gates.

## Classification and priority

- **Characterization** records observed behavior or an unproven guarantee. Passing a characterization test does not approve that behavior.
- **Defect candidate** identifies a documented inconsistency or failure path; the intended correction still requires review. No confirmed resolution or approved replacement behavior is inferred.
- **Policy decision** requires an explicit choice about disclosure, retention, completeness or operational meaning before changing behavior.
- **P0** must be resolved or explicitly excluded before exposing or relying on the affected migrated surface. **P1** must be addressed before accepting its affected journey. These are proposed acceptance priorities, not permission to bypass Production gates.
- Owner roles below identify required responsibilities, not assigned people. Every item remains **OPEN**; closure evidence must name the implementation SHA, environment, cases/results and reviewer or decision record.

## P0 — authority, privacy and operational correctness

### IA-01 — courier disclosure before acceptance

- Classification: **Policy decision + characterization**; source finding `FULFILLMENT-01`.
- Sources: [tracking/disclosure](FULFILLMENT-LIFECYCLE-CONTRACT.md#5-tracking-and-disclosure), [order response mapping](../../apps/backend/src/orders/order.service.ts).
- Recorded boundary: customer phone is hidden before courier acceptance, but address, note and coordinates can still be returned to the assigned courier and shown by its UI.
- Work: obtain a field-by-field disclosure decision for assigned, accepted, withdrawn and reassigned actors; implement a reviewed change only if required. Preserve server-side authority and current phone redaction.
- Closure evidence: approved disclosure matrix plus response/UI cases for each stage and actor, including former couriers after reassignment. A passing current-disclosure test alone is insufficient.
- Owner/dependencies: product/privacy decision owner; backend and frontend implementers; security/QA reviewer. Depends on IA-03 session identity and IA-12 ownership acceptance.

### IA-02 — account switching and retained order drafts

- Classification: **Policy decision + characterization**; source finding `FOOD-05`.
- Sources: [cart storage](FOOD-CART-ORDER-CONTRACT.md#3-local-cart-is-not-an-authoritative-order), [checkout recovery](FOOD-CART-ORDER-CONTRACT.md#4-promotion-quote-create-and-retries-are-different-operations), [checkout owner](../../apps/frontend/app/orders/checkout/page.tsx).
- Recorded boundary: cart keys are restaurant-scoped; recovery keys are business/product-scoped and drafts include contact/address fields. Full logout cleanup, retention and account isolation remain unverified.
- Work: agree account ownership, retention, logout and expiry behavior for carts and sensitive drafts; reconcile it with the existing 30-minute recovery TTL and uncertain-order recovery.
- Closure evidence: actual browser cases for account A → logout → account B, session expiry, reload and restored attempts; show retained/cleared fields and prevent silent submission of another account's draft.
- Owner/dependencies: product/privacy owner; frontend/identity implementers; QA. Depends on IA-03 identity behavior and supplies retention decisions to IA-11; do not clear an uncertain attempt merely to conceal an unresolved order outcome.

### IA-03 — session/cookie transport and adapter choice

- Classification: **Policy/design decision + characterization awaiting integration acceptance**.
- Sources: [cookie/origin boundary](AUTH-API-CONTRACT.md#3-cookie-and-request-origin-boundary), [candidate transports](AUTH-API-CONTRACT.md), [required acceptance](AUTH-API-CONTRACT.md#6-acceptance-gate-before-any-real-frontend-cutover).
- Work: select same-origin routing or direct API transport after proving the actual platform capability; preserve Firebase-token exchange, HttpOnly cookie attributes, credentialed requests, origin checks and logout behavior.
- Closure evidence: chosen architecture decision and real preview/custom-domain mobile Safari/Chrome and desktop cases for login, reload, verification-required registration, social-token rejection, expiry and logout; reject foreign/absent unsafe web origins and verify private cache/header handling.
- Owner/dependencies: architecture/identity implementers; security and browser QA. Needs approved platform access and release prerequisites; public GET success or existing Next.js Preview results do not close it.

### IA-04 — personal-profile and Operations authority

- Classification: **Characterization awaiting authorization acceptance**.
- Sources: [personal profile](ERROR-PROFILE-ACCESS-CONTRACT.md#3-personal-profile-contract), [Operations permissions](ERROR-PROFILE-ACCESS-CONTRACT.md#4-operations-product-permission-boundary), [six routes](ERROR-PROFILE-ACCESS-CONTRACT.md#5-six-protected-operations-product-routes).
- Work: preserve session-derived profile ownership and each backend permission check. Keep Operations role bindings separate from PostgreSQL roles, `admin_roles`, frontend labels and unimplemented role-editing capabilities.
- Closure evidence: all six Operations routes tested for anonymous, authenticated-without-permission and authorized actors; malformed/missing bindings fail safely; profile updates cannot select another user or change roles, credentials or verification state.
- Owner/dependencies: identity/Operations backend implementers; security/QA reviewer. Depends on IA-03; frontend visibility is never authorization evidence.

### IA-05 — Operations status and approval durability

- Classification: **Characterization + policy decision before operational reliance**.
- Sources: [status/durability limits](ERROR-PROFILE-ACCESS-CONTRACT.md#important-truthfulness-and-durability-limits), [Operations repository](../../apps/backend/src/operations-product/operations-product.repository.ts).
- Recorded boundary: overview/inventory summarize configuration, changes/rollbacks return `pending_approval`, and the Operations repository uses instance arrays. Identity audit calls also exist; not all audit behavior is memory-only.
- Work: define truthful displayed status and required durability for the mapped surface. Decide any persistence requirement separately; this backlog does not add a cloud executor, duplicate Floot approval queue or broader control-plane scope.
- Closure evidence: requests remain visibly pending and configuration summaries are labelled accurately. Any approved durability claim needs restart/cross-instance and end-to-end audit evidence; otherwise retain the explicit limitation.
- Owner/dependencies: Operations product owner; backend/QA. Depends on IA-04; production health, provisioning or executed rollback cannot be inferred from a successful API response.

### IA-11 — authoritative quotation, retries and recovery

- Classification: **Characterization awaiting browser/HTTP/database acceptance**.
- Sources: [quote/create/retry distinction](FOOD-CART-ORDER-CONTRACT.md#4-promotion-quote-create-and-retries-are-different-operations), [entry acceptance](FOOD-CART-ORDER-CONTRACT.md#7-required-future-integration-acceptance).
- Work: preserve no-promo and reviewed-promo paths, server-derived prices/merchant/currency, same-user idempotency comparison and `placed`/cash-pending entry semantics. Do not turn a quote into a reservation or uncertain response into a fresh order key.
- Closure evidence: changed price/promotion, duplicate tap, identical/conflicting retry, lost response, reload, TTL expiry and account-switch cases; prove the resulting order count/identity and recovery state with authorized test data. Require an order ID before success.
- Owner/dependencies: orders backend and checkout frontend implementers; database/browser QA. Depends on IA-02/03/09/10 and approved schema/test-environment prerequisites; promotion migration remains separately gated.

### IA-12 — lifecycle, ownership and transactional guarantees

- Classification: **Characterization awaiting integration acceptance**; source finding `FULFILLMENT-05`.
- Sources: [transition graph](FULFILLMENT-LIFECYCLE-CONTRACT.md#3-preserve-the-actual-transition-graph), [courier eligibility](FULFILLMENT-LIFECYCLE-CONTRACT.md#4-courier-eligibility-is-a-server-gate), [order repository](../../apps/backend/src/orders/order.repository.ts).
- Work: preserve customer quote acceptance, current merchant/courier ownership, overlapping-actor rules, expected-courier guards, document/availability eligibility, promotion claim transitions and actor-scoped order access.
- Closure evidence: real SQL cases for concurrent transitions, owner changes, eligibility changes, reassignment, zero-row conflicts and rollback; verify atomic status/event/audit/notification writes, cleared locations and repeated return/reassignment events without invented success.
- Owner/dependencies: orders/database implementers; security/QA. Depends on IA-03 and authorized schema/test fixtures. Mock repositories and the earlier service transition tests do not prove these database guarantees.

### IA-14 — reported cash versus reconciliation

- Classification: **Policy decision + characterization**; source finding `FULFILLMENT-04`.
- Sources: [cash confirmation](FULFILLMENT-LIFECYCLE-CONTRACT.md#7-cash-confirmation-is-an-operational-assertion), [courier confirmation UI](../../apps/frontend/app/orders/courier/courier-evidence-dialog.tsx).
- Recorded boundary: confirming `delivered` also records `cash_collected`; the inspected path does not independently verify physical money or reconciliation.
- Work: preserve human collection confirmation; define what evidence and review would justify a reconciliation claim. Keep reported collection clearly distinguishable until that separate requirement is approved and satisfied.
- Closure evidence: UI/reporting distinguishes delivered, reported collected and any separately evidenced reconciled amount; approved operational acceptance describes how collection discrepancies are handled. A database flag alone cannot close reconciliation.
- Owner/dependencies: finance/operations owner; product/backend implementers; QA. Depends on IA-06 completeness and IA-12 transitions; no electronic-payment or settlement feature is authorized here.

## P1 — compatibility, completeness and visible failures

### IA-06 — bounded lists and truthful completeness

- Classification: **Characterization + policy decision**; `FOOD-01`, `FULFILLMENT-02` and discovery pagination limits.
- Sources: [search limits](DISCOVERY-API-CONTRACT.md#5-result-shape-ranking-and-pagination), [product cap](FOOD-CART-ORDER-CONTRACT.md#2-restaurant-and-menu-discovery), [order list cap](FULFILLMENT-LIFECYCLE-CONTRACT.md#2-roles-are-resolved-by-the-backend-not-a-page-label), [notifications](FULFILLMENT-LIFECYCLE-CONTRACT.md#6-notifications-are-stored-events-not-guaranteed-device-delivery).
- Work: retain separate collection pagination: unified collections 20 each, map businesses 200 at offset zero, products/orders at most 100, notifications at most 100 without cursors. Define any fuller-history requirement before adding pagination.
- Closure evidence: over-cap fixtures show truthful partial-list labels and navigation; combined totals do not become a fabricated page count, notification unread count is separate, and truncated order lists are not all-time revenue/history evidence.
- Owner/dependencies: discovery/orders product owner; backend/frontend/QA. Any API pagination change needs a reviewed contract; existing bounded behavior can be accepted only with its limits explicit.

### IA-07 — page and category parser parity

- Classification: **Defect candidates + characterized compatibility differences**; `DISCOVERY-01/02`.
- Sources: [parser findings](DISCOVERY-API-CONTRACT.md#open-findings-to-preserve-not-silently-fix-during-migration), [backend parser](../../apps/backend/src/search/search.validation.ts), [frontend parser](../../apps/frontend/lib/discovery-context.ts).
- Work: decide rejection/normalization semantics for malformed or unsafe pages and unknown/malformed category codes. Preserve the documented backend `parseInt` versus strict frontend difference until a reviewed correction is implemented.
- Closure evidence: API/frontend parity matrix for `2junk`, fractional/unsafe pages, category syntax and inactive/unknown catalog values; demonstrate the approved response/status and compatibility treatment without assuming every path returns 404.
- Owner/dependencies: API contract owner; backend/frontend/QA. Depends on reviewed compatibility decision; stricter parsing is not silently authorized by this record.

### IA-08 — discovery scope, catalog and navigation

- Classification: **Characterization awaiting interaction acceptance**; `DISCOVERY-03` and food partial-discovery behavior.
- Sources: [catalog authority](DISCOVERY-API-CONTRACT.md#2-keep-one-category-authority), [map/ranking limits](DISCOVERY-API-CONTRACT.md#5-result-shape-ranking-and-pagination), [URL behavior](DISCOVERY-API-CONTRACT.md#6-url-and-interaction-behavior-to-retain), [food discovery](FOOD-CART-ORDER-CONTRACT.md#2-restaurant-and-menu-discovery).
- Work: use existing catalog codes/parents and the correct search endpoint per tab; preserve applied-versus-draft URLs, stale-response suppression, partial-failure retry and backend subset ordering. Map bounds apply to businesses, not all service results.
- Closure evidence: browser back/forward/reload/tab/retry and stale-request cases; partial food-category failures remain visible; map subsets are neither all matches nor a proven globally best/nearest ranking.
- Owner/dependencies: discovery frontend/backend implementers; browser QA. Depends on IA-06/07 and actual selected transport; no second Floot category database.

### IA-09 — menu category and currency eligibility

- Classification: **Policy/contract decision + characterization**; `FOOD-02`.
- Sources: [menu eligibility](FOOD-CART-ORDER-CONTRACT.md#2-restaurant-and-menu-discovery), [order authority](FOOD-CART-ORDER-CONTRACT.md#4-promotion-quote-create-and-retries-are-different-operations).
- Work: reconcile product-category menu filtering, business-category order vertical and currency checks across the entire loaded menu. Decide intended behavior without introducing a new category model or trusting cart subtotals.
- Closure evidence: reviewed menu-versus-order eligibility matrix and actual cases for mixed product categories/currencies, unavailable items and changed prices; server eligibility remains authoritative.
- Owner/dependencies: food product/API owner; frontend/backend/QA. Depends on IA-06 catalog limits and supplies the reviewed eligibility matrix to IA-11.

### IA-10 — cart storage failures and helper assumptions

- Classification: **Defect candidates + characterization**; `FOOD-03/04`.
- Sources: [explicit cart findings](FOOD-CART-ORDER-CONTRACT.md#explicit-findings-not-silently-repaired), [cart helper](../../apps/frontend/lib/restaurant-cart.ts).
- Work: review handling for propagated write/clear failures, empty/duplicate product IDs and fractional deltas. Preserve quantity/line limits and the checkout distinction between completed order and failed cart clearing.
- Closure evidence: restricted-storage mobile browser behavior and targeted malformed-cart/input cases for the approved correction; no UI success from an unpersisted change and no duplicate order after a clear failure.
- Owner/dependencies: frontend implementer; QA. Depends on IA-02 retention decisions; coordinate recovery handling with IA-11. The four historical characterization cases do not certify repaired behavior.

### IA-13 — errors, freshness, tracking and notification consent

- Classification: **Characterization + policy/design decision**; `FULFILLMENT-03/05` and shared-error acceptance gaps.
- Sources: [error transport](ERROR-PROFILE-ACCESS-CONTRACT.md#2-error-transport-observed-in-source), [tracking](FULFILLMENT-LIFECYCLE-CONTRACT.md#5-tracking-and-disclosure), [notification limits](FULFILLMENT-LIFECYCLE-CONTRACT.md#6-notifications-are-stored-events-not-guaranteed-device-delivery).
- Work: preserve HTTP status, recovery code and nested/legacy message handling; keep network failures distinct from logout. Decide freshness/disconnection display and preserve permission-controlled location/notification behavior.
- Closure evidence: 401/403/409/429/5xx, malformed/non-JSON and network failures remain distinct; `EMAIL_VERIFICATION_REQUIRED` retains recovery. Browser tests show stale timestamps, polling failure, geolocation cleanup/denial and notification permission outcomes; stored rows never imply device delivery or live coordinates.
- Owner/dependencies: frontend/API implementers; security/browser QA. Depends on IA-01/03/12; background delivery is not established by `new Notification(...)` or a polling success.

## Closure and next bounded work

The [media/Classifieds contract](MEDIA-CLASSIFIEDS-CONTRACT.md) is now mapped against `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`. Its six findings remain separately identified and **OPEN**; the detailed source evidence and closure conditions are in [that contract's findings table](MEDIA-CLASSIFIEDS-CONTRACT.md#8-prioritized-unresolved-findings-and-acceptance-work).

| Finding / priority | Classification and next responsibility | Dependency / required evidence |
| --- | --- | --- |
| MC-01 / P1 — shared Ad-image deletion | Defect candidate; media/Classifieds backend owner and security QA | Reconcile the generic versus dedicated route; verify feature/status/revision/ownership guards and metadata/receipt consistency. Depends on IA-03/04 authority acceptance. |
| MC-02 / P1 — private document reads and review retention | Characterization plus policy decision; privacy/security owner, media/database implementers | Decide uploader/current-owner transfer and event retention rules; then prove revocation, concurrent read/delete and retained audit evidence with real SQL/HTTP. |
| MC-03 / P1 — account and public-media lifecycle | Characterization plus policy decision; privacy/product owner and media/Classifieds implementers | Define suspended/deleted/transferred-owner and profile-visibility behavior; verify public bytes/contact access for each state. |
| MC-04 / P2 — Classifieds error transport | Defect candidate; API/frontend owners | Preserve safe errors while proving real revision/key/quota/401/503 recovery across the global filter and client. Coordinate with IA-13. |
| MC-05 / P2 — storage/SQL consistency and replay | Characterization plus defect candidates; storage/database owners and QA | Prove lost-response, commit uncertainty, object-cleanup and replay-after-removal behavior before claiming atomicity or idempotency. |
| MC-06 / P2 — pending/expiry/queue limitations | Characterization plus policy decision; Classifieds/moderation owner | Specify supported withdrawal/recovery, expiry and queue-completeness behavior; coordinate capped-list acceptance with IA-06. |

Media priorities retain the contract's labels: P1 is required before relying on the affected security/ownership boundary; P2 remains acceptance work for the affected recovery/queue journey. Neither label authorizes a behavior or schema change.

Record each reviewed policy decision separately from its implementation and acceptance result. Link exact-source evidence when obtained; leave missing browser, HTTP, SQL or operational evidence explicitly open.
The earlier 12 error, 24 discovery, 24 cart and 52 lifecycle tests retain only the limits documented in their source contracts; they were not rerun or extended for this backlog.
The bounded media/Classifieds mapping step is complete. Select subsequent implementation or acceptance work only after the governing [NEXT-ACTION.md](../project-control/NEXT-ACTION.md) and its dependencies are reviewed. This file creates no Production permission and does not certify a frontend cutover.
