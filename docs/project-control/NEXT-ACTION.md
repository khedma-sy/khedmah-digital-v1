# Next Safe Action — Khedmah

Snapshot: 2026-10-06 after PR #261. Re-read live refs and run status before acting. This is an execution dependency, not Production mutation approval.

## Execute next — close repository integration gate, then run the consolidated read-only cloud audit

1. Treat protected `main` `7c58277ac04450f9eb5fb48c04c435d070443b56` and merged PRs #249–#261 as the source checkpoint.
2. Merge the synchronized repository-control/integration change only after its own Node, Test & Verify, Preview and review gates pass.
3. Enforce [FLOOT-GOOGLE-INTEGRATION-GATE.md](FLOOT-GOOGLE-INTEGRATION-GATE.md): GitHub remains source/release authority, Google Cloud owns backend/data/infra, Cloudflare owns DNS, and Floot is the accepted experience layer.
4. After repository closure, run the merged `scripts/audit-production-secret-iam-readonly.sh` from Cloud Shell to collect the 17-secret direct/effective IAM evidence set. Do not read secret payloads and do not mutate cloud resources.
5. Review any historical-principal drift and continuity before proposing a separate operation. Do not remove a binding merely to satisfy a validator.
6. Any IAM/Secret Manager/SQL/DNS/Terraform/deployment mutation requires operation-specific review and explicit owner authorization.
7. Continue Phase 1A database/recovery gates, Phase 1B schema, Phase 1C hardening/release, Phase 2 Google readiness, then Phase 3 Floot. Do not skip directly to Floot because repository CI is green.

## Why a workflow dispatch is not the next read-only command

- Every mode of `production-database-role-bootstrap.yml` builds an image; INVENTORY and VERIFY also deploy/execute Cloud Run jobs.
- PREPARE checks the requested digest's syntax early, but creates a transition secret and rotates the migrator password before the later prepare SQL compares the actual manifest.
- The role workflow does not automatically validate a fresh backup, PITR, tested restore or effective IAM. Runtime containment recovery is a separate mechanism.
- A successful old inventory, enabled secret version, merged PR or green CI does not close those independent gates.

## Repository work in parallel

- Preserve merged #252's accepted head `01f1a9e934b130fee613e8f65cb55743a615b333`, containing MC-04 `5b21217bc610a656850755e9084169e56217b563`, Multer `a7864998ae8d1e1a933b7a38c03910f7b8b3e048` and runner `767e6cb9b26c2f530f998f341bc7180a4d418b41`. Those source gates, prior main `e61d1142...`'s own Node/Test and #252 cleanup are complete. Source, local evidence and exact-head results are recorded in [CURRENT-STATE.md](CURRENT-STATE.md).
- Preserve the scope of #252's successful Preview and metadata/log-only artifact review. Its source gates do not close populated-journey, Production or Floot acceptance. Local evidence remains 41 selected MC-04 runner entries, 33 dependency compatibility/security entries and 80 targeted runner/assessment tests (including the ten new deadline cases), with appropriate builds/type checks; these counts describe separate scoped runs. The Production secret job remains dispatch-only.
- Preserve merged #253's exact head `eb5918a2b4ddc25d1d4580e2da82fba40b949ec6` and live-secret alignment `4a60f7e622dbbcf4d4a21c5e5e15c13fab297a8f`. Its own Node/Test/Google and complete Preview passed (2479 = 1712 root + 616 backend + 151 frontend, audit zero), and its Preview is retired. Prior main `82283464...` separately passed Node/Test with the same counts and zero audit findings. Preserve the 59-case local suite's limits and all inherited/effective-access gates.
- Preserve the reviewed [MC-04 two-handler 429 implementation](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md#mc-04-429-presentation-follow-up--2026-10-05) `08b116a84b713d646b70d20c46136ab1181e0775`, which merged through PR #254. Its local **20/20 = nine new + 11 existing** cases and frontend type checking passed before merge; current main `57af4a86...` has its own green push checks. Broader browser/session/SQL/Floot acceptance remains open, but #254 itself is no longer pending.
- Preserve MC-04's broader real recovery and MC-01 authority/SQL/browser gaps. Review the [conditional Floot transport proof](../floot-migration/AUTH-API-CONTRACT.md#candidate-b-compatibility-evidence) before adapter implementation; actual same-site nonproduction Safari/Chromium login, protected media, origin rejection and logout proof remains pending.
- MC-01 implementation `6648fc9f017ac449edc6603702b6ba279e7e8e54` is merged through #251. Its required source gates are complete; preserve the interrupted first Preview attempt and successful isolated retry. Do not reimplement it or use its retired Preview as the next handoff URL.
- The five-line shared-delete guard and 17 added HTTP cases have bounded local evidence: targeted 26/26, backend build green, and independent review without blockers. These do not inherit #249 Preview certification or establish live SQL/authentication/global-middleware/Floot acceptance.
- Preserve #249's completed checks as dated evidence: Preview recorded 64/64 and 72/72, mobile 32/32 and Classifieds 200/200/200 on an empty fixture; mail remained NOT READY, artifact bytes were not inspected, and the Preview has been cleaned up.
- Review [the implementation/acceptance backlog](../floot-migration/IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) and [media/Classifieds boundaries](../floot-migration/MEDIA-CLASSIFIEDS-CONTRACT.md). Recorded findings remain open until their policy, implementation and acceptance requirements are satisfied.
- Preserve the completed auth/profile/discovery/cart/fulfillment mappings. No silent change to pricing, disclosure, identity, role behavior, visual identity or scope is authorized by their documentation.

## Later dependency order

After current cloud reconciliation and the applicable authorization: fresh verified backup/recovery gate; protected role cutover; post-cutover isolation and inventory evidence; missing schema steps in [SCHEMA-RELEASE-GATES.md](SCHEMA-RELEASE-GATES.md); HARDEN; release readiness; approved deployment and acceptance.

This is not a queued batch of commands. Re-read source and operation-specific evidence each time. Do not generate confirmations with an old SHA. Do not copy Production credentials into Floot. Taxi trips and electronic payments retain their existing readiness gates.

## Validation scope

The earlier 2026-10-05 local check ran 18 workflow-contract cases and nine isolated Bash-runner cases against executable source from `a2a26f8...`: 27 passed, zero failed, Node.js v24.19.0; gcloud was mocked. MC-01 ran actual Nest HTTP tests with database, identity and storage doubles: nine Ad cases failed against the unguarded baseline (200 versus expected 403), eight controls passed, and the corrected targeted suite passed 26/26. Historical 12 decoder, 24 discovery/search, 24 cart and 52 lifecycle results retain their source/runtime limits. None certifies live GCP, Production SQL, actual cash collection or Floot browser compatibility. This session has performed zero Production mutations.
