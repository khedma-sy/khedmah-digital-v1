# Khedmah Backend Runtime

`apps/backend` is the repository's only executable backend host. It is a NestJS
and TypeScript application built from `src/main.ts` and started from
`dist/main.js`.

## Runtime responsibility

The host owns HTTP routing, request/response mapping, authentication and session
handling, database access, framework lifecycle, and production startup. The
current `AppModule` composes these runtime capabilities:

- identity, users, email verification, password recovery, and Google sign-in;
- organizations, business profiles, and professional profiles;
- categories, service catalog, locations, search, and contact inquiries;
- media, reports, analytics, moderation, and operations reporting;
- product listings and the product-store operations surface;
- health, logging, rate limiting, request context, and database migrations.

The module list in `src/app.module.ts` is the executable source of truth. This
README must not be used to infer that a feature is production-ready; readiness
still requires its tests, migrations, configuration, and deployment checks.

## Relationship to `backend/`

`backend/modules`, `backend/core`, and `backend/shared` contain canonical,
framework-neutral domain contracts. `backend/operations` contains governed
operation foundations, and `backend/migrations` is the canonical SQL migration
lineage. They are not a second server and must not gain another bootstrap.

Runtime/domain convergence is deliberate and adapter-driven. Do not copy domain
rules into a new runtime, move NestJS controllers under `backend/`, or delete the
canonical foundations merely because the runtime does not yet import every one.
The integration boundary is documented in `src/integration/README.md`.

## Commands

From the repository root:

```sh
npm --workspace apps/backend run build
npm --workspace apps/backend test
npm --workspace apps/backend run dev
```

Database-backed tests intentionally require a disposable database and the
explicit destructive-test guard. Never point them at Preview, Staging, or
Production.
