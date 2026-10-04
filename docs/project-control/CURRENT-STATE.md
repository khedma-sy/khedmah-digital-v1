# Khedmah Digital — Current State

Updated: 2026-10-04. This is a dated evidence checkpoint, not permission to execute a Production operation.

## Authority and branch location
- Repository: `khedma-sy/khedmah-digital-v1`.
- Production project: `khedma-dl`; approved region: `europe-west1`.
- Last re-read protected main: `5a961be5035dce1197ba2d0c65519e86f65ca4c6` (merged PR #248).
- These control documents are on `chore/project-control-floot-readiness-2026-10-04`, PR #249. They are NOT yet merged into main.
- Active fix: `fix/database-role-prep-state-probe-2026-10-04`, PR #250.
- Re-read main, both PR heads, and their exact-SHA checks before acting. Never use a previous SHA's green checks to certify a newer head.

## Mobile-only operating mode — active
The owner is following from a phone and cannot execute Cloud Shell commands. Saying they are present in the conversation is not confirmation that they returned to a computer.
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

## PR #250 — current exact head and completed CI gate
Head: `d053350c095877e5c693acd7cc9f512be763577a`.

The current head captures the probe execution exit code without changing the caller's errexit mode and adds nine isolated Bash-runner regressions. Earlier local targeted evidence was 5 passed / 4 failed before the fix and 9 passed / 0 failed after it; these mocks are not live Google validation.

The current-head workflows have been re-read as SUCCESS, including the previously verified nine required contexts:
- Node.js CI `37193917916`: Source inventory (read-only), build (24.x).
- Test & Verify `37193917877`: Run Tests & Verification (24.x), PR Validation, Code Quality Checks.
- PR Preview `37193917959`: quality-gates, resolve-staging-baseline, deploy-preview, review-evidence.
- The head-bound Preview report records mobile interactions 32/32 and Classifieds acceptance success. Optional cleanup-preview was skipped, not a failed required check.

A bounded COMMENT review was submitted for this exact head (review ID `5405530080`). PR #250 was moved from Draft to Ready for Review on 2026-10-04. Its head was unchanged and it was NOT merged. This COMMENT is not an independent approval and is not Production authorization.

Previous head `2311bdca6fcc0b368104475263e588fd121e22f2` also had green results, but those are not used to certify the current head. The current evidence above is separately verified.

## PR #249 — source-backed control and integration preparation
This PR holds the execution plan, schema gates, Google/Floot boundaries and next action. Its documents are not on main yet. Any new documentation commit requires its own CI check; do not reuse an earlier documentation head's green results.

Completed repository-only preparation, pinned to main `5a961be...`:
- [Authentication transport contract](../floot-migration/AUTH-API-CONTRACT.md): eight current authentication endpoints, frontend-origin `/api/v1` rewrite, Firebase ID token to Khedmah cookie exchange, and cookie/origin requirements.
- [Errors, personal profile and Operations Product access](../floot-migration/ERROR-PROFILE-ACCESS-CONTRACT.md): shared error envelope/decoder, two personal-profile routes, six Operations Product routes, eight operational roles and their seven permission names.
- The second contract explicitly distinguishes pending change/rollback requests from executed infrastructure actions; configuration summaries from live cloud health; and in-process Operations Product queues from a proved durable approval system. It does not claim all audit storage is memory-only.
- Twelve targeted decoder cases passed locally against the exact source blob `1a29eecfbad616c567bf0278b6004a2b0ddea4da`, using Node.js v22.16.0 and no network/cloud/database. This is not a backend/RBAC/HTTP/Floot acceptance test.
- [Category and public discovery contract](../floot-migration/DISCOVERY-API-CONTRACT.md): database category authority, six public list/detail/search routes, unified query fields, distinct professional endpoint, independent collection pagination, capped map behavior, URL state and open validation-parity findings.
- Twenty-four pure frontend discovery/search helper tests passed locally on exact blobs `772e1bd5f4dc1133ba7efe60ab4fd8f2a33c1b57` and `0b87ad933ae827f614c453557fafb1a705c5968d`, with Node.js v22.16.0 and TypeScript 5.8.3 transpilation. This is not backend, database, React/browser or Floot acceptance.
- Floot routing/header compatibility, domain authorization, browser acceptance and any new credential requirement remain open; the documents do not claim an integration is live.

Pre-update documentation head `18d1408ff0b5a8741ef2d3aadfb55532f5bff426` has now passed all three workflows: Node.js CI `37196579216`, Test & Verify `37196579238`, PR Preview `37196579220`. The current grouped discovery documentation update creates a newer head and requires its own results. Let those checks finish rather than repeatedly committing status-only notes.

The full schema-lineage correction remains in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md). No executable repository file is changed by this documentation slice. The tested discovery helpers are preserved unchanged; documented backend/frontend parsing differences are not silently repaired or claimed closed.

## Other PRs
- #247: closed as superseded by #248; not merged.
- #172: closed after requirements salvage; old code/migration must not be merged wholesale. Retained requirements: `docs/floot-migration/INTELLIGENCE-CONTROL-SALVAGE.md`.

## Earlier infrastructure evidence — revalidate when needed
- Handoff recorded successful Terraform bootstrap, post-apply verification, and a no-change plan. Do not repeat bootstrap APPLY.
- Handoff recorded PITR enabled and a successful on-demand backup. This is not proof of a fresh backup or a tested restore today.
- INVENTORY run `37179237640` succeeded. Previously approved system-role manifest: `656ccf46a96a6ea32a3c0a9f3ea8ced8a266390b544d2cee6dbbb221a2e614cf`.
- Latest execution-specific manifest comparison, Secret Manager IAM, current alias/version metadata, recovery evidence, and actual schema prerequisites must be checked before any cutover.
- Do not assume baseline 001–020 or retained migrations 021/022/024 are complete because a later workflow is named 025–034. Follow SCHEMA-RELEASE-GATES.md, including the intentional 023 gap.

## Product and migration boundaries
- Keep GitHub/GCP backend, database, identities, and infrastructure; Floot is the proposed experience-layer migration, not a certified completed integration.
- No Floot migration or custom-domain cutover was executed in this work session.
- Taxi trips and electronic payments remain behind their existing approval/readiness gates.
- The approved visual identity is existing input, not a request for a redesign.

## Progress reporting
Carry forward the owner's last planning indicator: `10 / 160` estimated work units expressed as hours. This is not measured elapsed labor, and 6.25% is not a verified percentage of the whole product. Do not increment it merely for waiting, chatting, or rerunning CI. Report exact completed gates/tests alongside it.

## One next action
See [NEXT-ACTION.md](NEXT-ACTION.md). No owner command is pending now. Further Production work remains blocked by the mobile hold and explicit readiness gates. Review-ready PR status is separate from merge/deployment permission.
