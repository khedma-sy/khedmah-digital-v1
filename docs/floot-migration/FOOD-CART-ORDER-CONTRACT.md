# Khedmah to Floot — restaurant discovery, cart and order-entry contract

Status: source-backed migration input, NOT an implemented Floot integration or Production acceptance.
Reviewed repository: `khedma-sy/khedmah-digital-v1`.
Pinned executable source: `5a961be5035dce1197ba2d0c65519e86f65ca4c6`.
Date: 2026-10-04. No executable source, database, secret or deployment is changed by this document.

## 1. Bounded scope and source owners

This slice maps restaurant discovery, product/menu reads, the local cart, promotion quotation and initial order creation. It does not certify the complete merchant/courier lifecycle, notifications, actual payment collection, stock reservation, or all transaction-concurrency guarantees.

| Source | Reviewed scope |
| --- | --- |
| `apps/frontend/app/restaurants/page.tsx` | Discovery request/merge/retry logic and page UI, lines 1–200. |
| `apps/frontend/app/restaurants/[businessId]/page.tsx` | Complete menu/cart page. |
| `apps/frontend/lib/restaurant-cart.ts` | Complete pure cart/storage helper; exact blob tested locally. |
| `apps/frontend/app/orders/checkout/page.tsx` | Lines 1–450: storage recovery, loading, quote handling, submission and beginning of failure classification. Later JSX/recovery presentation is outside this slice. |
| `apps/frontend/lib/recovered-service-client.ts` | Complete product/order client wrappers and nominal response types. |
| `apps/backend/src/products/product.controller.ts` | Public product list/detail routes; write routes located but not fully audited. |
| `apps/backend/src/products/product.service.ts` | Lines 1–100; public list/detail delegation and adjacent source, not a full moderation audit. |
| `apps/backend/src/products/product.repository.ts` | Complete public retrieval queries and limits. |
| `apps/backend/src/orders/order.controller.ts` | Complete controller; only entry/mine routes mapped here. |
| `apps/backend/src/orders/order.validation.ts` | Complete entry/quote/idempotency validation. |
| `apps/backend/src/orders/order.service.ts` | Entry, basket and access logic in lines 1–310; not a complete service audit. |
| `apps/backend/src/orders/order.repository.ts` | Lines 1–365: quote resolution, product reads and beginning of transactional create through item insertion. Later claims/events/transition behavior remains to review. |
| `docs/decisions/RP37-FULFILLMENT-UI.md` | Existing six-page ownership bridge and cash/promotion/deployment boundaries. |

The `/api/v1` transport, identity and error contracts remain governed by the companion AUTH-API-CONTRACT.md, ERROR-PROFILE-ACCESS-CONTRACT.md and DISCOVERY-API-CONTRACT.md. Do not replace the existing backend with a parallel Floot order or category database.

## 2. Restaurant and menu discovery

`/restaurants` requests `api.businesses.search` for `q`, `categoryCode`, and `page`; its inherited business route is `/api/v1/businesses/search`, as mapped in the discovery contract. The all-food query fans out across six codes: `restaurant`, `cafe`, `bakery`, `sweets`, `catering`, `juice_icecream`. The current visible filter chips have no separate catering chip even though all-food includes catering.

The page uses `Promise.allSettled`, deduplicates returned businesses by ID, and sorts the accumulated results by featured status then Arabic name. Query/category changes reset page to 1. A partial category failure is reported as partial; it blocks advancing and offers retry of the current page. The displayed total is assembled from the category responses, not an independent global food total. Preserve partial-result reporting rather than silently claiming complete discovery.

| Method and route | Observed input/output |
| --- | --- |
| GET `/api/v1/products` | Optional `q`, `categoryCode`, `cityCode`, `businessProfileId`; returns `{ products }`. |
| GET `/api/v1/products/:id` | Public product detail; returns `{ product }` or not-found. |
| POST `/api/v1/orders/quote` | Authenticated cookie; `items[{productListingId, quantity}]`, optional `promoCode`; returns `{ quote }`. |
| POST `/api/v1/orders` | Authenticated cookie plus `Idempotency-Key`; body below; returns `{ order }`. |
| GET `/api/v1/orders/mine` | Authenticated current user's orders; returns `{ orders }`. |

