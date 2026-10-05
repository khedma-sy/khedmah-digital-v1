# Khedmah to Floot — fulfillment lifecycle, access and notification contract

Status: source-backed migration input and bounded local service tests; NOT live Production or Floot acceptance.
Pinned source: `khedma-sy/khedmah-digital-v1` at `5a961be5035dce1197ba2d0c65519e86f65ca4c6`.
Date: 2026-10-04. No executable repository code, database or deployed configuration changed by this review.

## 1. Reviewed source and limits

| Source owner | Reviewed scope |
| --- | --- |
| `apps/backend/src/orders/order.controller.ts` | Ten order routes, cookie input and private/no-store response declarations; quote/create already mapped in FOOD-CART-ORDER-CONTRACT.md. |
| `apps/backend/src/orders/order.service.ts` | Complete source: identity/ownership, transition decisions, courier eligibility, ratings, location, tracking and response redaction. |
| `apps/backend/src/orders/order.validation.ts` | Complete input validator; this slice locally executes action validation, not order creation/promotion logic. |
| `apps/backend/src/orders/order.repository.ts` | Creation notification, lists, transition transaction, courier predicates, location replacement and actor-scoped tracking; SQL inspected, not executed locally. |
| `apps/backend/src/notifications/notification.controller.ts` | Three private notification routes. |
| `apps/backend/src/notifications/notification.service.ts` and `notification.repository.ts` | Actor scoping, limits, read state and SQL storage. |
| `apps/frontend/app/orders/merchant/page.tsx`, lines 1–200 | Merchant selection, notification preference, 8-second polling, request-sequence protection and action submission. Not a complete UI audit. |
| `apps/frontend/app/orders/courier/page.tsx`, lines 1–200 | Courier selection, alerts, 8-second polling, action confirmation and displayed contact fields. Not a complete UI audit. |
| `apps/frontend/app/orders/order-alerts.ts` | In-page audio and browser Notification helper. |
| `apps/frontend/app/orders/courier-location-button.tsx` | User-controlled geolocation watch and cleanup. |
| `apps/frontend/app/orders/courier/courier-evidence-dialog.tsx` | Human confirmation of pickup or delivery/cash collection. |

Preserve the session, CORS/CSRF and error contracts already mapped in AUTH-API-CONTRACT.md and ERROR-PROFILE-ACCESS-CONTRACT.md. This document does not certify deployed schema, live ownership, Google/Firebase delivery, database race handling, or physical receipt of money.

## 2. Roles are resolved by the backend, not a page label

Every inspected OrderService entry resolves the current Khedmah user from the session through IdentityService. The customer is the order's customer; merchant/courier authority uses the owner IDs from the retrieved order/business records. Request-body role labels do not grant authority.

Merchant listing checks ownership of the requested business and the SQL listing also filters the current owner. Courier listing additionally requires category `delivery_courier`. The order-list queries return at most 100 orders, newest first, without a pagination cursor or total. Do not label that list as a complete lifetime history or calculate all-time revenue from it.

## 3. Preserve the actual transition graph

The following table summarizes the inspected service with ordinary distinct actors and otherwise valid inputs. Terminal states have no outgoing edge here. An allowed state name alone is insufficient: authentication, ownership, action validation and repository checks still apply.

| Actor | From | To | Additional behavior |
| --- | --- | --- | --- |
| Customer | `placed` | `cancelled` | No courier cancellation after assignment is exposed by this graph. |
| Customer | `quoted` | `merchant_confirmed` or `cancelled` | `merchant_confirmed` means the customer accepted the merchant quote. |
| Customer | `merchant_confirmed` | `cancelled` | Still before courier assignment. |
| Merchant | `placed` | `quoted` | `deliveryFee` required; pharmacy additionally requires `pharmacyApproved`. |
| Merchant | `placed`, `quoted`, `merchant_confirmed` | `rejected` | Reason required. |
| Merchant | `merchant_confirmed` | `courier_assigned` | Selected courier must pass the eligibility checks. |
| Merchant | `courier_assigned`, `courier_accepted`, `ready_for_pickup` | `merchant_confirmed` | Reason and matching `expectedCourierBusinessId` required; clears the assignment. |
| Merchant | `courier_accepted` | `ready_for_pickup` | Marks readiness, not physical pickup. |
| Assigned courier | `courier_assigned` | `courier_accepted` | Eligibility rechecked. |
| Assigned courier | `courier_assigned`, `courier_accepted`, `ready_for_pickup` | `merchant_confirmed` | Declines/returns assignment; default reason is `Courier declined` when absent. |
| Assigned courier | `ready_for_pickup` | `picked_up` | Eligibility rechecked, but availability need not still be `available`. |
| Assigned courier | `picked_up` | `delivered` | Current repository also records `payment_status='cash_collected'`. |

