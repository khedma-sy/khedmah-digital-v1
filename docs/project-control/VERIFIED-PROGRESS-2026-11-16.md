# Khedma Digital — Verified progress checkpoint (2026-11-16)

**Status: documentation-only checkpoint on draft PR #398. NO-GO for database transition and full production rollout.**

## Baselines and retained assets

- GitHub protected `main` read at `20951b4eb991440083a61c611771f7828e440944`. PR #398 previously at `e367a59e9e376208455daa134a66a6a2dea989f8` before this documentation change. The five exact-head GitHub workflow runs passed: PR Preview, Node.js CI, Khedmah Test & Verify, disposable PostgreSQL session guard, disposable PostgreSQL connection fence.
- Live Floot project: `5e271f43-96a6-40de-a634-ec3eae023a49`, web release `17944528331124c03df28-23e1-4345-ad73-f248adfce602`, published `2026-11-12T03:07:07.733Z`. Domains `khedmah.uk` and `www.khedmah.uk` connected. No subsequent release verified.
- Floot editor: 160/160 helper spec files previously passed across eight explicitly enumerated batches; targeted eight specs passed again and TypeScript was clean. Anonymous read-only GET status parity confirmed on 26 routes between live and editor (23 HTTP 200 responses, 3 expected private HTTP 401 responses in each environment). These are **not** signed-in, role-based, mobile push, taxi, merchant or courier end-to-end acceptance.
- Latest verified Backend serving version was `preview-pr-274-f4f8ce2...`, not proven compatible with new atomic `expectedQuote` confirmation in Floot source. Do not republish entire Floot editor without resolving this gate. Publishing includes API handlers and scheduled work.
- Retained Backend candidate passed startup against an **independent disposable schema-037** database in GitHub Actions run `43767079511`, retained artifact `14182921183` until `2026-12-15T22:04:00Z`; not yet deployed to Cloud Run. Keep restored database and candidate image; do not repeat restore or build without independent necessity.

## Owner Cloud Shell: live isolated LAB read-only evidence

Project `khedmah-restore-lab-20261112`, instance `khedmah-restore-pg16-20261114`, private network `khedmah-restore-private`.

1. `gcloud sql instances describe`: exact instance `STOPPED`, `activationPolicy=NEVER`, one private IP `10.166.0.3`, no public IP in returned field.
2. `gcloud compute networks describe`: exactly one `ACTIVE` peering `servicenetworking-googleapis-com`. This only confirms the queried VPC configuration.
3. `gcloud compute instances list`: no VM records; `READ_ONLY_CHECK_COMPLETE`.
4. Pinned `scripts/inspect-recovery-lab-external-paths.py` at PR head `e367a59...` with `--explain-403`: `LAB_NCC_SERVICE=DISABLED`, `LAB_NCC_READ=UNKNOWN_HTTP_403_SERVICE_DISABLED`, `LAB_VPC_ACCESS_SERVICE=DISABLED`, `LAB_VPC_ACCESS_READ=UNKNOWN_HTTP_403_SERVICE_DISABLED`. `--quota-fallback` still returned `UNKNOWN_HTTP_403_SERVICE_DISABLED` for NCC spokes and VPC connectors, even using existing Cloud Shell quota project. The service-disabled reason is diagnosed; it is NOT evidence that these resources are empty.
5. Both inspector invocations explicitly returned `EXTERNAL_WRITERS_AND_DB_SESSION_FENCE_VERIFIED=False` and `READ_ONLY_NO_CLOUD_MUTATIONS=True`.

## Existing barrier and limitations

`scripts/deployment/lab-fenced-migration.sh` at pinned source commit `a4bf38d8e1ceffe5eb8fdcd7ce61d5e2f7cf3b3d` implements `ALTER DATABASE khedmah ALLOW_CONNECTIONS false` from a separate postgres admin connection, checks existing sessions, connection-start locks and subscriptions, and makes a best-effort restoring `ALLOW_CONNECTIONS true` attempt on exit. Disposable PostgreSQL tests passed, **not** live Cloud SQL acceptance. Process loss may leave connections disabled and requires audited recovery. External writers/other network routes remain independently unverified.

## Gates and next safe action

- **Do not run SQL 036/037 yet:** independent and durable isolation of all potential external writers and active sessions has not been established. Neither disabled service APIs nor a blank asset-inventory snapshot prove this.
- Exact owner consent for a conditional LAB-only restart is already recorded in PR #398. This does not waive isolation, current cost/time boundary, or production gates. Last documented 24-hour lab window expired and actual spend against USD 20 cap is unknown.
- First reconcile lab cost/authorized runtime boundary and establish external writer isolation, using read-only evidence and a recoverable fence; then perform the previously prepared single-attempt lab-only migration with postflight and verified stop. Subsequently test the retained Backend image inside the LAB and signed multi-role web/device acceptance, including restaurant order alerts and taxi flow, before considering full Floot publish.
- Smart Admin writes and driver uploads remain fail-closed until separate signed gates. No production Cloud Run, Cloud SQL, Floot publish, or migration mutation was authorized or performed as part of this checkpoint.

## Existing review receipts

PR #398 reviews `5924079228` (403 service-disabled), `5924901723` (stopped private database/network/VM evidence), plus earlier bounded reviews. Floot editor checkpoint `4f064c02-7701-4d77-946e-104a44e96003` and document `static/__dev/reports/KHEDMA-FULL-SITE-AUDIT-2026-11-16.md` preserve the latest website findings.
