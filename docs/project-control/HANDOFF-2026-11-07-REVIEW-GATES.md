# Khedmah Digital — Live source verification and preserved review gates

Captured: 2026-11-07 UTC. **GitHub source/CI checkpoint, NOT deployment authorization.**

## 2026-11-08 Floot map migration — new editor-only routes and limits

**Scope:** The historical Next.js `/map` in GitHub `main` has a Google Maps JS map, rendered-tile readiness, interactive provider markers, viewport/bounds and map/list exploration. Those advanced features have **not** been reproduced fully in Floot, and no live driver tracking is attested.

**Implemented on the current Floot editor (version `1794147323691`):**
- Created `/platform/map` with geolocation requested only on user action, read-only nearby search using Khedmah upstream, selected provider map point and optional route to a provider, per-user separate consent before loading the Google Maps iframe. A link to Google Maps always requires a deliberate click. Clear-location removes the page location and cancels/removes location-indexed React Query results.
- Replaced formerly blank `/map` route with internal redirect to `/platform/map`. Added entry points from `/platform` and `/platform/nearby`.
- Updated business and professional public profile location previews (including business branches) to use `KhedmahMapPreview`, retaining separate user consent before loading an embedded third-party map.
- Extended `khedmah_nearby_GET`'s display-only contract to project **only valid pairs** of published business `lat/lng` into `latitude/longitude` for selected nearby providers, after verifying public, active, approved search rows. Partial, malformed and out-of-range coordinates are omitted rather than plotted. No owner identity, hidden phone or private raw payload is returned.
- Search/nearby responses without publicly available provider coordinates remain list-only, never fabricated map pins. The destination/route is constructed only from validated provider coordinates and user-initiated geolocation.
- Added `helpers/khedmahMapJourney.spec.tsx` and extended `helpers/khedmahNearby.spec.tsx` for explicit location permission, consent-gated embed, profile navigation, invalid coordinates, legacy route, selected point/route and clear-location. **143/143 enumerated Jasmine spec files PASS** in 8 batches; incremental TypeScript `clean`. Restore checkpoint `a0c12a5b-5702-47e4-bcca-ce9afec773f8`.

**Not attested / release BLOCKERS:** Google Maps JavaScript multi-marker rendering, geographic viewport-based search, automatic address geocoding, real-time taxi/courier tracking, physical iOS/Android location permissions, native app navigation, browser mobile/desktop interactive screenshot acceptance and published-site parity. The editor preview window did not answer a navigation request. Floot public release still dates to Nov 4 and does not yet contain these changes. Cloud production and financial/mutation gates remain NO-GO.

**Next Safe Action:** test new Floot `/platform/map` in an actual desktop and iPhone browser with consent deny/accept, verify published business geocoordinates and selected route, then design approved Google Maps JS key/domain controls and backend viewport contract if full multi-marker parity is required. Complete independent security review and release gates before any public publication.

## 2026-11-08 Floot admin migration — editor source, not published

Owner requested full consolidation of platform administration in Floot. **Current completed bounded work is a source-level migration milestone, NOT a claim all administrative mutations are operational**:

