# Preview V2 — isolated Cloud SQL restore and schema rehearsal plan (12 Nov 2026)

**Status: PREPARED, NOT EXECUTED. Official launch: NO-GO.**
This plan records the owner's read-only Cloud Shell receipts and defines the next controlled operation. **It is not permission to provision a paid resource, restore data, modify source Preview, migrate any existing database, or publish Floot.** Follow `AGENTS.md`, `ROADMAP-EXECUTION-2026-09-08.md` and `docs/project-control/PREVIEW-V2-RESTORE-EVIDENCE-BOUNDARY.md`.

## 1. Identified source and exact backup

Owner independently observed on 2026-11-12:

| Field | Verified read-only value |
| --- | --- |
| Project | `khedmah-preview-v2-20261012` |
| Instance | `khedmah-preview-v2-db` |
| Region | `europe-west1` (Belgium) |
| Instance state | `RUNNABLE` |
| Engine | `POSTGRES_16` |
| Edition and tier | `ENTERPRISE`, `db-custom-1-3840` (1 vCPU; 3.75 GiB RAM) |
| Availability | `ZONAL` |
| Disk | `PD_SSD`, configured 10 GiB |
| Source public IPv4 | Enabled (this must NOT be copied as the target's desired network policy) |
| Source private VPC | No `privateNetwork` field in the owner's full `settings.ipConfiguration` readback; private path for Google services `false` |
| Current transport security | `sslMode=ENCRYPTED_ONLY`, `requireSsl=false`, Google-managed internal CA; SSL mode is authoritative. TLS encryption required; this does not by itself establish public ingress reachability |
| Compute API on source project | `compute.googleapis.com` disabled as surfaced by `gcloud compute networks list`; the user did not authorize enabling it |
| Backup system | Standard, automatic backups enabled, 7 retained by count, PITR enabled, 7 transaction-log retention days |
| Recovery candidate | Automated backup `1794448800000`, `SUCCESSFUL`, started `2026-11-12T02:50:32.920Z`, completed `2026-11-12T02:52:14.307Z` |
| Existing SQL instances in source project | Only `khedmah-preview-v2-db` at observation time |

The owner also verified 2026-11-08 through 2026-11-11 automated backups successful; detailed evidence is recorded in [issue #373](https://github.com/khedma-sy/khedmah-digital-v1/issues/373). Cloud SQL backup retention makes these source observations **time-limited**: re-read backup existence/status immediately before any restore.

## 2. Why the current schema may not be upgraded in place

The independently executed `scripts/read-preview-v2-approval-schema.py --inspect-quota` returned:

- `classification=prerequisite-invalid`, `required_relation_anchors=true`, `quota_columns_exact=true`, `role_target=true`;
- `quota_target=false`, `asset_target=false`, `private_constraint_target=false`;
- `schema_mutation=false`, `application_data_mutation=false`, `release_gates_verified=false`.

The read-only `scripts/read-preview-v2-regional-writer-surfaces.py --inspect` inventoried exactly two Cloud Run services and nine schema Jobs / 39 execution records in `europe-west1` with no *listed* nonterminal or unknown execution. It **did not** inventory other regions, Scheduler, Tasks, external writers, or DB sessions. A separate read-only successor check observed current backend revision `khedmah-pr-274-backend-00008-tg8` with **100% traffic** and `manualInstanceCount=1`, and instantaneous `khedmah_app` sessions `0`, without `pg_read_all_stats` visibility. Thus `writer_quiescence_verified=false`.

**Do not run the source-pinned 035/037 migration runner, Cloud SQL restore, revision retirement, or maintenance-fence scripts against the shared Preview instance.** An isolated clone/recovery rehearsal is a separate planned operation and does not itself require stopping Preview; later mutation of the shared Preview DOES require independently proven writer isolation and release gates.

## 3. Recovery Lab project exists — no Cloud SQL resource, billing or isolation approval

**Owner read-only Cloud Shell receipts (12 Nov 2026):** The distinct recovery project was created and verified after the original plan was written. This updates the earlier **proposal**, not the release-go decision. Its confirmed identity and preliminary gate state are:

| Property | Owner-confirmed live readback |
| --- | --- |
| Target project ID | `khedmah-restore-lab-20261112` |
| Target project number | `36942020932` |
| Name, parent, state | `Khedmah Recovery Lab`; organization `594049370623`; `ACTIVE` |
| Billing | `billingEnabled=false` |
| Enabled services | `gcloud services list --enabled` returned no service names |
| Target's direct IAM bindings | Role names: `roles/owner` only |
| Parent organization's allow-policy role bindings | Nine bindings: eight `user` entries and one `serviceAccount` on `roles/cloudasset.viewer`; all conditions `false`; no group/domain/public principals in the inspected response |
| Target Cloud SQL database or VPC | **Not created and not attested**; no API enablement or database resource creation was performed in the read-only gates |

**Security limitations:** The eight user bindings may refer to one or more actual principals, whose identities were deliberately not published; the project `roles/owner` principal is not attested. Organization-level role names and binding types do not prove actual project effective access, inherited denies/principal access boundary, or allowed data access. The organization and project IAM policy reads do **not** establish resource-level network, firewall, IAM or application isolation. The user-visible Cloud Shell default is another project (`khedma-dl-e409d`): all eventual operations must specify `--project` and exact targets, never rely on defaults.

**Other existing projects are excluded:** `khedma-dl` is canonical legacy production in source; `khedma-dl-e409d` contains Firebase/Identity Toolkit/API key and billing; `khedmah-preview-v2-20261012` is source/shared Preview; `khedmah-production` is production-named and not approved for recovery rehearsals.

**Scope of completed work:** `target_project_identity_verified=true` and `target_unbilled=true` only. Set `isolated_target_ready=false`, `target_billing_approved=false`, `target_network_verified=false`, `cloud_sql_backup_restored=false`, `release_authorized=false`.

### Indicative cost & operation boundary — NOT an authorization

Google Cloud's Cloud SQL region Belgium (`europe-west1`) source tier is **Enterprise zonal PostgreSQL 16, 1 vCPU, 3.75 GiB RAM, configured SSD 10 GiB**. A public catalog snapshot updated 2026-10-30 reports comparable `db-n1-standard-1` compute+memory at about **USD 0.0676 per hour (USD 1.62 for 24 hours)**; its exact correspondence to the selected `db-custom-1-3840` SKU, live currency, negotiated discounts, taxes and destination billing account is **not yet confirmed**. **Storage, automated backups/PITR, networking, operations, additional VPC connectors/VMs and any excess disk/retained backup are extra.** Treat this as an indicative *compute-only* planning figure, not an agreed limit or a firm total bill. Independent pricing sources: <https://cloud.google.com/sql/pricing>, <https://cloud.google.com/products/calculator>, <https://instances.usage.ai/gcp/sql/region/europe-west1>.

Proposed *time limit*: a single supervised restore/reconciliation/rehearsal session of at most 24 hours, with named operator/teardown owner, prior documented estimated total and maximum accepted spend; none of these are authorized yet. Google Cloud **alerts-only budgets do not stop billing**. An actual spend-cap budget may be available to eligible billing accounts/services but may permit overages because enforcement is delayed: <https://docs.cloud.google.com/billing/docs/how-to/budgets>, <https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps>. The teardown must be verified separately; simply stopping Cloud SQL can leave storage charges.

### Concrete private runner path: proposed, not provisioned

The preferred design for the one-service recovery rehearsal is **Cloud SQL PostgreSQL 16 with PSC-only private access**, a single lab-owned VPC/subnet and one PSC forwarding-rule endpoint limited to `khedmah-restore-lab-20261112`. A **temporary Cloud Run Job in the same lab** uses Direct VPC egress for catalog-only inspection and sanitized restore integrity evidence. Give the job a distinct, minimally privileged account; do not reuse any Preview/Firebase credentials. The existing serving Cloud Run applications and Floot must have **no route to the lab**.

**Do not assume Cloud Shell can open a PSC database session:** Google documents that `gcloud sql connect`, Cloud Shell and Cloud Build cannot directly connect to a PSC-enabled Cloud SQL instance. The administrative restore/control-plane operator and the separate private SQL-reading job are distinct. Confirm PSC endpoint accepted and DNS configured; verify no public IP, unauthorized PSC consumers or internet-facing job routes both **before and after** the backup restore. Full network and data handling boundaries are in [the recovery evidence design](PREVIEW-V2-RESTORE-EVIDENCE-BOUNDARY.md#b2-proposed-private-recovery-design--not-approved-for-cloud-deployment-2026-11-12). References: <https://docs.cloud.google.com/sql/docs/postgres/configure-private-service-connect>, <https://docs.cloud.google.com/run/docs/configuring/connecting-vpc>.

An endpoint carries an indicative **USD 0.01/hour** charge (USD 0.24/24h), *in addition* to earlier approximate USD 1.76/24h Cloud SQL CPU+RAM + illustrative storage/backup. **USD ~2.00/24h is only a partial cost subtotal**, not a quote or hard cap: job instance-seconds, PSC data processing, DNS, logs, backup changes, disk growth and other network charges are unknown. A real quoted and owner-approved **all-in maximum spend** and authorized teardown owner are required before linking billing or enabling APIs. <https://cloud.google.com/vpc/network-pricing>.

### Private network design options to evaluate

Google Cloud documentation currently recommends **Private Service Connect (PSC)** for new private-IP connectivity in many use cases; **Private Services Access (PSA)** is another supported path. Select only after checking whether the verified isolated test reader/runner will have a private path, API requirements, resource cost, and no inherited shared network/project access. Use target-owned private network and exact allowlist with public IPv4 **disabled**; do not automatically copy the source's public-IP settings. No actual PSC/PSA, VPC, private service connection, connector/runner or Cloud SQL resource has been set up or verified. <https://docs.cloud.google.com/sql/docs/postgres/private-ip>.



Use a **separate isolated nonproduction project and private VPC** where feasible, with separate IAM bindings, no application routes/Cloud Run service pointing to the target, no public IPv4, no authorized public networks, no shared runtime service account or Secret Manager grants, and no external clients. An independent operator must verify these properties **before the backup is restored**, because restore copies source databases and users.

**New 2026-11-12 networking blocker:** the existing Preview project has Compute Engine API disabled; `gcloud compute networks list` prompted to enable it, and operator did not enable it. The source SQL `settings.ipConfiguration` has `ipv4Enabled=true`, `enablePrivatePathForGoogleCloudServices=false`, no `privateNetwork` key, and `sslMode=ENCRYPTED_ONLY`. A public IP paired with encrypted-only SSL is **not sufficient to assert public unauthorized access**; inspect authorized networks and IAM through Cloud SQL API separately. Google Cloud's PostgreSQL private-services-access documentation requires `compute.googleapis.com` and `servicenetworking.googleapis.com` enabled **in the target VPC host project**, plus approved network/private-services connection. Do not enable APIs on the source project simply to complete a read-only inventory. The preferred path is an independently governed, separately funded isolated target project. Any API enablement and VPC construction there require an explicit scoped authorization. <https://docs.cloud.google.com/sql/docs/postgres/configure-private-services-access>.

If a separate project is unavailable, **do not silently assume a new instance in the existing project is isolated**: inherited project IAM, VPC reachability, shared proxy access and credential reuse must be reviewed before approving an alternative. Reject a target with public ingress or unintended principal access.

Provisional sizing: PostgreSQL 16; Enterprise, `db-custom-1-3840`, zonal, SSD **at least 10 GiB**, possibly larger because Cloud SQL chooses the maximum of configured and backup disk size and can automatically increase storage. Source and target PostgreSQL **major versions must match**. Do not claim an identical security/network configuration; configure target isolation independently.

The **target project ID is resolved and exists but is unbilled**. Target Cloud SQL instance ID, private VPC/PSC or PSA, isolation owner, verified eligible principals, exact region-specific total quote, agreed maximum spend, lifetime, cost controls and teardown responsibility remain **unresolved**. Costs begin on paid provisioning and may outlast an instance stop; obtain an account-specific quote before any change. **No database or network has been created.**

### Automated repository guard (source-only)

The strictly read-only `scripts/inspect-recovery-lab-readonly.py --inspect` reads **only** the pinned Recovery Lab's identity, billing-enabled flag, enabled API list, project allow-policy role names, and parent organization allow-policy principal **types**. It stops on any unexpected scope, API, billing or policy change; it does not print principal identities and it has **no create/restore/update mode**. The offline regressions are `tests/test_recovery_lab_readonly.py`, included in the canonical root tests via `tests/recovery-lab-readonly.test.mjs`.

A successful result is always `INITIAL_INVENTORY_ONLY_NO_GO` and explicitly leaves `effective_iam_verified`, `network_isolation_verified`, `pricing_approved` and `restore_authorized` **false**. It is only suitable for the **unbilled initial admission phase**: after legitimately enabling target services or linking approved billing it will intentionally STOP and must not be bypassed, changed to a broad allowlist, or misrepresented as a paid-stage validation. Never run it in another project. The command does not attest effective inherited IAM/deny, VPC topology, hidden costs, or source backup validity.

## 4. Read-only checks before an explicit scoped GO

Run only against the **source**, with project/instance explicitly pinned. These commands do not create resources:

```bash
PROJECT="khedmah-preview-v2-20261012"
SOURCE="khedmah-preview-v2-db"
BACKUP="1794448800000"

gcloud config get-value account
gcloud config get-value project

gcloud sql instances describe "$SOURCE" --project="$PROJECT" \
  --format="json(name,region,state,databaseVersion,settings.edition,settings.tier,settings.dataDiskSizeGb,settings.ipConfiguration,settings.backupConfiguration)"

gcloud sql backups describe "$BACKUP" --instance="$SOURCE" --project="$PROJECT" \
  --format="json(id,status,type,startTime,endTime)"

gcloud sql instances list --project="$PROJECT" \
  --format="table(name,region,state,databaseVersion)"

# Only inspect API enablement; do NOT auto-enable compute.googleapis.com.
gcloud services list --enabled --project="$PROJECT" \
  --filter="config.name:compute.googleapis.com OR config.name:servicenetworking.googleapis.com" \
  --format="table(config.name)"

# The earlier gcloud compute networks list triggered an API-enable prompt.
# Do not run that command in the source project until a scoped API change is approved.
```

Never include passwords, tokens, secret payloads, public URLs, or rows containing personal information in output artifacts. Read-only network enumeration is not a security attestation. Scope all future commands to **the new target**, never the `SOURCE` variable.

## 5. Operation gates and acceptance criteria

1. **Approval and budget:** record a separate explicit scope authorizing a *new* paid isolated target only; budget ceiling and expiry/deletion process; destination project and identity verified. No permission is inferred from this plan or prior read-only commands.
2. **Isolation first:** independent security review of private VPC, permitted principals, service accounts, credentials, public ingress, egress, authorized networks, and cross-project path. Verify exact source-vs-target names and distinct instance IDs; abort on any ambiguity.
3. **Target provision:** create the distinct PostgreSQL 16 target using reviewed values. Require `RUNNABLE` and confirm no app connections or public endpoint. Provisioning itself is a paid mutation and is not performed by this document.
4. **Restore:** re-verify `1794448800000` is still present and successful, and choose **all three** distinct identities: `--backup-instance=khedmah-preview-v2-db`, `--backup-project=khedmah-preview-v2-20261012`, and `--restore-instance=<approved-test-instance>` **within** `--project=khedmah-restore-lab-20261112`, only after an independent exact-name check. For cross-project restore the `--backup-project` flag is essential; omitting it targets the wrong backup project. Cloud SQL restore **overwrites the target** and copies source databases/users and may bring over source settings. Independently verify no public IP, no authorized public networks, private connectivity, credentials, instance flags and no application routes **again after restore**. Never allow `--restore-instance=khedmah-preview-v2-db`. This is **not a runnable command or permission to restore**. See the vendor cross-project restore instructions: <https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restoring>.
5. **Reconciliation:** record restore operation ID, completion and wall clock duration; prove target PostgreSQL 16, expected databases/schema, schema catalog/trigger constraints, migrations currently installed, and selected non-sensitive consistency counts/digests. No direct public PII access. Verify source's application path, service traffic, schema and counts remain unchanged.
6. **Target-only migration rehearsal:** independently adapt and review the 036/037 migration to allow ONLY the explicitly named isolated target; fail closed if the target matches the Preview source. Dry-run predecessor checks first, then execute reviewed migration on isolated target only. Verify atomic commit/readback, intended quota routine and private evidence constraints, and regression tests. Do not reuse a pinned-to-Preview production migration script unchanged.
7. **Rollback:** perform and document a target-only rollback/rebuild-from-backup exercise; measure isolated RTO/RPO *for the target*, not automatically for shared Preview. Preserve data integrity and source nonmutation receipts.
8. **Teardown:** separately approve deletion of test resources only after sanitised evidence export. Verify billing stopped. Never delete the source instance or source backups.

**STOP** on backup expiry, source/target name collision, unsupported VPC isolation, identity/permissions ambiguity, unsupported restore/DDL path, unexplained discrepancies, or nonzero unexpected source mutation.

## 6. Required release declaration

This plan does **not** establish `cloud_sql_backup_restored=true`, `writer_quiescence_verified=true`, `schema_readiness_verified=true`, `release_authorized=true`, or readiness to enable Floot Smart Admin. The site remains an officially **unlaunched trial/Preview** even though a web preview may be reachable. Keep approval execution and driver-document writes fail-closed.

Upstream docs: [PostgreSQL restore overview](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restore), [restore from backup instructions](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restoring), [private IP configuration](https://docs.cloud.google.com/sql/docs/postgres/configure-private-ip), [Cloud SQL prices](https://cloud.google.com/sql/pricing).
