# KDOS SEQ-01 — CI Destructive DB Test Gate Closure — 2026-08-14

## Executive summary

The reported root cause is **confirmed**. Current `main`/PR-base Cloud Build starts an isolated PostgreSQL 16 database named `khedmah_test` and supplies its `DATABASE_URL` to the Node test container, but does not supply the one required explicit opt-in, `ALLOW_DESTRUCTIVE_DB_TESTS=true`. The fail-closed test pool therefore raises `DESTRUCTIVE_DB_TESTS_DISABLED` before database-backed tests can run.

PR #83 is a safe, single-file, two-line correction: it adds the opt-in only to the disposable Node test container in `cloudbuild.production.yaml`. It does not weaken the guard, change runtime Cloud Run environment, touch Production Cloud SQL, migrations, product code, Docker PORT, timeouts, or secrets.

All acceptance tests pass locally, including 61 PostgreSQL-backed backend tests against `khedmah_test`. PR #83 could not be merged because this environment has read-only public GitHub access and no authenticated GitHub CLI/API credentials. No PR checks or Cloud Build run were published for its head SHA. The gate is therefore **PARTIAL / merge-blocked by repository write authority**, not by source correctness.

## Repository and GitHub identity

| Item | Evidence |
|---|---|
| Repository path | `/workspace/khedmah-digital-v1` |
| Audit starting local HEAD | `ca3f755906f79488b136967aa6a17704a7809ebc` |
| Current local HEAD after reproducing PR change | `ab0b48f` |
| Public `main` HEAD | `f17144e9e30996f708d42bf92766eab85097a41d` |
| Open PRs | PR #83 only |
| PR #83 | `fix(ci): align Cloud Build with destructive DB test safety` |
| Base | `main` @ `f17144e9e30996f708d42bf92766eab85097a41d` |
| Head | `kdos/fix-cloudbuild-destructive-test-opt-in` @ `a664f64a784e65e75da28f16d16b46c4cf361293` |
| GitHub mergeability | mergeable, clean |
| PR shape | 1 commit, 1 file, +2/-0 |

The PR commit was fetched and cherry-picked locally solely to execute the exact proposed configuration. This did not push, merge GitHub `main`, or alter Production.

## Root-cause autopsy

1. `test-pool.ts` checks `process.env.ALLOW_DESTRUCTIVE_DB_TESTS !== 'true'` and throws `DESTRUCTIVE_DB_TESTS_DISABLED`.
2. The original Cloud Build `test-run` starts `postgres:16-alpine` with database/user `khedmah_test` on the `cloudbuild` network.
3. It waits with `pg_isready` for that exact host/user/database.
4. It starts a separate `node:20` test container, mounts `/workspace`, and passes `DATABASE_URL=.../khedmah_test`.
5. Before PR #83, that container did **not** receive `ALLOW_DESTRUCTIVE_DB_TESTS=true`.
6. Therefore the failure occurs at the explicit opt-in gate, before the approved disposable target can be used.

**ROOT CAUSE CONFIRMED = YES.** This is not a database-name, PORT, timeout, migration, Production database, or application runtime defect.

## Safety-contract autopsy

| Control | Current contract | Result |
|---|---|---|
| Explicit opt-in | exact string `ALLOW_DESTRUCTIVE_DB_TESTS=true` | PASS; only intended opt-in |
| Accepted names | lowercase/alphanumeric/underscore ending `_test` or `_ci` | PASS |
| `khedmah_test` | matches `_test` rule | PASS |
| Deny list | `postgres`, `template0`, `template1`, `khedmah`, `khedmah_dev`, `khedmah_prod`, `production` | PASS |
| URL handling | extracts decoded database pathname from `DATABASE_URL` | PASS |
| Server-side verification | `SELECT current_database()` then repeats safe-name assertion | PASS |
| Schema reset | `DROP SCHEMA public CASCADE; CREATE SCHEMA public` only after verification | PASS |
| Migration application | applies governed forwards 001–016 in order | PASS |
| Missing opt-in | fail closed with `DESTRUCTIVE_DB_TESTS_DISABLED` | PASS |
| Unsafe name | fail closed with `UNSAFE_DESTRUCTIVE_DATABASE_TARGET` | PASS |
| Defaults | destructive mode is disabled | PASS |

No guard code was changed by PR #83 or this gate.

## Cloud Build `test-run` autopsy

| Element | Current/PR behavior |
|---|---|
| PostgreSQL image | `postgres:16-alpine` |
| Container | `pg-test`, `--rm -d` |
| Network | `cloudbuild` |
| DB/user/password | ephemeral `khedmah_test` values |
| Readiness | `pg_isready`, maximum 30 attempts |
| Test image | separate `node:20` container |
| Workspace | `/workspace` bind mount, workdir `/workspace` |
| Database transport | test-only `DATABASE_URL` referencing `pg-test` |
| Test command | `npm ci && npm run test:workspaces` |
| Opt-in on main/base | NO |
| Opt-in in PR #83 | YES: `-e ALLOW_DESTRUCTIVE_DB_TESTS=true` |

