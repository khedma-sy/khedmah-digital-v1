# RP33 — Native Taxi trip integration before UI

## Authorized scope

The owner explicitly requested connecting the retained Taxi engine to RP32 transaction-scoped authority, tariff/routing references, arrival/meter evidence and passenger consent, then testing the whole trip before wiring the UI. Classifieds and Food remain next, not implicitly enabled here. No frontend/CSS/identity redesign, main merge or production rollout is included.

## Source continuity

`apps/backend/src/taxi/engine` imports the actual retained RP30 source, not a replacement engine. Baseline archive: `Khedmah_Operational_Repair_2026-09-09.zip`, SHA-256 `cfc3564bc8b54194bb0846fdc87fbd07e6277b4ea73e3214938545cf64b9cf40`.

| Baseline source | SHA-256 before native adaptation |
|---|---|
| domain.ts | 2da1f43aff48a6b479a7c01d0dcf888bdf64431f292287f3bfb94691eb263df5 |
| server/input.ts | 4329b09c7a9146df243b7964b5e8fe061fae7715e4658e638dedd08c40f8f226 |
| server/ports.ts | 1bccc80e3923e9ea2c149ca07f64701a4c19ca44a7c45eff193b8dcb361ec9b1 |
| server/taxi-input.ts | a4b776893504a498c68a02d417096250e79a17229477f60853bc886e0ab91dc9 |
| server/taxi-service.ts | bc3832a4268751c9ae979b21be8e90d9d404ff5bde38df4f6b608def98c358d4 |

Adaptations retain route identity/revision/source and expiry in quotes; bind vehicle and approval revisions to assignment/evidence; reject coerced meter observation timestamps; validate current routing only for new placement. Shared Food/domain branches are retained library code, not registered Food APIs. The memory test adapter is never selected by the native service.

## One authority transaction

Every native service method invokes RP32 `withActor` exactly once. The retained engine's database port uses the provided PostgreSQL client; its identity port can resolve only that same transaction and original canonical session. No nested BEGIN, second session system, pool query for trip writes, or automatic callback retry. Database clock plus monotonic elapsed time bounds evidence freshness. Reference expiry is checked again before commit, in addition to RP32 session/approval expiry.

The original tariff snapshot remains immutable in a trip. Updating/disabling today's tariff cannot reprice or strand an already created trip. New placements check current tariff and route; committed creation replay recovers the stored trip even if the current route/tariff is unavailable. Assignment includes vehicle and approval revisions. New vehicle approval cannot silently change an active trip; release/report actions remain available under valid current driver authority, but a revoked session/driver requires future operations recovery.

## Native routes

Existing `TaxiModule` registers the trip controller. Rider: quote, create/read trip, actions and consent. Driver: redacted offers, read/actions on assigned trips and consent authorization lookup. Route roles are constants; role/price/evidence assertions in request bodies are rejected. Existing session cookie, host CSRF and persistent Taxi rate limiter remain in use. Responses are private/no-store. No browser can mint arrival/meter evidence. Cash collection is supported; no settlement/admin endpoint or actual money movement is enabled.

## References and least privilege

The candidate schema extends `khedmah_taxi` and is NOT a registered migration or startup operation. It has no seeds. Route keys are derived server-side from zone and exact pickup/dropoff coordinates, with no straight-line or demo fallback. An independent routing writer must insert verified, time-bounded route records from a licensed provider. Tariff is a separately controlled server record. Neither is writable by the runtime role. This implements the storage/authority boundary, not a live vendor adapter or an approved commercial tariff.

Reference reads use narrow SECURITY DEFINER functions with qualified objects, fixed search path and revoked PUBLIC execution. Native acceptance uses a separate non-superuser function/table owner plus distinct runtime, reference writer and proof issuer roles. Runtime can consume evidence via UPDATE(consumed_event_id) but cannot insert evidence or update its payload/source/validity. A consume-once trigger binds consumption to the matching committed event; audit and cash rows are append-only. Passenger consent has its own table and can only start the assigned driver's matching version, after arrival.

