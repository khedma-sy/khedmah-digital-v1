# Isolated Cloud SQL schema 037 transition — 2026-11-25

## Baseline

- Protected main: `25bd354a43635e58853e3502be71bae5ce608a41`. Zero open pull requests at baseline. [Node.js CI](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/45394935945), [Test & Verify](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/45394937321) and [isolated quote integration](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/45394936013) succeeded on that commit.
- Target: `khedmah-restore-pg16-20261114` in `khedmah-restore-lab-20261112`. The owner ran the hash-verified resume entrypoint from the above commit. Entrypoint SHA-256: `1b78c7f58ada0773c368f7a2364c6a1bdcf1df27463cff15b79b06380701d715`.

## Owner Cloud Shell receipt

- Live additional network inventory was empty before and after the verified LAB restart. Private LAB preflight passed. The IAM permission check reported advisory presence.
- Transition SQL SHA-256: `6928e4e22e4248eaaaf689b5d258d7fb5f9cbc868db05480c5762cc8e66edaa3`. Copied LAB migrator and postgres passwords rotated.
- `LAB_SCHEMA_035_036_037_VERIFIED=True` and `LAB_TRANSITION_COMMITTED_AND_READBACK_VERIFIED=True`. This is B-02 evidence from the operator output supplied by the owner. Do not rerun the transition.
- The automated cleanup requested deletion of the temporary job, service account and three secrets. `LAB_AUTOSTOP_POLICY_READBACK=NEVER`. Actual stopped state and completion of deletions still need post-run readback.
- `PREVIEW_MUTATION_REQUESTED=False`, `PRODUCTION_MUTATION_REQUESTED=False` and `RESTORE_REEXECUTED=False`.

## Next milestone

B-01 in the [acceptance contract](BACKEND-SCHEMA037-FLOOT-ACCEPTANCE-2026-11-16.md): deploy the exact retained Backend image to a private isolated LAB Cloud Run revision after verifying cleanup, runtime scope and deployment prerequisites. Verify candidate identity by image digest, healthy startup, and timestamped runtime evidence. The [retained archive](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/43767079511/artifacts/14182921183) is available through 2026-12-15 22:04 UTC. The archive digest is distinct from the image digest. Backend has not been deployed to LAB in this receipt. Floot and production release acceptance remain open.
