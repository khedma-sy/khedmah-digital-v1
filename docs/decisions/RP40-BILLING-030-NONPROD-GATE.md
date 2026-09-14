# RP40 — Billing 030 non-production schema gate

## Decision

Migration `030_billing_credits_subscriptions.sql` is an active Product V2 backend runtime prerequisite. Preview and Staging must verify or apply its reviewed schema before building and deploying the backend.

The gate is **non-production only**. It does not authorize Production migration execution, Production billing activation, or a payment-provider rollout.

## Reviewed identity

- Git blob: `88795ee75d9948e5ecf85d8c2d53f6b77397b52b`
- SHA-256: `d758036cbcf20fbcee176c9ea7ba097564142de839b609b22a5cb469d6335194`

## Runtime contract

The gate verifies the exact Billing table family, append-only mutation guards, one-time welcome-credit trigger, new-SYP configuration, the six published launch plans, active usage rates, and `KHEDMA30` promo contract. A partial or unverified footprint fails closed rather than being repaired implicitly.

The canonical isolated deployment order is:

`025 Classifieds → 026–028 Fulfillment → 029 Taxi Pricing → 030 Billing → Backend → Frontend`

Production remains unchanged and is explicitly excluded from the runner, the ensure script, and the production operator.
