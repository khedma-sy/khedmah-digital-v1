# Floot web deployment receipt — 2026-11-16

## Live deployment succeeded
Owner explicitly requested `انشر` (publish). Executed `mcp__Floot__publish_app` on Floot project `5e271f43-96a6-40de-a634-ec3eae023a49` with `mobile=false` and `include_made_with_floot=true`. Initial attempted publish failed `Removing Floot logo is a paid feature` (free plan); corrected by explicitly allowing Floot badge, with no subscription change.

- Publish job `eb5ea695-2561-4051-a8ab-ee1a09dac88f`: `succeeded`, `Published — the app is live at https://khedma-meeting.floot.app`.
- Independent `get_publish_status` readback: `published=true`, web release `17948620376495ecb4a1f-0013-496c-9ce6-b198bcf08bc9`, published `2026-11-16T20:47:12.558Z`, sourceDigest `553ea1749440dd88d3c23064f311a0c5cee06a5c5a0aa37655b5b334ee67ea4b`, 1396 files, `laterFailedPublish=null`.
- Custom domains listed by Floot: `khedmah.uk`, `www.khedmah.uk`. Plan `free`, badge displayed. No native mobile app build requested or performed.
- Floot reports 5 endpoints with no internal page/component callers: `endpoints/auth/google_integrations_authorize_GET`, `endpoints/business/smart_sales_sync_POST`, `endpoints/integrations/khedmah_google_POST`, `endpoints/integrations/khedmah_logout_POST`, `endpoints/publisher/tenders_POST`. Inspect before removing; some may have external callers.
- Floot scheduled jobs are **not active** on the current free plan even though the web deployment succeeded. Upgrade and republish is needed for Floot-scheduled jobs if those are required.
- This receipt is **web deployment only**, not verification of authenticated Backend operational order E2E, no Google Cloud migration or database mutation by this tool. The source had previously passed 160/160 Floot spec files, clean typecheck; Backend authorization and flows remain acceptance gaps.

## Immediate post-deploy priority
Verify live anonymous API boundary, signed-user checkout and confirmation against actual hosted backend, live taxi/restaurant alerts and role permissions; then fix remaining discovered issues in Floot/GitHub with distinct verified receipts.