Primary engineering references: [same-client transactions](https://node-postgres.com/features/transactions), [PostgreSQL function security](https://www.postgresql.org/docs/16/sql-createfunction.html), [column-level grants](https://www.postgresql.org/docs/16/sql-grant.html). These references justify mechanics, not certification of this application.

## Acceptance and release boundary

Local retained-source build and 217 regression cases passed after restoring its existing TypeScript test dependency/overlay. Initial local run had 213 passing cases and a missing TypeScript dependency for the old preview-route test; no application failure was hidden. Native full build and PostgreSQL evidence must be read from the exact CI commit, not inferred from these local cases. Local npm installation was unavailable (offline cache incomplete).

Native PostgreSQL acceptance exercises real canonical accounts/sessions, restricted roles and Nest HTTP with synthetic tariff/route/meter/document fixtures. It covers full trip through rating and cash collection, lost-response replay, driver races/capacity, stale versions, changed prices/routes, consent/reassignment, reference expiry, invalid meter/vehicle proof, role denial and atomic event/outbox/proof failures. It does not run live GPS, a passenger app, a production payment, or a deployed PostgreSQL migration.

Flags `TAXI_ACCESS_ENABLED` and `TAXI_TRIPS_ENABLED` plus the server operating zone are necessary; RP32 still denies production. No configuration is enabled here. Before release: reviewed migration/role provisioning, live verified driver enrollment, licensed route/meter/proof writers, incident/revoked-driver recovery, notification delivery/outbox workers, settlement ledger, retention, full host/browser and Staging acceptance. No UI is connected by this change.

## RP34 follow-up — wire values and expiry during persistence

This follow-up changes the retained engine, not its session model or UI. The candidate remains uncommitted and unaccepted on native PostgreSQL.

- `jt_orders.archived` is BIGINT. Default node-postgres text decoding returns `'0'`, not numeric `0`; JavaScript truthiness incorrectly hid active trips. The loader now accepts only the explicit active representations `0` and `'0'`. Missing, null, boolean and malformed values fail closed. No global int8-to-Number parser is installed.
- Arrival, rider-consent and meter evidence are checked again when consumed, after aggregate/event/outbox writes. Expiry rolls all those writes back in the same transaction. The expiration field is compared in SQL; a previously committed command receipt can still replay without consuming the proof again.
- New placement rechecks the stored quote's deadline after persistence. A quote that expires during persistence cannot leave a committed order, receipt or outbox event. This does not block recovering a placement that was already committed while its quote was valid.

Controlled before/after evidence: wire tests 9 pass / 11 fail before, then 20/20 pass; deadline tests 2 pass / 4 fail before, then 6/6 pass. The deadline tests use the actual retained engine and SQLite rollback with a deliberately advanced test clock, not a PostgreSQL server. The wire fixture explicitly reproduces int8 strings and JSONB objects; it does not test the pg wire protocol itself. Complete local validation: 223 retained-engine/other-local cases plus 33 adapter/wire cases = 256, no failure, skip or cancellation. Source synchronization checks tie the five compiled engine files byte-for-byte to the delivery candidate.

Three additional native PostgreSQL subcases are written in `taxi-trip.test.ts`: int8 archival/JSONB behavior, and proof/quote expiry while an INSERT waits for a real outbox table lock. These tests use a disposable database and restricted runtime role; they have NOT run in this follow-up. Native dependency build, complete repository CI, deployment and live acceptance remain open. Do not substitute the local totals for those gates.

Sources: node-postgres [types](https://node-postgres.com/features/types), [pg-types int8 policy](https://github.com/brianc/node-pg-types), [same-client transactions](https://node-postgres.com/features/transactions). Keep the production feature flags and UI disabled until the native suite and release gates pass.
