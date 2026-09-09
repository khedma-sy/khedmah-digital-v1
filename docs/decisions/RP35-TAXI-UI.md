# RP35 — Taxi UI binding and principal-title naming rule

## Current scope

This decision records the web binding added after RP34 native Taxi acceptance. The operational entry page is [`apps/frontend/app/taxi/page.tsx`](../../apps/frontend/app/taxi/page.tsx). It consumes the authenticated Taxi contracts already mounted in the backend and does not create browser-owned arrival or meter evidence.

The page supports rider and driver views, server recovery of the current active trip, replay of an uncertain placement attempt, explicit rider consent, redacted driver offers before assignment, and recovery for authentication/authorization/conflict/unavailable responses. `/mobility?type=delivery` remains the delivery-provider discovery path; `/taxi` is the Taxi operational entry.

## Naming correction — 2026-09-10

Owner correction: **خدمة ديجتل** is reserved for the principal/main platform title. Functional interface wording remains **خدمة**. Therefore the BrandMark/main title may display `خدمة ديجتل`, while assistant labels, navigation labels, Taxi journey labels, buttons and descriptive product copy use `خدمة` unless separately directed.

This is not permission to broadly replace the Arabic word `خدمة` or to change the umbrella, slogan, palette, layout or section colors.

## Release boundary

This UI binding does not enable Taxi in Production. Existing feature flags, candidate migration status, driver/vehicle approval requirements, trusted route/meter/proof writers, notification delivery, settlement ledger, Staging acceptance and production rollback/monitoring gates remain open. CI success certifies only the executed source and tests at its exact head.

`docs/operations/SITE-ATLAS.md` predates this route. Until that large atlas is updated as a dedicated documentation pass, `tests/site-atlas.test.mjs` permits exactly this one page owner to be documented by this decision file; every other page must remain present in the atlas. This is a narrow bridge, not a general documentation waiver.
