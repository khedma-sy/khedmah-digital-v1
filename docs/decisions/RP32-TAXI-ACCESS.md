# RP32 — Native Taxi session and eligibility boundary

## Scope and owner direction

Continuation of the owner's explicit Taxi -> independent Classifieds -> Food implementation mission. This pass integrates only Taxi access prerequisites into the existing Nest host. It does not redefine the launched V1 scope, approve a driver, enable dispatch, apply a production migration, change the site design, or merge main. The retained RP30 engine is not rebuilt or represented as mounted by this change.

## Runtime contract

`TaxiModule` is registered in `AppModule`. Its read-only `GET /api/v1/taxi/rider/access` and `GET /api/v1/taxi/driver/access` routes read the existing `khedmah_session` cookie and return only the current actor and (for drivers) the vehicle, operating zone and approval revisions. Neither query parameters nor role headers grant a role. Responses are private/no-store; the host's existing persistent rate limiter covers the Taxi prefix.

`TAXI_ACCESS_ENABLED=true` is necessary but insufficient: only development, test, Preview and Staging modes may execute the service in this pass. Production and unspecified environments are denied. No deployment variable is changed. A missing schema/function or insufficient runtime permissions yields unavailable, never assumed approval.

`TaxiAccessService.withActor` uses the existing `DatabasePool.transaction` and canonical `SessionTokenService` hash. The narrow SQL function locks the existing session, account, credentials and profile; driver use additionally locks an independent driver approval and its vehicle approval. A published professional profile is not a driver license. The callback receives the same transaction client; all future trip writes must use that client. Approval/session expiration is checked again before returning to COMMIT. Never enqueue external side effects from the callback: put them in a transactional outbox.

## Privilege design

PostgreSQL row-lock reads require UPDATE privilege. Giving the web role UPDATE on approvals merely to acquire a lock would allow approval forgery. The candidate uses a small SECURITY DEFINER function instead. It has a fixed search path, fully qualified relations, no dynamic SQL, no writes, no role switch, and no PUBLIC execution grant. Its owner in a reviewed deployment must be a separate non-superuser migration/authority role. The caller gets only schema USAGE and function EXECUTE, not raw identity/approval/evidence access. Definer authority ends before the callback.

The test creates a dedicated NOLOGIN, NOSUPERUSER, NOINHERIT role in the explicitly disposable canonical CI database. Do not infer actual Cloud SQL IAM, production grants or runtime-role migration from these tests.

References: PostgreSQL 16 [row locks](https://www.postgresql.org/docs/16/explicit-locking.html), [row security and locking privilege](https://www.postgresql.org/docs/16/ddl-rowsecurity.html), [column grants](https://www.postgresql.org/docs/16/sql-grant.html); node-postgres [same-client transactions](https://node-postgres.com/features/transactions); Nest [controllers and headers](https://docs.nestjs.com/controllers).

## Candidate schema and boundaries

`apps/backend/src/taxi/sql/access.candidate.sql` is NOT registered in DatabaseMigrator, the canonical test lineage or any deployment workflow. Only the new explicitly disposable test reads it. No fake data is seeded in the candidate. Existing scope and migration gates remain unchanged.

The independent driver/vehicle approval references are opaque references supplied by a future authorized verification writer, not proof that documents were examined. Approval/self-review constraints do not implement enrollment, license authenticity, document storage, reviewer UI, expiry notifications or an audit log for administrative decisions. These must be completed before enabling the routes in a real shared environment. No HTTP approval/write endpoint exists in this pass.

Writers must use the same lock order as documented in SQL. Long callbacks and authority revocations can contend; lock and statement deadlines fail closed, not by retrying a callback. No production capacity has been measured.

## Tests and next step

The native tests use canonical IdentityRepository accounts/profiles/sessions, actual PostgreSQL sockets, a separately restricted SQL role, controlled concurrent revocations, rollback of callback writes on expiry, and native Nest HTTP routes. Test evidence must be read from the exact CI head; a syntax-only local check is not a build or a PostgreSQL result.

Next integrate the retained PersistentTaxiService with this transaction-scoped authority, authoritative route/tariff references and the separately writable proof/consent tables. Do not create a second session system or infer proof-of-arrival from browser input. Full trip dispatch, live location/meter, cash accounting, UI, Food and Classifieds integration remain open. Update the existing live checkpoint with actual run evidence after validation.
