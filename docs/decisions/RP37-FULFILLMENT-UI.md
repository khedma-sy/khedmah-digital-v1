# RP37 — Fulfillment UI ownership bridge

## Decision

The recovered Food and Delivery fulfillment journey is owned by the six exact Web page entry points below while the primary Site Atlas is reconciled with the recovered runtime.

This is a **narrow bridge, not a general documentation waiver**. It authorizes no wildcard route family, no alternate repository, and no replacement for the Site Atlas. Any additional page must either exist in the primary atlas or receive its own reviewed exact supplement.

## Exact page owners

- Customer restaurant discovery: [`apps/frontend/app/restaurants/page.tsx`](../../apps/frontend/app/restaurants/page.tsx)
- Restaurant menu and cart: [`apps/frontend/app/restaurants/[businessId]/page.tsx`](../../apps/frontend/app/restaurants/[businessId]/page.tsx)
- Checkout: [`apps/frontend/app/orders/checkout/page.tsx`](../../apps/frontend/app/orders/checkout/page.tsx)
- Customer order history and tracking: [`apps/frontend/app/orders/page.tsx`](../../apps/frontend/app/orders/page.tsx)
- Merchant order operations: [`apps/frontend/app/orders/merchant/page.tsx`](../../apps/frontend/app/orders/merchant/page.tsx)
- Courier order operations: [`apps/frontend/app/orders/courier/page.tsx`](../../apps/frontend/app/orders/courier/page.tsx)

## Boundary

These pages use the governed cash-fulfillment backend restored on the PR #175 recovery line. Payment remains cash-only. Courier assignment retains the approved-document gate. Taxi remains governed by the newer Taxi rollout and is not replaced by the historical Mobility migration. Classifieds remains independent from Store and fulfillment.

The supplement does not authorize Production deployment or bypass build, test, Preview, or manual review gates.