## PR #83 diff and verdict

Exact semantic change:

```diff
+# Explicitly opt in to destructive resets for this disposable *_test database only.
 ...
+-e ALLOW_DESTRUCTIVE_DB_TESTS=true \
```

| Scope check | Result |
|---|---|
| Only `cloudbuild.production.yaml` | YES |
| Test-container opt-in only | YES |
| Production runtime env untouched | YES |
| Cloud Run `DATABASE_URL` secret untouched | YES |
| Production Cloud SQL instance untouched | YES |
| Migrations untouched | YES |
| Product code untouched | YES |
| Safety guard untouched | YES |
| PORT/timeout untouched | YES |

**PR #83 VERDICT = SAFE.**

## Environment exposure analysis

The `-e` argument is scoped to one ephemeral `docker run --rm` Node test container. It is not a Cloud Build global environment variable, substitution, secret, image build argument, image layer, Cloud Run `--set-env-vars`, frontend variable, or PostgreSQL container variable. It is absent from backend/frontend image build steps and deploy steps. It cannot propagate to Production Cloud Run, Cloud SQL, frontend, secrets, or GitHub workflows through this YAML path. The only shared item is a read-only source mount from the build workspace; environment variables are process/container scoped.

**PROPAGATION RISK = no source path identified.**

## CI consistency matrix

| File | PostgreSQL test DB | Destructive bootstrap | Explicit opt-in | Safe name | Consistent |
|---|---|---|---|---|---|
| `cloudbuild.production.yaml` base/main | yes | yes | **no** | `khedmah_test` | NO; root cause |
| `cloudbuild.production.yaml` PR #83 | yes | yes | yes | `khedmah_test` | YES |
| `.github/workflows/node.js.yml` | yes | yes | yes | `khedmah_ci` | YES |
| `.github/workflows/test-and-verify.yml` | yes | yes | yes | `khedmah_ci` | YES |
| `.github/workflows/preview-deployment.yml` | yes | yes | yes | `khedmah_ci` | YES |
| `.github/workflows/database-migration-check.yml` | no live PostgreSQL test DB | static migration governance | n/a | n/a | YES for its scope |

No unrelated workflow cleanup was performed.

## Test and build evidence

| Command | Result |
|---|---|
| `DATABASE_URL=postgresql://.../khedmah_test ALLOW_DESTRUCTIVE_DB_TESTS=true npm --workspace apps/backend test` | PASS: 61 tests, 61 passed, 0 failed, 0 skipped |
| `npm run test:root` | PASS: 473 tests, 473 passed, 0 failed, 0 skipped |
| `npm --workspace apps/frontend test` | PASS: 44 tests, 44 passed, 0 failed, 0 skipped |
| `npm --workspace apps/backend run build` | PASS (`tsc -p tsconfig.json`) |
| `npm --workspace apps/frontend run build` | PASS (43 static/dynamic routes generated) |
| `npm audit` | PASS: 0 vulnerabilities |
| `git diff --check` | PASS |

The backend test used a locally isolated database named `khedmah_test`; no Production database address or credential was used.

## PR CI / Cloud Build observation

The public Actions API returned no workflow runs for PR head `a664f64...`. This PR does not demonstrate that the production Cloud Build trigger ran automatically. This mission did not manually invoke the production Cloud Build path because it includes image push and Cloud Run deploy steps. Consequently **Cloud Build PASS is not claimed**.

## Security assessment and risks

- The fix preserves fail-closed defaults and narrows opt-in to a disposable target.
- The test password is ephemeral and grants no Production access.
- Production `DATABASE_URL` remains a Secret Manager binding in the deploy step and is not exposed to tests.
- Remaining operational risk: PR #83 is still open; public `main` still lacks the opt-in.
- Separate known risk: Production Cloud SQL schema incompatibility remains untouched and must not be confused with this test gate.
- Clean 001–016 rollback/re-forward proof remains a separate next mission.

## What changed / did not change

**Changed in PR/local verification:** one test-only environment argument and explanatory comment in `cloudbuild.production.yaml`.

**Not changed:** test-pool guard; database naming rules; deny list; `current_database()` verification; schema reset; migrations; product/backend/frontend code; Dockerfiles; PORT; Cloud Run timeout; Production Cloud SQL; Production secret; designs; browser tests.

## Acceptance-gate matrix

