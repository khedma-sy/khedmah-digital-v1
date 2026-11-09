# Preview V2 Google login — schema 035 recovery gate

## Evidence at 2026-11-05
- Preview service: `khedmah-pr-274-backend`, project `khedmah-preview-v2-20261012`, region `europe-west1`.
- Revision `khedmah-pr-274-backend-00008-tg8`; configured manual instances: **0**.
- Logs 2026-10-24T12:13:04Z: `DatabasePool` initialized, `Canonical database schema 035 verified`, `Nest application successfully started`. Historical success only.
- Current read-only approval catalog classified later 035–037 transition `prerequisite-invalid`; this does not prove failure of the old 035 runtime.
- Runtime database login and grants passed the prior read-only probe; release gates are not verified.

## Exact old-runtime contract
- Commit: `f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`
- Source: `apps/backend/src/database/database.migrator.ts`
- Git blob: `b677aa499574e4194b107806dba48b88c85b6142`
- Reuse **that version's** `CANONICAL_SCHEMA_ANCHORS`, `CATALOG_QUERY`, `verifyCanonicalSchema`, and production-mode `RUNTIME_PRIVILEGE_QUERY`. Do not substitute current-main schema 037.
- Preserve `kind:table_name:name` comparison semantics, `khedmah_taxi` schema, and synthetic function anchor. Include independent classifieds guard 025.

## Complete recovery sequence
1. Add a fail-closed, **read-only** current-database verifier that retrieves the pinned old-runtime contract and uses the existing private Cloud SQL proxy and credential handling. Reject source drift, missing anchors, unexpected DB identity, SQL errors, or privilege mismatches. Output no secrets or application data.
2. Capture a dated pass/fail receipt. Reconcile current revision, digest, manual scaling, secret version, IAM, Cloud SQL attachment, and competing writers.
3. Validate the intended Preview-only one-instance restoration. A `validateOnly` operation GET returning 404 is not evidence of successful authorization or restoration.
4. Only after gates pass, approve/apply minimum Preview restoration; verify revision readiness and API behavior.
5. Test Google Firebase token exchange, backend session issuance and persistence on desktop/mobile; capture results in CURRENT-STATE.md and NEXT-ACTION.md before any production decision.

## Safety stops
No automatic migration 036/037. No production mutation. No secret/PII logging. No claim of fixed login without a successful end-to-end authenticated session. Cloud Run Ready=True with manual instances=0 does not prove an active backend.
