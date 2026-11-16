# Lab external-network fail-closed CI evidence — 2026-11-16

**Scope:** GitHub Actions disposable fixture only. NO live lab SQL execution, no production changes, no deploy.

- Branch: `docs/owner-launch-priority-20261115`; tested head before this evidence commit: `97fea15b0b76ba06e4e1f2313409fea5130be7bd` in draft PR #398.
- New tests: `scripts/tests/test_lab_external_paths_fail_closed.py` (7 cases) introduced by commit `4fe0a75d15ca2921f01dc13fe1973c6439628d37`.
- CI registration: `.github/workflows/lab-connection-fence.yml` changed by `97fea15b0b76ba06e4e1f2313409fea5130be7bd`, adding an offline `python3 -m unittest discover -s scripts/tests -p 'test_lab_external_paths_fail_closed.py'` step and path triggers for the network inspector and tests.
- Exact-head workflow status observed through GitHub connector:
  - [Lab connection fence — disposable PostgreSQL, run 43931482761](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43931482761): `completed/success`. This workflow includes the new regression step; successful job status is not a separately parsed per-test result.
  - [Lab session guard — disposable PostgreSQL, run 43931482842](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43931482842): `completed/success`.
  - Node.js CI `43931482887`, PR Preview `43931482767` and Khedmah Test & Verify `43931482757`: `in_progress` when observed; no success assertion recorded.
- Cloud Shell owner's last live lab readback: Cloud SQL `STOPPED`, `activationPolicy=NEVER`, private IP only; a single active Service Networking peering and empty VM listing. NCC/VPC Access returned `UNKNOWN_HTTP_403_SERVICE_DISABLED`, **not** `EMPTY`. The external-writer gate remains **NO-GO**.
- Next: independently prove actual LAB external-writer/network isolation and bounded operating cost before any 036/037 migrations. The retained Backend image remains available for lab-only test after gates. Do not restart Cloud SQL or publish Floot based on these CI passes alone.

## Final exact-head verification receipt

On PR head `86c4ccabcbaca57cc4478b187239113777eb1023`, GitHub workflow runs completed with `success` for all five: [Lab connection fence #43932260012](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43932260012), [Lab session guard #43932260140](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43932260140), [Test & Verify #43932260041](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43932260041), [PR Preview #43932260019](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43932260019), and [Node.js CI #43932260093](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43932260093). This is a verified offline CI milestone; no live-lab writer isolation, SQL migration, or deploy acceptance is implied. Next: confirm fresh independent external-path inventory and lab cost boundary before restarting PostgreSQL. This documentation commit requires separate exact-head CI verification if asserting its own checks.
