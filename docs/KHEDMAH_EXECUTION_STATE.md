# Khedmah Execution State

Last updated: 2026-09-12
Repository: `khedma-sy/khedmah-digital-v1`

## Purpose

This file is the durable execution handoff for Khedmah Digital. It is intended to survive chat/session changes and prevent repeated, destructive, or contradictory work. Before any infrastructure, deployment, migration, dependency, or production action, reconcile the current repository state with this file and update it when a verified milestone changes.

## Canonical repository identity

- Repository: `khedma-sy/khedmah-digital-v1`
- Default branch: `main`
- Current verified `main` commit at this handoff: `3bcdef2b01cfaae5a82db152a12b86918eb4adcc`
- `main` commit message: `Merge PR #169: security dependency remediation`
- Current verified `develop` commit at this handoff: `e21b35e0e4c261428ce175f2e4b31e1023cb4e1c`
- The `develop` branch is materially diverged from `main`; do not force-reset, fast-forward, or merge it blindly.

## Cloud project identities

These identities are already established for the project and must not be interchanged:

- Staging Google Cloud / Firebase project: `khedmah-digital-staging-503812`
- Preview Google Cloud / Firebase project: `khedmah-preview-774201339973`
- Production Google Cloud / Firebase project: `project-94512a0e-1a5e-4bdb-87f`

Cloud Shell can reopen with the wrong default project. Before every critical Cloud command, explicitly set and verify the intended project.

Example for staging:

```bash
gcloud config set project khedmah-digital-staging-503812
gcloud config get-value project
```

## Security remediation completed

Security remediation was performed on branch `fix/security-deps-2026-09-12` and merged through PR #169.

Security branch commit:

`f77df34b8564c5ae9576d25cdf6b53ee4a4afa5f`

Verified runtime dependency set included:

- Next.js `15.5.25`
- Sharp `0.35.4`
- Multer `2.3.0`
- Qs `6.16.0`
- Nest common/core/platform-express `11.2.3` on the remediation branch

The narrow remediation changed only:

- `package.json`
- `package-lock.json`
- `apps/backend/package.json`
- `apps/frontend/package.json`

Do not re-run broad dependency upgrades or `npm audit fix` without a new, specific security reason and a new controlled branch.

## Verified QA evidence

The narrow security patch passed the full local disposable-database QA suite before merge:

- Root tests: `639/639` passed
- Backend tests: `96/96` passed
- Frontend tests: `60/60` passed
- `npm audit --omit=dev --audit-level=high`: `0 vulnerabilities`
- Production build: passed
- `git diff --check`: passed

The destructive database tests were executed only against a disposable local PostgreSQL 16 container using an approved `_ci` database name. No Cloud SQL database was used for those destructive tests.

PR #169 subsequently passed its GitHub CI and isolated PR Preview gates before merge. Post-merge CI on `main` also completed successfully.

## Hard safety guardrails

Until a later verified execution-state update explicitly changes these rules:

- Do not run destructive database tests against staging, Cloud SQL, development, or production databases.
- Destructive tests may run only against a disposable local/container database whose name satisfies the repository guard (`*_ci` or `*_test`).
- Do not run `terraform apply` without explicit production/infrastructure authorization and a reviewed plan.
- Do not run production migrations without an approved migration plan and rollback evidence.
- Do not invoke the production operator casually from Cloud Shell.
- Do not deploy directly to production from an ad-hoc command.
- Do not use `npm audit fix` as a generic remediation step.
- Do not approve blocked install scripts (`npm install-scripts approve`) unless each script is reviewed and required.
- Do not rewrite `develop` history or overwrite it with `main`; it contains substantial independent work.

## Staging status — important correction

The user states that the staging infrastructure and required resources were already provisioned and configured before this handoff.

A read-only inventory run on 2026-09-12 returned empty lists for Cloud SQL, Artifact Registry, buckets, Workload Identity Federation, Secret Manager entries, and Cloud Run services. That inventory suppressed command errors with `2>/dev/null`, so an empty result is **not evidence that the resources do not exist**. Possible causes include permissions, disabled APIs, region/location mismatch, or command visibility differences.

Therefore:

**Do not recreate staging infrastructure, service accounts, WIF, Cloud SQL, buckets, secrets, Artifact Registry, or Cloud Run services merely because that inventory was empty.**

The next infrastructure step must be a non-destructive verification that preserves and reports errors instead of suppressing them, and must search the relevant locations/projects before any create/update action.

## Staging deployment workflow status

Repository workflow: `.github/workflows/staging-deployment.yml`

The staging path is tied to the repository's `develop` workflow and uses GitHub Environment `staging` variables/secrets. A prior run reached the quality gates successfully but did not proceed through deployment because the required environment values were not visible to that workflow run.

Do not conclude that GitHub Environment values or Google resources are absent until checked with an error-visible verification path.

## Preview status

The isolated PR Preview path for PR #169 successfully completed deployment and review checks, then its cleanup workflow succeeded after merge. Preview resources created for that PR are not a substitute for staging resources.

## Current branch relationship warning

At this handoff:

- `main` contains the merged security remediation.
- `develop` contains substantial independent work and is not a simple staging mirror of `main`.
- Security-relevant locked versions already observed on `develop` included Next `15.5.25`, Sharp `0.35.4`, Multer `2.3.0`, and Qs `6.16.0`.
- Do not cherry-pick or merge the security PR into `develop` blindly. First compare exact package manifests/lockfile and only transfer any missing security change if needed.

## Production status

No production deployment was executed as part of the 2026-09-12 security remediation sequence.

No production migration was executed.

No Terraform apply was executed.

Production remains a separate gated step after staging is verified live.

## Required execution order from here

1. Verify the local repository identity and remote before any write action.
2. Verify staging resources with error output visible; do not suppress `gcloud` errors.
3. Reconcile the GitHub `staging` environment with the already-provisioned Google Cloud resources without recreating resources.
4. Verify the exact `develop` state and compare it with the staging workflow requirements.
5. Run the official staging deployment path only after the environment/resource mapping is proven.
6. Perform live staging health checks and functional smoke tests.
7. Perform page-by-page visual and workflow inspection for the launch-critical Khedmah journeys.
8. Fix only verified defects on controlled branches/PRs.
9. Re-run full QA and security gates.
10. Produce a production-readiness report.
11. Only then authorize production deployment/migrations through the controlled production path.

## Launch-critical Khedmah scope

The project must preserve the established Khedmah product direction while finishing production readiness. Primary launch journeys include:

- Food / restaurants and sweets
- Delivery courier
- Taxi

Other established platform areas include Ads, Store, Categories, Discover, Near Me, On the Road, business/provider profiles, discounts/promotions, pharmacy delivery, home repair, sharing, ratings, and smart-admin operations.

Do not introduce unrelated product scope during stabilization unless a verified production blocker requires it.

## Brand/product invariants to preserve during stabilization

- Brand: `خدمة` / Khedmah
- Core symbol: umbrella
- Primary identity: dark blue with green and orange supporting colors
- Arabic RTL is core to the product
- Gold identity was an experiment and is not the global brand
- Do not reintroduce the cancelled SHEIN integration
- Trial copy preference: `فترة تجريبية`

These product constraints are not permission to redesign during release hardening. Stabilization should preserve approved UX unless a defect requires a targeted change.

## Session handoff rule

At the beginning of any new ChatGPT/agent session, read this file first and verify the repository/project identities before executing changes. When a major verified milestone changes, update this file through a controlled branch/PR so the next session can resume from repository evidence instead of reconstructed chat history.
