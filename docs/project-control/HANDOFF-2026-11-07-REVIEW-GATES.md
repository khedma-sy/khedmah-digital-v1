# Khedmah Digital — Live source verification and preserved review gates

Captured: 2026-11-07 UTC. **GitHub source/CI checkpoint, NOT deployment authorization.**

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