The service gives customer authority first when applicable. An actor who owns both merchant and courier has an explicit disambiguation branch for overlapping actions; preserve the `expectedCourierBusinessId` guard rather than simplifying this to an arbitrary frontend role selection.

Action validation accepts only ten known status values. A supplied delivery fee must be finite, non-negative, at most 100,000,000 and have no more than two decimal places under the existing arithmetic. Reasons, when supplied, trim to 2–300 characters. Invalid input is rejected before repository transition.

### Database transition boundary observed in source

The repository places the state change, promotion-claim updates, event, audit and recipient notifications inside `DatabasePool.transaction`. The update checks the expected current status, current actor ownership and, when supplied, expected courier ID. Courier eligibility is rechecked inside the SQL predicate after business/document locks. A zero-row update is returned as no change; the service raises an error rather than inventing success.

When an assignment is cleared, location rows for that order are deleted in the same transaction. Discounted orders require a claim: cancellation/rejection releases it and customer acceptance redeems it. Each transition receives a new event ID, which participates in the notification key; repeated return/reassignment cycles are not keyed solely by the repeated status name.

These are source-level transactional intentions. This local review did not execute PostgreSQL or prove rollback/concurrency behavior. Actual financial settlement is not certified by an SQL flag.

## 4. Courier eligibility is a server gate

Assignment/acceptance requires a public, active, approved/trusted `delivery_courier` business in the merchant's city, normally with `availability='available'`. The service counts four latest approved document types: driver photo, identity card, driving licence and vehicle licence. Repository SQL also rejects another active assigned/accepted/ready/picked-up order for that courier and rechecks current eligibility.

`GET /api/v1/orders/eligible-couriers?businessId=...&page=...` is merchant-owner scoped. Page is an integer from 1 through 10000; the repository returns `{ couriers, total, page, limit: 20 }`. A list result is not a reservation: selection may fail if eligibility or another assignment changes.

Do not create a new approval list in Floot, substitute Taxi driver approval for this contract, or remove the backend gates because an option is visible in a dropdown.

## 5. Tracking and disclosure

`POST /api/v1/orders/:id/location` is only for the assigned courier owner during `courier_accepted`, `ready_for_pickup` or `picked_up`. It validates converted latitude/longitude bounds and optional accuracy from 0 to 5000. The SQL insert/update rechecks assignment, actor and active stage. It keeps a latest-location row per order, not a route history.

`GET /api/v1/orders/:id/tracking` checks current customer/merchant/courier authority through the repository. Location is joined only in the three active stages and only for the current assigned courier. Missing order and unauthorized actor remain distinct not-found/access errors. The returned location includes `recordedAt`; the inspected query contains no maximum-age cutoff. A stale coordinate must not be presented as a verified live position.

The browser sharing button starts/stops a geolocation watch and clears it on cleanup; it stops sharing on request errors or a non-active status. Background/device behavior and consent UX remain future browser acceptance tests.

The response mapper removes internal customer/owner IDs. It hides customer phone from the courier before acceptance, and hides courier identity/phone from the customer before acceptance. However, the assigned courier's pre-accept response still contains delivery address, note and coordinates when present; the courier UI also displays the address and note. This is an observed disclosure boundary, not proof that all customer details are withheld until acceptance.