| Gate | Result |
|---|---|
| A root cause confirmed | PASS |
| B `khedmah_test` accepted/disposable | PASS |
| C opt-in only in test context | PASS |
| D guard unchanged/fail-closed | PASS |
| E Production DB config unchanged | PASS |
| F migrations unchanged | PASS |
| G product code unchanged | PASS |
| H backend PostgreSQL tests | PASS |
| I root tests | PASS |
| J frontend tests | PASS |
| K backend build | PASS |
| L frontend build | PASS |
| M npm audit | PASS |
| N diff check | PASS |

All technical acceptance gates pass.

## Merge decision and post-merge verification

**Decision:** recommend normal merge of PR #83. **Actual status:** not merged because this environment lacks authenticated repository write/merge authority. No force push or history rewrite was attempted.

- Merge SHA: not available.
- `main` updated: NO.
- Branch difference exhausted: NO; the two-line diff remains open.
- Post-merge verification: NOT APPLICABLE.
- Cloud Build status after merge: NOT TRIGGERED / NOT OBSERVED.

## Separated platform statuses

| Status | Result |
|---|---|
| PostgreSQL test runtime | PASS |
| Clean 001–016 forward/verify/rollback/re-forward | NOT RUN as a dedicated gate |
| Production Cloud SQL | UNCHANGED; previous incompatibility remains separate |
| Cloud Run backend | UNCHANGED / not tested in this mission |
| Cloud Run frontend | UNCHANGED / not tested in this mission |

## Scores

| Area | Score | Explanation |
|---|---:|---|
| Root-cause confidence | 100 | guard and missing env trace exactly match symptom |
| CI configuration correctness | 95 | proposed scope is exact; real Cloud Build not observed |
| Database test safety | 100 | opt-in, suffix, deny list and live DB verification preserved |
| Security isolation | 98 | container-only environment; no propagation path found |
| Regression confidence | 94 | all requested suites/builds/audit pass |
| Backend test confidence | 98 | 61/61 on disposable PostgreSQL; Cloud Build execution absent |
| Frontend regression confidence | 95 | 44/44 and production build pass; browser out of scope |
| Deployment readiness after gate | 35 | CI test defect fixed, but Production DB remains incompatible |
| Overall mission closure | 88 | technical closure complete; merge/Cloud Build evidence unavailable |

## Required status matrix

```text
SOURCE FIX = PASS
DESTRUCTIVE TEST GUARD = PASS
DISPOSABLE DB TARGET = PASS
BACKEND POSTGRESQL TESTS = PASS
ROOT TESTS = PASS
FRONTEND TESTS = PASS
BACKEND BUILD = PASS
FRONTEND BUILD = PASS
PR #83 = OPEN
MAIN UPDATED = NO
PRODUCTION DB TOUCHED = NO
MIGRATIONS TOUCHED = NO
PRODUCT CODE TOUCHED = NO
```

## Remaining blocker and next legal mission

The sole SEQ-01 closure blocker is merging PR #83 with authenticated repository authority and observing the resulting non-fabricated CI/Cloud Build outcome. Until then the next legal mission remains **FIX KDOS-SEQ-01 ONLY**. After merge and confirmation, it becomes **CLEAN POSTGRESQL 001→016 FORWARD / VERIFY / ROLLBACK / RE-FORWARD PROOF**. Neither task was started here.

MISSION =
KDOS-SEQ-01-CI-DESTRUCTIVE-DB-TEST-GATE

CURRENT HEAD =
ab0b48f

ROOT CAUSE =
CONFIRMED: CLOUD BUILD TEST CONTAINER OMITTED ALLOW_DESTRUCTIVE_DB_TESTS=true

PR_83 =
OPEN; SAFE; RECOMMENDED FOR NORMAL MERGE

PR_83_MERGED =
NO

MERGE_SHA =
NOT AVAILABLE

BACKEND_POSTGRESQL_TESTS =
PASS: 61 PASSED, 0 FAILED, 0 SKIPPED

ROOT_TESTS =
PASS: 473 PASSED, 0 FAILED, 0 SKIPPED

FRONTEND_TESTS =
PASS: 44 PASSED, 0 FAILED, 0 SKIPPED

BACKEND_BUILD =
PASS

FRONTEND_BUILD =
PASS

DESTRUCTIVE_DB_SAFETY =
PASS; FAIL-CLOSED GUARD UNCHANGED

PRODUCTION_DB_TOUCHED =
NO

MIGRATIONS_TOUCHED =
NO

PRODUCT_CODE_TOUCHED =
NO

MISSION_STATUS =
PARTIAL

NEXT_LEGAL_MISSION =
FIX KDOS-SEQ-01 ONLY: MERGE PR #83 AND OBSERVE ITS ACTUAL CI/CLOUD BUILD RESULT
