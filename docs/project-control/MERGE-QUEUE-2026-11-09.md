# Khedmah Digital — Controlled Merge Queue and Independent Review Handoff

**Snapshot:** 2026-11-09. **Source reference:** protected `main=cc8d49809cb9543ee1620432d9c0ba73fb801cbb`. This is a dated, source-only release governance plan, **not** deployment authorization. Refresh main, PR heads, review decisions, status checks, and current project control documents before every merge.

## Why protected-main updates are stalled

- There are 15 OPEN PRs: #344, #346, #348–#359, #362. Eight are DRAFT: #344, #348, #349, #350, #351, #355, #359, #362.
- Exact-head source GitHub checks were SUCCESS for all 15 at audit; **0 independent APPROVED** and **0 requested reviewers**. All were `mergeable=true`; #344/#346 were `behind` and require reconciliation. A green build is neither a human approval nor a serving-release receipt.
- `.github/CODEOWNERS` assigns all areas to `@khedma-sy`, the PR author. An owner reviewing their own changes is NOT an independent approval. Do not manufacture approval or use an administrator bypass. Repo branch-protection detail is unavailable via this integration (HTTP 403), so its exact enforced rules remain unknown.
- Main `CURRENT-STATE.md` and `NEXT-ACTION.md` still begin with a 2026-11-02 historical checkpoint. Up-to-date Nov 9 content remains in unmerged #352.
- Floot editor, public Floot release (2026-11-04), GitHub branch heads, and Cloud Run Preview `f4f8ce2...` are **distinct artifacts**. No merge must be described as a deployment or runtime acceptance.

## Governing rules for each candidate

1. **Identify independent reviewer**: human with repository `write`/relevant review rights, distinct from commit author and any automation. For security-sensitive PRs require an independent backend/security reviewer; for UX require frontend/accessibility reviewer. A COMMENTED review does not count as APPROVED.
2. **Bind to immutable head**: record `main` SHA, PR head SHA, exact-head successful required checks, no unresolved review threads, mergeable status, source scope and dependency graph. If the PR head changes, restart these checks.
3. **Review by risk**: documentation/read-only source first; integrated frontend and restaurant-source candidates next; disabled/executor, auth/recovery, payments, taxi, push dispatch only after their explicit security/operational gates.
4. **Never double-merge overlapping branches**: #357 combines #349/#350/#351; #356 combines #353/#354/#355. Decide one canonical candidate per group and verify all original intended changes and regression tests are represented. After the integrated candidate is *actually* merged and verified on main, close originals as superseded with links; do not prematurely close or silently discard work.
5. **Separate merge from activation**: merge does not grant Cloud SQL migrations, writer fence, driver docs, taxi dispatch, Smart Admin, FCM/APNs push, payments, account deletion, Floot publication or Cloud Run changes. Keep features fail-closed. Respect production release gates and explicit owner authorization.
6. **Post-merge receipt**: require new protected-main SHA, checks on that exact SHA, review/commit links and change inventory, then update project-control docs; no claimed end-to-end readiness from source CI alone.

## Queue — intended safe review order, NOT automatic permission to merge

| Lane | Canonical PR | Source status at audit | Required hold points / action |
| --- | --- | --- | --- |
| A1 — accurate project control | #352 | Non-draft; source CI green; no APPROVED | Independent documentation/security review. If accepted, merge and re-read main. Do not treat old checkpoint text as live status. |
| A2 — read-only Cloud provenance | #358 | Non-draft; exact-head CI green; no APPROVED | Security/DevOps review of read-only WIF and no writer fence relaxation. Merge only tooling; dispatch/use separately approved. |
| A3 — providers aggregate diagnostic | #362 | DRAFT; exact-head CI green; no APPROVED | Reviewer validates SQL gate and approved role; optionally mark ready once reviewed. Never execute SQL from this merge; separate read-only owner gate and source-to-serving provenance required. |
| B1 — frontend integration | #357 (supersedes #349/#350/#351) | Non-draft; exact-head CI green; no APPROVED | Verify merged source equivalence; independent FE/UX/accessibility and role/session review. Test desktop/mobile. No Floot publish implied. |
| B2 — restaurant safety integration | #356 (supersedes #353/#354/#355) | Non-draft; exact-head CI green; no APPROVED | Review strict FCM token, atomic fingerprint rotation and merchant eligibility; no live token endpoint, outbox, worker, service worker or closed-app receipt. Keep dispatch disabled. |
| C1 — Android legal account links | #346 | Non-draft; exact-head CI green; BEHIND main; no APPROVED | Reconcile with current main, rerun exact checks, native browser Intent/device testing and review. Actual deletion mechanism & Play eligibility separate. |
| C2 — customer reviewed quote | #359 | DRAFT; exact-head CI green; no APPROVED | Block mandatory enforcement until legacy status-only caller cutover, compatible Floot/public backend version, 409/ownership and order E2E plus rollback proof. |
| C3 — Smart Admin policy executor | #348 | DRAFT; exact-head CI green; no APPROVED | Trusted service principal & independent content/risk evaluator absent; child writer isolation unproven. No admin approval execution. |
| C4 — Google login recovery | #344 | DRAFT; exact-head CI green; BEHIND main; no APPROVED | Recovery validator is not a restore. Requires Cloud Run/DB runtime credential, schema, traffic, scaling/writer safety, separate owner authorization. |

## P0 work not solved by merging any current PR

- **Nearby providers:** #361. Current public/Preview searches returned zero *eligible public* provider profiles for tested cities. The total number of registered/private/pending profiles is **unknown**. Floot editor contains separate unpublished fixes for public-intent registration and city-based professional/business discovery. Run #362 diagnostic only in an independently reviewed, authorized **read-only** Preview connection. Prove owner registration -> explicit public intent -> independent admin review -> public search under a second account.
- **Taxi online presence:** #360. No independently verified online/offline lease, fresh consent-gated geolocation, nearest eligible driver or atomic trip dispatch cycle. Business listings are not live availability. Keep `TAXI_TRIPS_ENABLED` OFF.
- **Restaurant/courier closed-app alerts:** #356 only covers source safety. Missing full authenticated enrollment, private token persistence, durable order outbox/worker, retries and real device delivery/ACK.
- **Admin/verification:** #348 is source-only planning. Business trust evidence upload and Smart Admin trusted execution are incomplete; do not bypass trust or autoapprove.
- **Cloud/DB/release:** previous writer quiescence gate STOPPED; current serving revision/image/traffic, SQL migration 030/033/036/037 classification, writer inventory, backup restore and rollback are unverified.
- **Cross-role and finance:** Google login/session, merchant/courier/customer flows, price consent, billing/cash settlement and permissions have no general authenticated runtime acceptance proof.

## Decision log

**NO-GO for production, Cloud SQL mutation, public Floot publish, feature activation and automatic merge.** Safe immediate owner action: add an actual independent human reviewer to GitHub and request review on #352, #358, #357 and #356; separately start security review of #362. Never use a bot COMMENTED review or repository-owner self-approval to bypass governance. Independently review the selected non-PR branches before considering any new PR; 405 git refs do not equal 405 unmerged features.