## 6. Notifications are stored events, not guaranteed device delivery

Order creation inserts a `platform_notifications` row for the merchant owner through the transaction client. Transitions notify distinct current parties plus the former courier owner when an assignment is cleared, excluding the actor. A notification record is not authorization to open an order later; order APIs must recheck current authority.

| Endpoint | Existing contract |
| --- | --- |
| GET `/api/v1/notifications?limit=...` | Current user only; default 30, integer 1–100; `{ notifications, unreadCount }`. |
| PATCH `/api/v1/notifications/read-all` | Marks current user's unread rows; returns `{ updated }`. |
| PATCH `/api/v1/notifications/:id/read` | User-and-ID scoped; returns `{ read: true }` or not-found. |

Notification rows are read from SQL ordered by creation time/ID; read state uses actor-scoped updates. There is no cursor in these inspected routes. The unread count and returned subset need not have the same size.

The inspected merchant/courier pages poll orders every 8 seconds while mounted, suppress first-load alerts, and gate audio/browser Notification calls by the user's local preference and permission. The helper constructs `new Notification(...)`; this path alone does not prove FCM/service-worker delivery when a page is closed. Polling errors are swallowed on the periodic refresh in the inspected pages, so retained data must not be advertised as freshly verified without a separate freshness/error design.

## 7. Cash confirmation is an operational assertion

The courier dialog explicitly asks for physical pickup or delivery and collection before confirmation. The submitted lifecycle action is still the ordinary status transition. On `delivered`, the repository records `cash_collected`; there is no independent cash-reconciliation or electronic-provider verification demonstrated by this inspected path. Preserve the confirmation step and distinguish reported collection from reconciled cash.

## 8. Exact-source local evidence

Three complete connector-read source files were copied unchanged into an isolated local directory and verified with Git blob hashes:
- OrderService: `9834b7b05cc75df525df767760ee9bfc2afc9b87`.
- Order validation: `350443a8f48598cb0fc20fc674f45ee2791411b2`.
- NotificationService: `03b3b94e098364a280e61e842348944d3501603a`.

Runtime: Node.js v22.16.0 and TypeScript 5.8.3 `transpileModule` to CommonJS. Nest decorators/exceptions, identity/session extraction and repositories were test doubles. The actual action validator ran; the unused promotion normalization dependency throws if invoked. No full project type-check or repository clone is claimed. No real database, network, cloud command, secret or Floot resource was used by the tests.

**52 local tests passed, zero failed.** Thirty tests check 300 role/from/to combinations. Remaining cases cover anonymous/unrelated actors, fee/pharmacy requirements, withdrawal/reassignment guards, eligibility, conflicting repository results, overlapping ownership, contact-field redaction, location stages/bounds, tracking denial, rating prerequisites and actor-scoped notification reads. One explicit characterization test confirms pre-accept address/note/coordinate disclosure; passing that test is not approval of the disclosure policy.

The tests certify the isolated service branches only. SQL locks, durable transactions/notifications, real sessions, HTTP status serialization, physical cash collection and browser/Floot journeys remain unverified by these local tests.

## 9. Open release/adapter findings

- FULFILLMENT-01: decide whether assigned-but-not-accepted couriers should receive full address/note/coordinates; current code does, and this review does not silently change it.
- FULFILLMENT-02: 100-order list caps are not complete history; pagination and comprehensive reporting remain separate requirements.
- FULFILLMENT-03: expose freshness/disconnection clearly; a stored notification or last coordinate is not confirmed device delivery or live tracking.
- FULFILLMENT-04: preserve human cash confirmation and define reconciliation requirements separately from the delivered/cash_collected flags.
- FULFILLMENT-05: prove real SQL race/rollback, owner changes, reassignment, repeated event delivery and actual browser consent/notification behavior before relying on these guarantees in Production/Floot.

Next repository-only slice: consolidate the outstanding contract findings into implementation/acceptance priorities, then map media and Classifieds ownership/moderation boundaries. Preserve the successful PR #250 head and the mobile Production hold. This contract grants no execution or deployment permission.
