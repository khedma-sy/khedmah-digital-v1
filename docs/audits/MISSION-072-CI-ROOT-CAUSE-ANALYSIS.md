# Mission-072 — CI Failure Root Cause Analysis

## Executive Summary

The reported failing check is `Khedmah – Test & Verify / Run Tests & Verification (22.x)`. Direct GitHub Actions logs were not accessible from this environment, so the hosted failure step and post-fix rerun cannot be marked canonically verified. The complete job sequence was nevertheless reproduced under Node.js `v22.23.1` and npm `10.9.8`.

Before the fix, clean installation, the sensitive-assignment scan, backend/frontend build, and all 476 tests passed. The next blocking command, `npm audit --omit=dev --audit-level=high`, exited `1` because Next.js 15.5.22 resolved PostCSS 8.4.31 and Sharp 0.34.5, which npm classified under three high-severity production dependency findings. The failure was therefore caused by the production dependency graph, not application code, tests, paths, workspaces, or Node 22.

The minimal fix keeps Next.js at 15.5.22 and pins only its affected transitive dependencies through root npm overrides: PostCSS 8.5.24 and Sharp 0.35.3. After a clean `npm ci`, the same Node 22 sequence passed build, 476 tests, and the blocking audit with zero vulnerabilities. Because a new GitHub Actions run is unavailable, restoration is verified locally but still pending canonical CI confirmation.

## Authority Assessment

### Executive Authority

Mission-072 authorizes immediate P0 diagnosis and a minimal fix without feature, architecture, API, database, production-runtime, or merge changes. It prohibits merging PR #24 during diagnosis.

### GitHub Authority

The approved GitHub repository and its Actions run are canonical for the check conclusion. The Council supplied the failing check identity, but this workspace had no configured remote or authenticated GitHub access. Public repository and Actions API requests for the historical repository identity returned HTTP 404, so the failing log, workflow SHA, and rerun conclusion were not observable.

### Repository Authority

The checked-out workflow at `.github/workflows/test-and-verify.yml` defines the same job name but currently lists Node `20.x`, while the Council-reported check suffix is `22.x`. This proves the local workflow copy cannot establish the canonical workflow revision. No workflow file was changed by Mission-072.

### Workspace Authority

The workspace directly verified Node 22 behavior, clean dependency resolution, the ordered CI-equivalent commands, exit codes, build output, tests, audit results, and the minimal manifest/lockfile delta. These results are **Verified Locally** only.

### Evidence Scope

Evidence comprises local commit `8f23292` before the fix; Node.js `v22.23.1`; npm `10.9.8`; the checked-out workflow and package manifests; clean `npm ci`; build and test output; npm audit advisory output; dependency trees from `npm ls`; and the post-fix package-lock resolution.

### Verification Limits

The exact hosted failure log and a post-fix GitHub Actions rerun were unavailable. Lack of remote access is not treated as a CI defect. The root-cause attribution is a strong local reproduction because the exact blocking audit command failed after all preceding build/test stages passed, then passed after only the implicated dependency versions changed. Canonical CI restoration remains pending.

## Failure Timeline

| Sequence | Evidence | Outcome |
|---:|---|---|
| 1 | Council reports one remaining `Run Tests & Verification (22.x)` failure | Hosted failure identified; log unavailable |
| 2 | Local workflow and repository metadata inspected | Job contains install, build, tests, and blocking high-severity production audit |
| 3 | Node `v22.23.1` and npm `10.9.8` installed | Matches reported Node major |
| 4 | Pre-fix `npm ci` | PASS; three high findings reported non-blockingly by install summary |
| 5 | Sensitive-assignment scanner | PASS |
| 6 | Pre-fix `npm run build` | PASS; backend TypeScript and Next.js production build |
| 7 | Pre-fix `npm run test:all` | PASS; 449 root + 21 backend + 6 frontend |
| 8 | Pre-fix `npm audit --omit=dev --audit-level=high` | FAIL, exit `1`; three high production findings |
| 9 | `npm ls next postcss sharp` | Next 15.5.22 → PostCSS 8.4.31 and Sharp 0.34.5 |
| 10 | Minimal transitive overrides and lock refresh | PostCSS 8.5.24 and Sharp 0.35.3 only |
| 11 | Post-fix clean Node 22 CI-equivalent sequence | PASS through install, scan, build, tests, and audit |
| 12 | GitHub Actions rerun | Remote verification unavailable |

## Root Cause

### What failed?

The blocking production security audit returned a nonzero exit. npm reported three high-severity findings:

- PostCSS `<=8.5.17`: three advisories covering unsafe CSS stringification and source-map file/path disclosure.
- Sharp `<0.35.0`: inherited libvips vulnerabilities grouped by npm into the Sharp finding.

The job stops because `npm audit --omit=dev --audit-level=high` is intentionally blocking and npm returns exit `1` at or above the configured severity.

### Where did it fail?

It failed after install, build, and all tests in the `Run Tests & Verification` job's production security-audit stage. The later advisory audit is non-blocking, but it is never relevant if the earlier blocking audit already terminates the job.

### Why did it fail?

`apps/frontend` depends on Next.js 15.5.22. The locked Next dependency subtree resolved PostCSS 8.4.31 and Sharp 0.34.5. Both versions fall inside npm's current high-severity advisory ranges. A clean install reproduced the same dependency tree and audit failure, ruling out a dirty `node_modules` state.

