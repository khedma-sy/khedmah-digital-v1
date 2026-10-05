# PREPARE role-state runner review — 2026-10-04

## Reviewed inputs
- Repository: `khedma-sy/khedmah-digital-v1`.
- PR #250 pre-fix head: `2311bdca6fcc0b368104475263e588fd121e22f2`.
- Workflow blob before this fix: `d6ada66064438e241137abff950763376462c8ae`.
- Reviewed step: `Classify resumable prepare role state`, lines 650–820 at the pre-fix head.
- Fix plus tests: `d053350c095877e5c693acd7cc9f512be763577a`.

## Finding
The selector loop temporarily disables errexit to capture a recoverable probe return code. The helper later enables errexit globally after `gcloud run jobs execute`. When it then returns 20 for an old credential, Bash exits before the caller records the return code and tries the next selector. The existing PostgreSQL membership tests did not execute this Bash failure path.

## Minimal fix
Use conditional command-substitution status capture inside `read_role_state`. Do not change the caller's errexit mode. The rest of the workflow, including all Production mutation steps and confirmations, is unchanged. A commit-diff read confirmed the workflow edit is limited to that status-capture block.

## Local test evidence
Environment: local isolated container, Node.js v22.16.0, Bash and jq. The tested workflow body was copied from the exact reviewed source range; it was not retrieved by a successful whole-repository clone. All gcloud commands were intercepted by an allowlisted mock and sleep was stubbed. No real cloud credentials, live database, or network requests were used.

Nine tests were run before and after the minimal fix:
- Successful initial, resume, and completed states (three tests).
- Stale active credential falls back to numeric version.
- Invalid memberships stop without trying another credential.
- Exhausted credentials cannot publish successful outputs.
- Failed job deployment cannot execute a stale job.
- A failed execution's success-looking marker cannot certify that execution.
- Unexpected users stop before deploying a probe.

Before fix: 5 PASS, 4 FAIL.
After fix: 9 PASS, 0 FAIL; repeated successfully.
Test file Git blob hash: `eb722e5734868b602e80017bf62a7487571bf0ca`.

These local results do not certify the full test suite, Google IAM, actual Cloud SQL roles, production recovery, or deployment readiness. CI must run on the new exact head. The previous head's green results cannot be reused as approval.

## Remaining boundary
No Production workflow was dispatched, no main merge was performed, and no database, password, Secret Manager, Terraform, DNS, or Floot configuration was changed in this work session. PR-triggered CI/Preview runs independently after the branch push and must be distinguished from Production deployment.

## Subsequent resolution — 2026-10-05

The sections above describe the historical 2026-10-04 review, not the current branch state. PR #250 subsequently merged at final head `308bc00c880ce5cbc1ff7dcb04c657ae426b3f19` into main `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`. The later P2 expected-membership sorting fix and custom-name regression are included, and that thread is resolved. Exact-head and merged-main evidence is in [CURRENT-STATE.md](CURRENT-STATE.md). The older COMMENT review is not a final-head independent approval. Current cloud gates remain open; the next action is [read-only reconciliation](NEXT-ACTION.md).
