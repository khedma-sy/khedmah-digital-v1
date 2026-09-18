# RP36 — Food UI launch bridge

## Status

This document is a **narrow bridge, not a general documentation waiver**. It exists because the `/food` launch surface was added after the current primary Site Atlas snapshot and before the atlas receives its next full regeneration.

## Exact page owner

- [`apps/frontend/app/food/page.tsx`](../../apps/frontend/app/food/page.tsx)
- Styles: [`apps/frontend/app/food/food.module.css`](../../apps/frontend/app/food/food.module.css)

## Contract

`/food` is the Khedmah Food discovery entry point for restaurants, cafes, bakeries, and sweets. It uses real category-backed search links and the official orange sector identity.

This bridge does **not** certify ordering, payment, live courier tracking, restaurant fulfillment, or any backend capability that is not actually enabled. Those capabilities must be integrated from governed implementation work and verified independently.

## Governance

The page remains subject to the shared header, Arabic RTL defaults, light/dark themes, accessibility gates, Preview evidence, and the canonical brand palette `#07427c`, `#81be49`, `#fd9603`.

The next full Site Atlas refresh must absorb this page and retire this bridge as a page-ownership exception.