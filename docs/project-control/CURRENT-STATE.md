# Khedmah Digital — Current State

Updated: 2026-10-04. This is a dated evidence checkpoint, not permission to execute a Production operation.

## Authority and branch location
- Repository: `khedma-sy/khedmah-digital-v1`.
- Production project: `khedma-dl`; approved region: `europe-west1`.
- Last re-read protected main: `5a961be5035dce1197ba2d0c65519e86f65ca4c6` (merged PR #248).
- These control documents are on `chore/project-control-floot-readiness-2026-10-04`, Draft PR #249. They are NOT yet merged into main.
- Active fix: `fix/database-role-prep-state-probe-2026-10-04`, Draft PR #250.
- Re-read main, both PR heads, and their exact-SHA checks before acting. Never use a previous SHA's green checks to certify a newer head.

## Mobile-only operating mode — active
The owner is following from a phone and cannot execute Cloud Shell commands.
- No Cloud Shell request is due now.
- Do not dispatch PREPARE, HARDEN, migrations, Terraform APPLY, Production deployment, password rotation, IAM/secret changes, or DNS changes while this hold is active.
- Continue bounded repository review, code fixes, isolated tests, and documentation on the existing PR branches.
- The owner saying they are back at a computer permits resuming read-only checks; it is not blanket approval for Production mutations.
- Any later Cloud Shell work must be revalidated against live state and given one short command at a time.

## Production database state — not yet cut over
Last known Production role workflow: run `37183178537`, requested mode PREPARE on `5a961be...`.
- Identity guard and image build succeeded.
- Failed at `Classify resumable prepare role state`.
- Password rotation, role PREPARE/cutover, restart/containment, final credential rotation, isolation verification, and active-alias commit were skipped.
- This failure was before database/secret cutover, NOT before all cloud activity: the bootstrap image was built.
- Do not rerun this failed Production workflow as a retry shortcut.

## Completed read-only owner observation
The owner already ran the Cloud SQL user-list query. Do not ask for the same table again as though it were missing.

| User | Type | Displayed databaseRoles |
| --- | --- | --- |
| khedmah_app | BUILT_IN | blank |
| khedmah_migrator | BUILT_IN | blank |
| postgres | BUILT_IN | blank |

Blank Admin API metadata does not prove PostgreSQL membership or absence of privileges. Actual Production PostgreSQL memberships remain unverified in this session. PR #250 introduces a database-read-only membership probe; deploying/executing its Cloud Run job would still be cloud activity and remains held.

## PR #250 — current exact head
Head: `d053350c095877e5c693acd7cc9f512be763577a`.

Previous head `2311bdca6fcc0b368104475263e588fd121e22f2` passed Node.js CI, Test & Verify, and PR Preview. The Preview report recorded mobile interactions 32/32. That evidence belongs to the previous head only.

A subsequent review found a reproducible shell-control bug: `read_role_state` enabled `errexit` inside a helper invoked with errors temporarily allowed. A stale credential then terminated Bash on return 20 before the selector loop could try an enabled numeric version.

The current head:
- captures the execution exit code using an `if` without changing the helper caller's shell mode;
- adds `tests/production-role-state-runner.test.mjs` with nine isolated tests;
- preserves the SQL membership classifier, identity allowlist, Production confirmations, and existing cutover guards;
- was committed and pushed as one atomic change to the existing PR branch, not main.

Local targeted evidence: 5 passed / 4 failed before the fix; 9 passed / 0 failed after the fix. These are mocked Bash-runner tests, not a live Google/Cloud SQL validation or the full CI matrix.

CI runs dispatched for the current head (last observed in progress):
- Node.js CI: `37193917916`.
- Khedmah - Test & Verify: `37193917877`.
- PR Preview: `37193917959`.

## Other PRs
- #249: control/Google/Floot documentation. Head `9af4fda1c770d07c262817da3a3e6656f819c8f1` previously passed all three workflows. This checkpoint update creates a newer documentation head, so recheck its CI.
- #247: closed as superseded by #248; not merged.
- #172: closed after requirements salvage; old code/migration must not be merged wholesale. Retained requirements: `docs/floot-migration/INTELLIGENCE-CONTROL-SALVAGE.md`.

## Earlier infrastructure evidence — revalidate when needed
- Handoff recorded successful Terraform bootstrap, post-apply verification, and a no-change plan. Do not repeat bootstrap APPLY.
- Handoff recorded PITR enabled and a successful on-demand backup. This is not proof of a fresh backup or a tested restore today.
- INVENTORY run `37179237640` succeeded. Previously approved system-role manifest: `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`.
- Latest execution-specific manifest comparison, Secret Manager IAM, current alias/version metadata, recovery evidence, and actual schema prerequisites must be checked before any cutover.
- Do not assume baseline 001–020 or migrations 021–024 are complete merely because the later workflow is named 025–034.

## Product and migration boundaries
- Keep GitHub/GCP backend, database, identities, and infrastructure; Floot is the proposed experience-layer migration, not a certified completed integration.
- No Floot migration or custom-domain cutover was executed in this work session.
- Taxi trips and electronic payments remain behind their existing approval/readiness gates.
- The approved visual identity is existing input, not a request for a redesign.

## Progress reporting
Carry forward the owner's last planning indicator: `10 / 160` estimated work units expressed as hours. This is not measured elapsed labor, and 6.25% is not a verified percentage of the whole product. Do not increment it merely for waiting, chatting, or rerunning CI. Report exact completed gates/tests alongside it.

## One next action
See [NEXT-ACTION.md](NEXT-ACTION.md). There is no owner command pending now. Further Production work is blocked by the mobile hold and explicit readiness gates.
