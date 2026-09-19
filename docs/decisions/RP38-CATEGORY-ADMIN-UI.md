# RP38 — Category Admin UI ownership bridge

## Decision

The Product V2 category administration surface is owned by the exact Web page below while the primary Site Atlas is reconciled with the newly approved administrative taxonomy capability.

This is a **narrow bridge, not a general documentation waiver**. It authorizes no wildcard admin route family, no bypass of authentication or category-admin authorization, and no replacement for the primary Site Atlas.

## Exact page owner

- Category administration: [`apps/frontend/app/admin/categories/page.tsx`](../../apps/frontend/app/admin/categories/page.tsx)

## Boundary

This page manages the existing canonical Category authority. Category codes remain immutable after creation. Deactivation is soft-state only; the Product V2 surface does not expose destructive deletion. Parent-child cycles and deactivation of parents with active children remain rejected by the backend.

The supplement does not authorize Production deployment or bypass build, test, Preview, or explicit release gates.