- Added Floot-internal pages: `/platform/admin/kora`, `/platform/admin/categories`, `/platform/admin/taxi-pricing`, `/platform/admin/billing`, `/platform/admin/operations`. These replace external handoff links in the **editor** for executive, category, taxi fare, pending billing and operations **read-only** workflows.
- Introduced a single fail-closed allowlisted authenticated read adapter at `endpoints/integrations/khedmah_admin_modules_GET.ts`, with fixed backend paths, strict selector and zone validation, cookie-only credential forwarding, no upstream redirect, bounded responses, private/no-store headers, Zod response projections, and no mutation verbs. Upstream enforces independent category, pricing, billing and operations roles. Anonymous smoke for all five endpoints yielded 401, with no credentials supplied.
- Reused the existing Floot review center for professional/business, listings/products, verification, driver documents and taxi-candidate review; approvals still require unimplemented independent execution/transaction/identity gates.
- Added manually initiated KORA **KILLCRITIC and AUTOPSY** analytic forms and `endpoints/integrations/khedmah_admin_analysis_POST.ts`. Only the two fixed server-side analysis endpoints are reachable; origin and session checks are required; output contract demands `automaticExecutionAllowed:false` and undetermined root cause for autopsy. No automatic execution or external production operations.
- Added operations history in read-only mode, with projected audit/change/incident fields rather than passing arbitrary server payload properties.
- Fixed module navigation visibility for operations-only role holders; source tests confirm the five internal links without granting access to review domains.
- Latest Floot editor version observed `1794146562587`; 142/142 enumerated Jasmine spec **files** passed in 8 batches, TypeScript **clean**. Checkpoint `9e3353a7-77e7-43c9-ba71-e4a01c7d582d` captured the source changes. The earlier account logout fix and admin permissions hardening remain in the editor.
- **Not yet transferred as working authorized writes**: category create/update, fare revision save, financial settlement/receipt confirmation, advanced operations changes/release/rollback, complete report moderation decisions, full KORA task orchestration. Merely displaying the new Floot page or seeing an HTTP 200 does not prove an authenticated RBAC journey. Server Preview runtime/source parity, category/billing/taxi exact endpoint acceptance, real phone/desktop interaction and full E2E have not been captured.
- **Published Floot remains the 2026-11-04 release**. No publication or Google Cloud/SQL/financial/production mutation occurred. Keep project release **NO-GO** pending reviewer approvals and gates. Do not copy Next.js files verbatim into Floot or activate unauthorized writers.

**Next Safe Action:** complete explicit administrator-role login journeys on Floot Preview, attest serving preview backend route contracts and current Cloud Run/DB state, then implement and independently test guarded category edits, fare simulation/change, billing receipts and administrative operations, each with transaction safety, review receipts, human approval where necessary and rollback. Only then approve separate publish.

## 2026-11-08 release acceptance execution — exact observed evidence (source/HTTP/DB only)

**Live protected `main` observed:** `cc8d49809cb9543ee1620432d9c0ba73fb801cbb`. **NO-GO for full Production.** Do not promote previous successful PR workflows to runtime or release authorization.

| Gate | 2026-11-08 evidence | Decision |
| --- | --- | --- |
| PR #352 documentation | Head `25605353d66b0048ee1fcb84506928b5417f58e4` had 3/3 exact-head Actions SUCCESS, resolved/outdated inline thread; no independent `APPROVED` | HOLD merge for reviewer; writing this receipt changes head and invalidates prior-head status |
| PR #357 frontend integration | Head `500f7ebfe30b5b8f29d0701f4950af68e1cdf943` had 3/3 exact-head Actions SUCCESS, earlier palette thread resolved; no independent `APPROVED` or real multi-role/mobile acceptance | HOLD |
| PR #356 restaurant source safety | Head `93a19977913a2e3d3a33b4ea50832f9fa3924642` had 3/3 exact-head Actions SUCCESS; no independent security `APPROVED` | HOLD; no FCM activation |
| Floot editor static validation | Editor version `1794142750431` passed 139 of 139 enumerated Jasmine spec files in seven explicit 20/20/20/20/20/20/19 batches, 0 failed; TypeScript `clean` | PASS source-only |
| Floot editor restore point | Checkpoint `f81abdbe-8b6e-4dcc-ad63-f5634ced6d20` contains clarified administrative source-parity wording; `khedmahApprovalExecution.enabled` remains false | SAFE editor-only |
| Floot published provenance | Public release `1793750504473f0272d7f-c673-4f61-acff-130b2f13d3e9` dated **2026-11-04** (1324 files), distinct from newer editor; no independent GitHub/Floot serving-source attestation | BLOCK |
| Floot preview HTTP | GET health 200 / `connected=true`, serving upstream version `preview-pr-274-f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`; public browser config GET 200; anonymous session/admin/reviews GET each **401** | PASS bounded anonymous contract only |
| Published site HTTP | Nine public HTML route GETs returned 200 (home/account/professionals/professional manage/admin/reviews/orders/restaurants/business); published health 200 but identifies same **Preview V2** upstream; anonymous session/admin/reviews API GET each **401** | PASS route-shell/auth-denial smoke only; **not** authenticated E2E or verified Production backend |
| Owner-reported Google login | Owner reports successful Google sign-in for one account. No authenticated session traces, role matrix, cross-device persistence or independent admin acceptance captured here | PARTIAL; keep role/security gate open |
| Floot read-only business DB counts | `business_companies=1`, `business_market_opportunities=31`; `business_client_access=0`, `business_access_requests=0`, `business_tender_alert_preferences=0`, `business_tender_alert_deliveries=0` | Business content exists; customer access and actual alert delivery not demonstrated |
| iPhone visual acceptance | Preview screenshot request could not capture: no Floot editor/preview browser window open | BLOCK mobile visual acceptance |
| Google Cloud production controls | No new authenticated Cloud Run/Cloud SQL effective release evidence. Earlier read-only gate `41710857994` STOPPED on writer quiescence | BLOCK Production, schema, scale/traffic, release |

