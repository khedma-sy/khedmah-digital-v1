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