Public product queries require the product to be active/approved and its business to be public/approved/trusted-approved/active. Listing is ordered newest first and capped at **100 products**. The inspected public controller has no page/cursor parameter and returns no total. Do not add a fake pagination total or declare a large restaurant's entire catalog loaded. Public retrieval does not exclude `out_of_stock`; the menu displays unavailability and checkout/entry enforce it separately.

The menu filters returned products against the six food **product** category codes. It uses the first product's business name/currency and checks currency differences across the returned menu, not just the selected cart. The server derives order vertical from the **business** category. Preserve this distinction as an open parity question; do not silently replace it with a new category model.

## 3. Local cart is not an authoritative order

Nominal cart shape: `{ businessProfileId, items: [{ productId, quantity }] }`.
Storage key: `khedmah:restaurant-cart:<businessProfileId>` in localStorage. It is restaurant-scoped, not explicitly account-scoped in this helper.

Observed read behavior: no window returns empty; failed storage reads, malformed JSON, wrong restaurant or non-array items return empty. Lines are retained when productId is a string and quantity is an integer from 1 through 50; at most 20 valid lines are returned.

Observed change behavior: the UI passes +1/-1; the helper clamps quantity to 0–50, removes zero quantities, and refuses an added twenty-first line. It returns a new cart for permitted changes. These helpers do not reserve stock, validate current prices, authorize the user, or create an order.

Checkout re-fetches current products, rejects missing/unavailable selected items, and checks one business and one currency before submission. The backend independently validates products, prices and merchant eligibility. A price in browser storage or a rendered subtotal is never authority to debit or accept an order.

### Explicit findings, not silently repaired

- **FOOD-01 — catalog cap:** the current product list is capped at 100 without public pagination. Actual large-menu behavior needs a separately reviewed contract.
- **FOOD-02 — category/currency parity:** menu eligibility uses product category; backend order vertical uses business category. Menu currency blocking is across all loaded products. Do not infer these are equivalent.
- **FOOD-03 — storage failure:** cart reads catch storage failures, but write/clear helpers propagate them. Menu change calls write without a catch. Checkout catches cart-clear failure after a successful order, so it is not treated as order failure there. Restricted-storage browser acceptance remains open.
- **FOOD-04 — storage input assumptions:** the reader accepts an empty productId and duplicate IDs; the change helper assumes integer deltas rather than validating them. Local characterization confirms these behaviors. They are not a security or data-validity guarantee; backend remains authoritative.
- **FOOD-05 — account-switch/privacy recovery:** the inspected cart key is restaurant-scoped. Checkout sessionStorage recovery is scoped by businessId/productId, not explicit user ID, and stores the order draft including contact/address fields. Account switching, logout cleanup and retention behavior across the full application remain unverified; do not certify account isolation from this local helper.

## 4. Promotion quote, create and retries are different operations

The quote response contains merchantBusinessId, vertical, currency, subtotal, discountAmount and discountedSubtotal, plus optional promotion code/name. It has no delivery fee or guaranteed final amount. A quote is not a created order, a reserved discount, payment, or the later order status `quoted`.

In the inspected checkout, applying a nonempty promotion code calls the quote API. Creating an order **without** a promo does not require a preceding quote API call in this code path. With a promo, submission requires its reviewed quote; the payload carries promoCode, expectedSubtotal and expectedDiscountAmount. Avoid the incorrect universal statement that every checkout always calls the quote endpoint first.

The backend create validator accepts:
- 1–20 item lines; productListingId string trimmed to 1–100 characters; quantity converted with Number and checked as integer 1–50.
- deliveryAddress trimmed to 5–300 characters and customerPhone to 6–30 characters.
- optional customerNote trimmed to 1–500 characters.
- optional paired deliveryLatitude/deliveryLongitude, converted to finite numbers within latitude +/-90 and longitude +/-180.
- prescriptionAttested only when exactly true; this food slice does not certify pharmacy operation.
- optional normalized promoCode. If present, both expected monetary fields are required; if absent, either expectation is rejected. Expected amounts must be finite nonnegative numbers within the source limit and with at most two decimal places.
- Idempotency-Key is a trimmed string of 16–128 characters. Do not add client-owned status, authority or final-price fields as trusted inputs.