**Interpretation and safety:** Anonymous `200` HTML is only proof that a shell/route was served, not that its interactive page rendered, authorized APIs worked, or business acceptance passed. Anonymous `401` checks validate denial without a session, not permissions of real customers, professionals, drivers, merchants, or admins. No live push, financial commitment, moderation approval, database write, deployment or published-site mutation occurred.

**Next Safe Action:** secure independent formal current-head `APPROVED` reviews for #352/#357/#356; run authenticated cross-role browser acceptance and phone/keyboard review; capture authoritative current Cloud V2 serving image/revision/traffic, database writer/quiescence, rollback and backend target attestations; compare editor with serving source and run a scoped release candidate. Only after all relevant gates are affirmative may any sensitive activation or Production/Floot publication be separately considered. Keep original overlapping PRs unmerged independently.

## Sources re-checked in this cycle

- Repository: `khedma-sy/khedmah-digital-v1`; last observed protected `main`: `cc8d49809cb9543ee1620432d9c0ba73fb801cbb`. Always refresh before making decisions.
- Open PR inventory: 12 (#344, #346, #348–#357). No new protected-main merge in this check.
- **#348** smart-admin professional source-only draft at exact head `246b353bc2eeadb2242106e7bc8a436b6e267c5f`: all three Actions SUCCESS (Node.js CI `42319717281`; Khedmah Test & Verify `42319718433`; PR Preview `42319716832`). This is NEW evidence superseding the older "CI in progress" pointer. Keep DRAFT and NO ACTIVATION.
- **#352** audit and recovery checkpoint head `11ce8fe6192cde1103dafb9c5002da395a468f9b`: all three Actions SUCCESS (Node.js CI `42318477939`, Test & Verify `42318477935`, PR Preview `42318478035`). Note that adding this handoff changes the head; exact-head CI must be rerun/rechecked for the new SHA.
- **#356** combined restaurant notification safety head `93a19977913a2e3d3a33b4ea50832f9fa3924642`: all three Actions SUCCESS (Node.js CI `42316939468`, Test & Verify `42316939487`, PR Preview `42316939466`). Fix includes rejection of invisible Unicode FCM tokens and corrected test syntax. This is source-only and is NOT live OS background push.
- **#357** combined account/home/professional journeys head `4ec8391e7f01e7f1c2d2986dd4b3b360fe883197`: all three Actions SUCCESS (Node.js CI `42312875766`, Test & Verify `42312875780`, PR Preview `42312875773`).
- **#346** Android legal/account links head `247d95cf55356f729535a83e1fdb777e827a0969`: five exact-head workflows SUCCESS, including non-production Android Debug Build and Google production readiness. This does not prove account unblocked, signed release, or Play publication.
- No formal `APPROVED` review on #346/#348/#352/#356/#357. #348 is deliberately DRAFT. The original branches #349/#350/#351 and #353/#354/#355 overlap integrated #357/#356; do not merge duplicate originals separately.

## Read-only writer-boundary audit (current source)

| Surface | Observed protection | Unresolved condition |
| --- | --- | --- |
| Authenticated owner service edits (`ServiceCatalogRepository.insertOwned/patchOwned`) | `withOwner` transaction locks the parent professional profile with `SELECT ... FOR UPDATE`, checks owner and advances moderation/revision after child writes | Production runtime/source parity and concurrent full E2E not verified |
| Authenticated profile media upload/delete (`MediaService`) | Parent-lock path and moderation invalidation present on normal profile media transactions | Verify every owner-type branch, object storage failure path, and actual deployed writer |
| Internal/legacy service persistence (`ServiceCatalogRepository.save`) | Direct SQL upsert exists and does not itself demonstrate the same parent lock | Inventory all callers/service exports; ensure no untrusted runtime entrypoint can invoke it |
| Internal/legacy professional media persistence (`ProfessionalProfileRepository.saveMediaAsset`) | Direct SQL save exists without a demonstrated parent lock | Inventory all callers and constrain legacy runtime reachability |
| Smart-admin reviewed write (PR #348) | Server-side canonical state/fingerprint; transaction rechecks fingerprint under parent-row lock; tests reject stale revision, edited media, featured timestamp, profession type, and authenticated owner service edit; no duplicate trust event | Trusted independent service principal and full content-risk policy assessor NOT connected. No route, worker, or activation permitted |
| Cloud Preview V2 release writer gate | Prior readonly operation `41710857994` explicitly stopped `KNOWN_SERVICE_INVENTORY_NOT_QUIESCENT` | Quiescence, DB connection under actual app identity, serving image/revision/traffic/secret binding and rollback proof missing |

**Interpretation:** The owner-scoped normal service path uses appropriate parent locking in code, but the existence of legacy/direct SQL helpers prevents claiming that *all possible writers* are serialized. The present source review did not demonstrate external exploitability or a production write. Preserve the fail-closed runtime hold until all call paths are confirmed.

## Floot publication boundary (fresh check)

- Floot editor version `1794001333939` remains separate from public release `1793750504473f0272d7f-c673-4f61-acff-130b2f13d3e9`, published `2026-11-04T00:01:39.684Z`, source digest prefix `49d52b15`, 1324 source files in that live release.
- Previous editor-only quality result: 139/139 Jasmine test files PASS and TypeScript CLEAN; **not rerun in this cycle**, not full end-to-end acceptance. The 19 recently edited Floot files were preserved in `docs/project-control/FLOOT-EDITOR-CODE-SNAPSHOT-2026-11-07.json`; this is a redacted **partial** editor archive, not a complete deployable project.
- The Floot web/app fixes and current GitHub PR code are NOT in the published Floot release by virtue of source CI. Do not claim Google OAuth, taxi, restaurant push, merchant checkout, courier, payment or smart-admin approval is operational.

## Decision and next safe action

**NO-GO for production release.** No `main` merge, Floot publish, Cloud Run scaling/traffic/IAM/DB change, token-sender activation, financial commitment or external submission occurred in this cycle.

1. Verify all three exact-head CI checks after this documentation-only commit; resolve any failures before reviewer submission.
2. Obtain real, independent `APPROVED` reviews on #352, #356 and #357 (and separately #346). #348 stays DRAFT until principal resolver, independent content assessor, full writer inventory and authorized PostgreSQL/Preview acceptance are complete.
3. Inspect legacy `save`/`saveMediaAsset` callers and lower-level database mutation surfaces without assuming direct helpers are runtime-exposed. Add source-only authorization/locking tests for confirmed paths.
4. Close independent Cloud source→image→revision→DB writer-quiescence and authenticated cross-role/mobile desktop acceptance gates. No publication solely on green Actions.
