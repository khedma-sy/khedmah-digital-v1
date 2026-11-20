# Post-publish hotfix: reject legacy Backend reviewed-quote confirmations (2026-11-16)

## Finding confirmed live
- Floot production web release before fix: `17948620376495ecb4a1f-0013-496c-9ce6-b198bcf08bc9`.
- Live Google Preview HTTP GET `/api/v1/health` returned 200 with `version=preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`; GET `/api/v1/health/ready` returned 200.
- Compared exact GitHub Backend SHA `f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`: `order.service.ts`, `order.repository.ts`, `order.validation.ts` do **not** contain `expectedQuote`. Legacy validation constructs status/options without checking unexpected reviewed quote, so cannot assert atomic customer-reviewed money enforcement.
- Current Floot `endpoints/integrations/khedmah_order_action_POST.ts` sends `expectedQuote` on confirmation. Consequently this version combination is incompatible, despite successful prior unit/fixture tests.

## Executed fix inside Floot
- Added a bounded read-only `/api/v1/health` version gate in `endpoints/integrations/khedmah_order_action_POST.ts` **before confirmation PATCH**. Only the exact audited Backend SHA `20951b4eb991440083a61c611771f7828e440944` is accepted in this gate. All failures/other versions return 503 `not_applied`; version `f4f8ce2...` therefore cannot receive a confirmation PATCH.
- Added clear Arabic client error to `khedmah_order_action_POST.schema.ts` for 503 `not_applied`; user knows confirmation was not sent.
- Updated `helpers/khedmahCommerceContracts.spec.tsx` to check rejected legacy Backend before any PATCH and continued allowed-version/409 no-retry behavior.
- All **160/160 explicitly selected Floot Jasmine spec files passed**, batches of 20; global `typecheck: clean`.
- Floot checkpoint `cec78757-edfc-4bc9-8783-72d759c7d18d`.
- Called Floot `publish_app` for WEB ONLY, with `include_made_with_floot=true` (free-plan constraint), `mobile=false`; job `35ec8b9e-6f39-41c8-b430-3834b49660d1` **succeeded**.
- Independent `get_publish_status` returned `published=true`, live release `17948628681229648d552-0339-4bbc-9ff9-2d487adcae25`, `publishedAt=2026-11-16T21:01:04.055Z`, sourceDigest `bc7794c4b656fb09398b1068b499fe6e0b9146da1da677d4d2bca8f8406bde2b`, 1396 files, `laterFailedPublish=null`.
- Post-publish read-only HTTP: `https://khedmah.uk/` -> `/platform` 200; `https://khedma-meeting.floot.app/` -> `/platform` 200; live upstream version still `f4f8ce2...` (expected: quote confirmation remains safely closed).

## Outstanding operational acceptance
- This is a **fail-closed safety hotfix**, not commercial order functionality acceptance: confirmation is unavailable until a tested compatible Backend is deployed and the version gate is updated/accepted.
- No new Cloud Run Backend deployment, Cloud SQL migration or native mobile build.
- Hosted Backend's exact supported version/config, role-gated accounts, restaurant/taxi flows, and device notifications must be accepted before switching the customer confirmation flow on. Old LAB database remains stopped.
- Floot free plan **does not run its scheduled jobs**, even after publish. Floot post-publish flagged five endpoints without internal callers; verify intent before removal.
- GitHub draft PR #398 was at SHA `bfc9170ce25de7147d30d90a10b8d8a40942ecb8` before this receipt. This GitHub record is not a merge.
