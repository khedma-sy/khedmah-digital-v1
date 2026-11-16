# Khedma Digital — Evidence-backed execution protocol (2026-11-16)

## Owner directive
After **every completed milestone**, store its implementation and independent verification receipt in this repository before reporting it as done. A successful test or a review is not a deployed feature. Separate **implemented**, **tested**, **merged**, **deployed**, and **accepted in live E2E** status. This instruction applies to GitHub, Floot and the isolated Cloud SQL recovery lab; do not represent an unverified operation as completed.

## Required proof for each milestone
1. **Baseline**: latest `main` SHA, open PRs, exact-head GitHub Actions, `docs/project-control/CURRENT-STATE.md`, Floot published release ID if relevant.
2. **Change**: exact file paths, commit SHA and PR link. For Floot-only editor work, record editor version/checkpoint, tests, and whether it is actually published; do not claim an unpublished change is live.
3. **Acceptance**: commands/tests and their results with exact code/version/environment; owner Cloud Shell receipts must be clearly distinguished from direct automated tests. Cite artifacts and logs where available.
4. **Safety**: read/write scope; confirm whether Preview/Production or Cloud SQL were touched, database writer isolation, relevant cost/runtime authorization, rollback and remaining gates. Record fail-closed status, never invent a gate pass.
5. **Next action**: name one executable next step and its prerequisites. Preserve an explicit NO-GO when required evidence is missing.

## Current checkpoint
- Protected `main`: `20951b4eb991440083a61c611771f7828e440944`; existing PR #398 from `docs/owner-launch-priority-20261115` was draft at start of this document. Detailed proof: [Verified progress — 2026-11-16](VERIFIED-PROGRESS-2026-11-16.md).
- Last verified GitHub Actions for pre-protocol PR head `4d9f3948962ed8130f585cc417e9f771e0500b89`: five succeeded, including disposable PostgreSQL session and connection fencing. Any later commit requires its **own** check results.
- Latest owner read-only lab evidence: instance `khedmah-restore-pg16-20261114` STOPPED with `activationPolicy=NEVER` and private IP; one active Service Networking peering and no listed VMs; NCC and VPC Access requests returned `HTTP_403_SERVICE_DISABLED`, **not proof of resource absence**.
- Floot remains on last verified public release of 2026-11-12. Its current Editor source cannot be declared safe to publish without Backend compatibility and cross-role E2E, including quoted merchant order confirmation. Floot plan daily metered action limit prevented further editor inspection during this checkpoint.
- **NO-GO** for 036/037 Cloud SQL execution and full public Floot republish. External writer/session isolation, lab runtime cost boundary, current Backup/Restore, Backend contract, signed taxi/merchant/courier/admin/mobile tests remain open. Do not silently restart the lab, repeat database restoration or Backend build, or enable disabled sensitive approvals.

## Enforcement in future work
Record a new dated receipt or update this protocol in the same PR as each completed change, including the exact verification state. Commit success is a source receipt; passing workflows and merge/deployment have to be verified separately. Avoid audit-only loops by prioritizing concrete, tested fixes where tools and safety gates permit.
