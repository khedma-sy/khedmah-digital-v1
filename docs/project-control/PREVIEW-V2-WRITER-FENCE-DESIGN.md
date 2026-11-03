# Preview V2 writer-fence design — 2026-10-24

## Live prerequisite now closed

The owner successor receipt reached `PREVIEW_V2_APPROVAL_SUCCESSOR_GATES_READ_COMPLETED` with:

- `authority.all_granted=true`;
- all seven authority checks `CAN_ACCESS`;
- one serving revision, `khedmah-pr-274-backend-00008-tg8`, at 100% traffic;
- `tagged_revision_count=0`;
- `runtime_sessions_total=0` only as a point-in-time observation;
- `writer_quiescence_verified=false`;
- the service template still not using the pinned candidate image.

The serving revision is already provenance-bound to image digest
`sha256:be90387535778e81016126e8ca6d626e8f170c20d1bd8c5add8dbb98beecba17`.
The compatible candidate remains pinned to
`backend@sha256:2146d382d426568a510b6e76ff06129934e84beb86bc81c348454fe3e29e260e`.

## Why traffic-only drain is rejected

Cloud Run traffic migration allows already-running requests to continue, so moving traffic away from an application revision is not proof that it can no longer write. A tagged revision also remains independently reachable. Therefore a quiet database snapshot, elapsed request timeout, or traffic readback alone cannot prove writer quiescence.

References:

- https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
- https://docs.cloud.google.com/run/docs/managing/services
- https://docs.cloud.google.com/run/docs/managing/revisions

## Reviewed fence shape

The future live operator must be fail-closed and use the following order:

1. Re-read the exact Cloud Run service generation and abort on any drift.
2. Require the current authority set, one serving application revision, and zero tags.
3. Create one **inert maintenance revision** using the already-proven current immutable image, but with a reviewed HTTP-only entrypoint and **no database or migration secret binding**.
4. Route 100% of the service URL to that maintenance revision. Do not treat this routing change as the fence.
5. After old application revisions have zero traffic, retire/delete every old application revision. The maintenance revision is then the only reachable revision.
6. Re-read the complete revision inventory and require no tags and no old application revision.
7. Only after the application code is unreachable, take a fresh database observation. Require zero `khedmah_app` sessions, zero additional migrator sessions and zero unexpected identities.
8. The future bounded operator may then set its own `writer_quiescence_verified=true` and execute the already-reviewed atomic 036+037 transaction.
9. Require an acknowledged COMMIT and a separate fresh exact schema readback. An unknown commit outcome stays in maintenance and is never replayed automatically.
10. Deploy the pinned compatible candidate, prove startup and acceptance, and only then promote it.

## Explicit non-goals

This design PR performs no Cloud Run update, no traffic/scaling change, no revision deletion, no secret/IAM change, no SQL connection, no 036/037 execution, no Floot gate activation and no Production publication.

The offline planner at `scripts/prepare-preview-v2-writer-fence.py --plan` exists only to make the reviewed sequence and fail-closed conditions executable as source-level contract evidence.

## 2026-11-03 evidence and successor implementation checkpoint

- Protected-main GitHub read-only workflow [41699641838](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/41699641838) **succeeded**. The live service was read twice at stable **manual-zero**, no revision tags; the reported service update was 861402 seconds old at the time of that read. This is Cloud Run state evidence, **not** a DB-writer-quiescence or release permit. `database_checked=false`, `writer_quiescence_verified=false`, `release_authorized=false`.
- The historical one-shot operator `scripts/execute-preview-v2-writer-fence.py --execute-fence` is now **fail-closed even if its old confirmation token is provided**. Do not replay it to manufacture Monitoring telemetry.
- `scripts/prepare-preview-v2-maintenance-entrypoint.py --plan` defines a minimal standard-library Node HTTP process that returns **503** for every route, with no application/DB imports. This is **source-only contract evidence** and has not been deployed to the old image or Cloud Run.
- A future maintenance revision must use a **new minimal replacement template**, never inherit environment variables, secret references, volumes/Cloud SQL connections or the historical runtime service-account permissions. A separate, independently verified maintenance identity **without DB or Secret Manager access** is still needed; no such IAM provisioning or denial proof is claimed here.
- Retiring old revisions and proving no other writers remain are still mandatory before the pinned atomic 036/037 SQL transition; the candidate image remains undeployed. Do not start migrations or restore runtime on the strength of the maintenance HTTP fixture.

## 2026-11-03 dual-service writer-surface diagnostic

The previous read-only success [41699641838](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/41699641838) validates only the backend service `khedmah-pr-274-backend`. It does **not** evaluate the separately deployed `khedmah-pr-274-frontend` service. A second backend-only repeat is not useful.

A protected-main optional input `known_writer_services_diagnostic` to `preview-v2-readonly-release-gate.yml` uses the **existing dedicated read-only WIF identity** to retrieve the exact two known services in `europe-west1`, twice. `scripts/read-preview-v2-known-writer-services.py --inspect` requires both to be fully reconciled, explicitly scaled to zero, with one untagged 100%-traffic revision and no state drift. It rejects another project/service, missing IAM, a tagged or live frontend, or a revision/traffic mismatch. It prints **no** credentials, secrets, template details or database rows.

This is only a bounded inventory of two *known* Cloud Run services. It does **not** enumerate possible additional services, execute/list Cloud Run jobs, inspect Cloud Scheduler or Tasks, inspect Cloud SQL or confirm other external writers. Even when successful, it prints `external_writer_sources_checked=false`, `database_checked=false`, `writer_quiescence_verified=false` and `release_authorized=false`. The future live operator must independently enumerate **all** writer surfaces and prove they are fenced before any schema write.

## Remaining implementation gate

A separate implementation PR must build the live maintenance/successor operator with:

- optimistic service-generation preconditions;
- exact revision/tag inventory checks before and after each mutation;
- no database credentials on the maintenance revision;
- old-revision retirement before the decisive zero-session read;
- the existing pinned transition SQL, fresh predecessor locks and commit/readback reconciliation;
- no automatic rollback to an old incompatible runtime after 036 may have committed.

Until that implementation passes exact-head CI/review, **036/037 and candidate deployment remain unauthorized**.
