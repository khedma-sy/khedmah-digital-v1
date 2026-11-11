# Preview V2 — regional Cloud Run writer-surface inventory

**Stage:** Read-only discovery on the existing Preview project. No writer fence, schema migration, traffic change or deployment is authorized by a successful run.

The owner can run the following after the source and PR are independently validated and merged:

```bash
python3 scripts/read-preview-v2-regional-writer-surfaces.py --inspect
```

The tool deliberately pins project `khedmah-preview-v2-20261012` and region `europe-west1`, uses only `gcloud run services list`, `gcloud run jobs list` and for each enumerated job `gcloud run jobs executions list --job=...`, plus `--format=json --limit=1001 --quiet`. It never enables APIs or starts jobs. The output is an allowlisted JSON summary: service names, unexpected service names, job names and per-job completed-timestamp versus nonterminal/unknown execution counts. It never prints Cloud Run environment or secret fields.

**Fail closed:** missing known Backend or Frontend, malformed or duplicate resource identities, a Cloud Run v2 resource outside the pinned project/region, executions belonging to another Job, invalid JSON, IAM/command failure, and any inventory at the count limit cause an explicit STOP rather than an empty-inventory claim. **Additional valid service names do not terminate discovery:** they are returned under `other_service_names` and require independent investigation as potential writers before any writer-fence decision. The existing offline regression asserts they are reported while `writer_quiescence_verified` and `release_authorized` remain `false`. A completion timestamp is **not** proof of a successful job. Even a fully completed regional inventory is not a writer-quiescence attestation.

### Other required proofs before migrations 036/037

- Verify additional Cloud Run **regions**, external scheduler/Cloud Tasks triggers, any clients outside Google Cloud and direct PostgreSQL connections separately. Previously the regional Scheduler returned `[]`; Cloud Tasks returned `SERVICE_DISABLED`, **not** an empty queue list.
- Existing Backend remains `MANUAL 1` at last known read; zero SQL sessions at one instant does **not** prevent reconnection. A suitable reviewed maintenance revision, exclusion of old revisions and fresh writer fence remain required.
- Recent backup `SUCCESS` and PITR do not replace an independently verified **isolated restore and rollback**.
- Current SQL catalog is `prerequisite-invalid`: ad quota function exactly matches 025 not 036; verification media is pre-037. Do not run migrations or a new Backend image against this state.

All receipt keys `writer_quiescence_verified`, `release_authorized`, `database_mutation`, `cloud_resource_mutation` stay `false`.

See `docs/project-control/PREVIEW-V2-OWNER-READONLY-RECEIPTS-2026-11-11.md` and issue [#369](https://github.com/khedma-sy/khedmah-digital-v1/issues/369).