The service resolves current user identity from the session. It requires available active/approved products from one merchant and one currency, disallows controlled items, derives vertical from merchant category and computes the subtotal server-side. A newly created order starts `placed`, `paymentMethod=cash`, `paymentStatus=pending`.

The service checks same-user idempotency replay against item quantities, address, phone, coordinates, notes, attestation and promotion expectations. Repository create takes a user/key transaction lock, checks for a prior order and re-reads product data before inserting. A concurrent-change conflict is not permission to overwrite the original order. This source read does not certify all race conditions or execute any real SQL.

Promotion lookup verifies food vertical, merchant/currency, active/time window, minimum subtotal and redemption limits. Quote lookup is unlocked; create resolves it with locking and checks the reviewed subtotal/discount before insert. The discount applies to the food subtotal, not delivery fees. The existing ownership bridge keeps promotion migration 034 behind separate Production review.

Checkout persists an attempt key/draft in sessionStorage with a 30-minute TTL. A matching recovered attempt reuses its request; mismatch blocks recovery until review. The shown submit logic requires an order ID before claiming success, clears attempt storage after success and keeps optional notifications from blocking submission. A network error or uncertain response must not be replaced by an automatically generated new order key. Full browser recovery/expiry/account-switch testing remains open.

## 5. Later fulfillment boundary

The current service separately handles merchant pricing/delivery fee, customer acceptance, courier assignment/acceptance, pickup and completion. In the inspected transitions the merchant moves placed to quoted with a delivery fee; the customer can then accept quoted to merchant_confirmed. Therefore `placed` must not be displayed as merchant-confirmed, dispatched, delivered or paid.

The complete lifecycle, recipient notification durability, ownership changes, courier document eligibility, tracking, cancellation/reassignment and payment-status transition are the next review slice, not completed acceptance here. The UI ownership bridge uses cash fulfillment and does not authorize electronic payments or Taxi rollout.

## 6. Local exact-source test evidence

Copied the complete restaurant-cart.ts from the pinned connector read into an isolated container and verified `git hash-object` equals **8f33c668d77a1051d7c53662e065da753015401d**, matching GitHub.

Runtime: Node.js v22.16.0 with --experimental-strip-types and its built-in test runner. No dependency installation, real browser, network, database, cloud credential or Floot execution was used. No whole-repository clone is claimed.

**24 local tests passed, zero failed:** 20 normal/current-behavior cases and 4 limitation-characterization cases. Normal cases cover absent window/storage, malformed carts, restaurant isolation, quantity/line boundaries, immutable changes and specific-key clearing. The four characterization cases deliberately assert the existing empty-ID, duplicate-ID, storage-error propagation and fractional-delta behavior; their passing is NOT an endorsement of those limitations.

This evidence tests this helper only. It does not certify HTTP routes, authorization, checkout React behavior, server price calculation, database transactions, actual browser storage, Production schema or Floot integration.

## 7. Required future integration acceptance

1. Discovery reports partial category failures and never invents a complete product total beyond the current cap.
2. Cart/menu identity, empty/unavailable items, category/currency behavior and restricted storage are tested on actual mobile browsers.
3. Authentication/CSRF/error contracts survive the chosen transport; a frontend role label never authorizes orders.
4. No-promo and reviewed-promo submissions use the server contract; changed quote/price is surfaced, not overridden.
5. Identical retries, double taps, lost responses, reload, expiry and account switching cannot be advertised safe until end-to-end tests pass.
6. Initial order receipt is distinguished from merchant pricing, customer confirmation, courier assignment, delivery and cash collection.
7. Full governed schema, live role cutover, backup/restore and release gates remain separately required before Production.

Next bounded slice: customer/merchant/courier fulfillment transitions and their exact access, notification and tracking contracts. Do not broaden this document into permission for a production transaction.
