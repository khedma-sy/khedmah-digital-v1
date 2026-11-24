# Exact-head nine-check verification — 2026-11-16

## Verified GitHub evidence
PR #398 was draft at head `dd606824a3f568cc8da3be3d255edb34658b6b59`. GitHub returned **nine completed/success** workflows for this exact SHA:
- [Backend candidate — offline image #43948791640](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791640)
- [Isolated PostgreSQL quote integration #43948791076](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791076)
- [Backend container — isolated schema 037 startup #43948791241](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791241)
- [Lab connection fence #43948791313](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791313)
- [Lab session guard #43948791243](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791243)
- [Schema 037 privacy #43948791157](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791157)
- [PR Preview #43948791481](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791481)
- [Khedmah - Test & Verify #43948791349](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791349)
- [Node.js CI #43948791105](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43948791105)

## Inspected job-level steps
Quote run job `133585415674` completed/success including `Execute real local PostgreSQL conditional update regression`.
Backend container job `133585521665` completed/success including `Install canonical schema 001-037 and verify actual NestJS health`, `Boot the real Docker image against disconnected PostgreSQL`, `Verify HTTP liveness, DB readiness, version and anonymous auth`, `Write exact-image and isolation receipt`, and `Always remove both disposable containers`.

These are stronger than unit-only checks: a disposable PostgreSQL quote regression and real backend container HTTP health startup were covered. They **do not** establish authenticated quote-confirmation HTTP E2E, real Cloud Run deployment, or Floot full-app release parity.

## Backend implementation inspection
On `main` SHA `20951b4eb991440083a61c611771f7828e440944`, `apps/backend/src/orders/order.repository.ts` uses a conditional `UPDATE fulfillment_orders` whose WHERE matches the expected quote timestamp rounded to milliseconds, total, and currency; `order.service.ts` also enforces customer authority and optionally requires reviewed quote via `ORDER_CONFIRMATION_REQUIRE_REVIEWED_QUOTE=true`. Floot sends `expectedQuote` but its live serving backend version/configuration is not independently accepted.

## Next action and safety
Keep PR #398 draft, no Production publish. Reuse the established disposable schema-037 container harness to execute signed authenticated HTTP order setup and stale-quote collision with persisted-state assertions, then validate merchant/courier lifecycle and Floot source/release compatibility. No Google Cloud LAB SQL restart or resources were changed by this receipt. New documentation commit needs its own current-head CI observation before claiming all checks pass.
