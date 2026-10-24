# Taxi + Restaurants completion foundation — 2026-10-24

This source-only slice starts the two highest-priority customer journeys without touching Cloud, database schema, feature flags or Floot publication.

## Taxi

Adds an explicit vehicle-class catalog for the customer-facing choices requested by the owner:

- Economy — 4 seats — 1.00x
- Comfort — 4 seats — 1.25x
- SUV — 6 seats — 1.55x
- Van — 8 seats — 1.90x

The helper scales the already-existing server-authoritative fare result. It does **not** replace route distance, tariff, demand multiplier, waiting fee or quote authority.

## Restaurants

Adds a pure Smart Offer Draft builder over the existing `food-promotions` contract. It validates the exact promotion shape and classifies low-risk offers as auto-publish-eligible while flagging aggressive/unbounded campaigns for owner confirmation.

It does not publish a campaign, write SQL or bypass merchant ownership. Wiring the draft helper into the merchant command center is the next UI slice after this foundation passes CI.

## Explicit exclusions

No migration, no Taxi feature-flag activation, no live routing/GPS, no push delivery change, no database write, no deployment, no Floot publication.


## Vehicle-class dispatch enforcement

Vehicle class is now authoritative in the Taxi candidate path. The selected class is stored in the server quote together with its fare multiplier. Approved vehicles carry one of `economy|comfort|suv|van`; the locked actor snapshot exposes that class, and the retained journey engine rejects mismatched drivers both while listing offers and when accepting a trip. The rider UI may therefore request all four classes without relying on browser-only eligibility.

This remains candidate/pre-production work. It does not authorize the candidate Taxi schema, `TAXI_TRIPS_ENABLED`, migrations, Cloud Run changes or Production rollout.

## Restaurant distance pricing / ETA foundation

`apps/backend/src/orders/restaurant-delivery-quote.ts` is a fail-closed pricing core. It accepts only a trusted route containing a verified distance, duration, source/reference and expiry. It calculates configured base + per-km delivery fee with floor/ceiling bounds and ETA with a pickup buffer. It deliberately refuses unverified, expired or straight-line/browser-authoritative distance.

The repository currently has a Google Directions abstraction, but no reviewed runtime transport wired into the Orders path. Therefore this PR does not pretend that restaurant route pricing is live yet. The next integration must supply a licensed/approved server-side routing provider, retain a route reference/expiry, and bind the exact route-derived delivery quote into order creation before the checkout UI can claim a final delivery fee or ETA.
