# RP40 — Taxi Driver Operations UI

This document is a **narrow bridge, not a general documentation waiver**.

It records the exact page owner introduced by the fifth Khedmah recovery audit for governed Taxi driver review. The primary SITE-ATLAS remains authoritative for the rest of the Web surface.

## Exact page owner

- [Taxi Driver Operations admin console](../../apps/frontend/app/admin/taxi-drivers/page.tsx)

## Scope

The page is limited to `security.manage` operations for the canonical Taxi operational authority introduced by Migration 031:

- inspect the current Taxi business readiness state;
- review the latest private driver and vehicle documents through the existing secure document API;
- approve, suspend, revoke, or renew driver/vehicle/zone operational authority;
- record verification reference, reason, expiry, revisions, and append-only decision evidence.

It does **not** enable Taxi trips, dispatch, arrival, metering, completion, or browser-trusted trip evidence. `TAXI_TRIPS_ENABLED` remains an independent rollout gate.

## Identity and interaction boundary

The console uses the shared administrative shell and human-review dialog system. Driver-facing onboarding remains under the canonical Taxi navy section identity and is owned separately by the Taxi UI supplement.