### Cause elimination

| Candidate | Finding | Decision |
|---|---|---|
| Application code | Build and runtime-oriented tests passed | Not root cause |
| Tests | 476/476 passed before the failing audit | Not root cause |
| GitHub Actions engine | The audit command behaves identically outside Actions | Not root cause; hosted rerun still pending |
| Node 22 | Install, build, and tests passed on 22.23.1 | Not root cause |
| Dependencies | Locked PostCSS/Sharp versions match vulnerable ranges | **Root cause** |
| npm | Correctly returned nonzero for the configured threshold | Trigger/enforcer, not defect |
| Paths | All workspaces and test globs resolved | Not root cause |
| Workspace orchestration | Root, backend, and frontend targets all completed | Not root cause |
| Configuration | Blocking `audit-level=high` enforces intended security policy | Not a misconfiguration |

## Classification

**Primary classification: Dependency.** The deterministic failure originates in two transitive production packages within the locked Next.js dependency subtree.

It is not a Code Defect or Test Defect because source compilation and every test passed. It is not Infrastructure, Runtime, Environment, or CI Configuration because the same command fails locally under Node 22 using a clean install, and the configured audit threshold is operating as designed. It is not a False Failure: npm identifies real published high-severity advisories, even though exploitability through this application's current inputs was not established by this mission.

## Impact

| Area | Impact | Basis |
|---|---|---|
| Production | Potential security exposure; exploitability not proven | Both findings are in the production dependency graph |
| Runtime | No observed functional regression | build and runtime-oriented tests pass |
| CI | Direct blocking impact | audit exits `1` |
| Merge | Yes, if this check is required | a required failing status check prevents compliant merge |
| Release | Yes until security gate is green or explicitly waived | high-severity production dependencies violate the gate |
| End user | No demonstrated active impact; potential indirect exposure | no exploit test or affected user path was established |

The issue must not be minimized as “CI-only”: CI is exposing a dependency security condition. At the same time, the audit result alone does not prove that an end user was exploited or that production is currently reachable through the advisory paths.

## Minimal Fix

The applied change:

```json
"overrides": {
  "next": {
    "postcss": "8.5.24",
    "sharp": "0.35.3"
  }
}
```

This is smaller than a Next.js major upgrade and avoids `npm audit fix --force` selecting an unrelated breaking Next version. The lockfile was refreshed so clean CI installs resolve the fixed transitive versions reproducibly.

No application source, test, API, architecture document, database definition, migration, runtime configuration, workflow, or production infrastructure was changed. There was no refactor or feature addition.

## Validation Results

### Pre-fix reproduction — Node 22

| Check | Result |
|---|---|
| `npm ci` | PASS; dependency audit summary reported 3 high |
| sensitive-assignment scan | PASS |
| `npm run build` | PASS |
| `npm run test:all` | PASS — 476/476 |
| `npm audit --omit=dev --audit-level=high` | **FAIL — exit 1, 3 high** |

### Post-fix clean validation — Node 22

| Check | Result |
|---|---|
| `node --version` | `v22.23.1` |
| `npm --version` | `10.9.8` |
| `npm ci` | PASS — 0 vulnerabilities |
| sensitive-assignment scan | PASS |
| `npm run build` | PASS |
| `npm run test:all` | PASS — root 449, backend 21, frontend 6; total 476 |
| `npm audit --omit=dev --audit-level=high` | PASS — 0 vulnerabilities |
| resolved tree | Next 15.5.22; PostCSS 8.5.24; Sharp 0.35.3 |
| GitHub Actions rerun | **Canonical Repository Verification Pending** |
| Git status after generated-output restoration | only intended manifests, lockfile, and Mission-072 report changed |

## Risk Assessment

| Risk | Level | Treatment |
|---|---|---|
| PostCSS compatibility under Next 15.5.22 | Low–medium | production build and all frontend tests pass |
| Sharp 0.35 compatibility under Next 15.5.22 | Medium | production image dependency changed; build passes, but deployed image paths were not exercised |
| Future Next install behavior | Medium | lockfile pins the resolved tree; monitor upstream Next support |
| Hosted workflow differs from local workflow | Medium | Council reports 22.x while local YAML lists 20.x; inspect canonical workflow SHA |
| Canonical CI remains unobserved | High for closure evidence | rerun required check on the authoritative PR/commit |
| Advisory database changes later | Low operational, recurring | keep blocking audit and review lock updates deliberately |

## Recommendation

1. Push the minimal manifest and lockfile fix to the existing Mission-072/PR #24 change path without merging during diagnosis.
2. Rerun `Khedmah – Test & Verify / Run Tests & Verification (22.x)` on the authoritative GitHub commit.
3. Confirm in the hosted log that `npm ci`, build, 476 tests, and `npm audit --omit=dev --audit-level=high` all pass.
4. Record the Actions run URL, workflow SHA, job conclusion, and tested commit before merge approval.
5. Do not weaken or make the blocking audit advisory; it correctly detected the dependency condition.
6. If the hosted job still fails, compare its workflow revision and first failing step with this locally passing sequence before making any further change.

## Final Decision

The dependency root cause is reproduced and the minimal fix is fully validated under Node 22 locally. Canonical GitHub Actions evidence is still unavailable. Because the Council requires the final decision to be based on an actual Actions rerun, the check requires that further verification action before any restored status can be issued.

# CI REQUIRES FURTHER ACTION
