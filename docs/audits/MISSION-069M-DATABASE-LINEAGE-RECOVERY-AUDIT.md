# Mission 069M — Database Lineage Recovery Audit

## 1. Decision

This audit reconciles the repository's database foundations, governed migration directory, legacy infrastructure SQL, runtime persistence concepts, Git evidence, and Mission 046 field dictionary. It creates no migration, table, database adapter, connection, or runtime behavior.

**DATABASE LINEAGE STATUS: REQUIRES FURTHER RECONCILIATION.**

The sole future lineage authority is decided, but Migration 001 and the field dictionary still disagree on physical names/types and lifecycle compatibility, Migrations 002–004 have never existed in reachable history, the deleted 005 is not compatible enough to restore, and legacy `infra/database` SQL cannot be promoted safely.

## 2. Repository Identity

Commands executed before analysis:

```text
pwd
/workspace/khedmah-digital-v1

git rev-parse --show-toplevel
/workspace/khedmah-digital-v1

basename "$(git rev-parse --show-toplevel)"
khedmah-digital-v1

git branch --show-current
work

git remote -v
(no remotes configured)

git status --short
(clean)
```

This is the official `khedmah-digital-v1` repository. No legacy repository was detected. `infra/database` is a legacy lineage **inside** this repository; it is not a separate repository or current migration authority.

## 3. Database Inventory

| Area | Technology/content | Execution status | Authority and future role |
| --- | --- | --- | --- |
| `backend/database` | PostgreSQL-compatible configuration, connection descriptors, boundary/error/test helpers; JavaScript modules | Opens no network connection, stores no connection string, and executes no SQL | **KEEP** as database adapter foundation below repositories; it is not a schema or migration source |
| `backend/migrations/framework` | Filename and execution-plan descriptors | Validates naming only; executes no SQL and does not yet enforce pairs, unique versions, checksums, or dependencies | **KEEP AND STRENGTHEN LATER** as migration orchestration foundation |
| `backend/migrations/versions` | Plain PostgreSQL SQL; one governed forward/rollback pair | `001_core_identity_accounts` is repository-approved but no runner applies it | **ONLY FUTURE MIGRATION SOURCE** after reconciliation |
| `infra/database` | Four independent PostgreSQL SQL files numbered 001–004 | No runner, rollback files, migration ledger, checksums, or deployment reference found | **DO NOT USE** as migrations; preserve read-only until an explicit archival mission |
| `apps/backend` | NestJS repositories backed by in-memory `Map` collections | Active executable persistence resets with the process; no SQL client/ORM/database connection | **KEEP UNCHANGED** in this audit; future runtime adapters must consume governed repository ports |

### SQL and schema inventory

The governed path contains:

- `001_core_identity_accounts.sql`;
- `001_core_identity_accounts_rollback.sql`.

The legacy path contains:

- `001_identity_foundation.sql`: `user_accounts`, `user_profiles`, and `audit_logs`;
- `002_organizations_foundation.sql`: `organizations` and `organization_members`;
- `003_contact_foundation.sql`: `contact_inquiries`;
- `004_analytics_foundation.sql`: `analytics_events`.

No root `database/` directory, ORM schema, seed directory, database client dependency, environment database URL, live connection, or migration execution configuration was found.

## 4. Governed Migration Chain Audit

| Version | Expected migration | Forward exists? | Rollback exists? | Referenced/evidence | Compatibility | Ready? |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | `001_core_identity_accounts` | Yes | Yes | Added by Mission 067 commit `2bc97fe`; referenced by migration README and tests | PostgreSQL and safe rollback are compatible, but physical naming/types diverge from Mission 046 and it lacks the later-required `account_status = lifecycle_status` constraint | **No — reconcile without rewriting applied history** |
| 002 | `002_create_profiles` | No | No | Named in contracts/audits only; no file exists in any reachable commit | Dependency on 001 is conceptually valid, but physical identifier, owner, type, status, visibility, archive, and naming decisions remain unresolved | **No** |
| 003 | `003_create_professional_profiles` | No | No | Named in contracts/audits only; no file exists in any reachable commit | Must depend on 002 and governed user ownership; Mission 046 includes fields beyond the newer identity-only foundation scope | **No** |
| 004 | `004_create_business_profiles` | No | No | Named in contracts/audits only; no file exists in any reachable commit | Must depend on 002; user-vs-organization ownership and category/contact/service/location scope remain unresolved | **No** |
| 005 | `005_create_organizations` | No in HEAD; recoverable deleted text | No in HEAD; recoverable deleted text | Added prematurely by `2fcb90b`, deleted by corrective Mission 069A commit `6ca6708` | Historical SQL depends on absent `profiles`; omits owner/public identity fields expected by Mission 046 and uses a newer reduced identity shape without a final reconciliation decision | **No; do not restore** |

The current directory has no duplicate migration version and its only migration has a rollback. The intended dependency order is acyclic:

```text
001 core identity accounts
        ↓
002 profiles
        ├──→ 003 professional profiles
        ├──→ 004 business profiles
        └──→ 005 organizations (only after ownership/profile reconciliation)
```

The framework is not sufficient to prove this chain at execution time: it does not scan the directory, pair forward/rollback files, reject duplicate versions, record checksums, maintain an applied-migration ledger, parse dependencies, or execute transactional verification.

## 5. Git Migration History Recovery

The reachable history, all local refs, deleted-file history, and all historical SQL paths were inspected.

### Evidence

- Commit `02ba522` added legacy `infra/database/001_identity_foundation.sql` and `002_organizations_foundation.sql`.
- Commit `145341d` added legacy contact and analytics SQL.
- Commit `9444ed2` introduced the governed migration README but no versioned migration.
- Commit `2bc97fe` added the governed Migration 001 pair.
- Commit `2fcb90b` added the premature Migration 005 pair.
- Commit `6ca6708` deleted only the 005 pair as a corrective action.
- No commit, branch, tag, deleted path, or other reachable object contains governed Migration 002, 003, or 004 files.
- Only the local `work` branch is configured and no remote refs or tags are available as alternate recovery sources.

### Recovery finding

- **001:** keep its immutable historical pair; reconcile defects through an explicit follow-up/versioned correction strategy after determining whether it has ever been applied outside this repository.
- **002–004:** cannot be restored because no historical migration content exists. They must eventually be authored from then-current approved contracts, not inferred from legacy SQL.
- **005:** its text is recoverable with `git show`, but restoration is forbidden. It was intentionally removed, depends on missing 002, and does not resolve current ownership/field-dictionary conflicts. A future 005 must be recreated from approved contracts after 002–004.

## 6. Legacy `infra/database` Lineage

| Legacy file/concepts | Conflicts and risks | Classification |
| --- | --- | --- |
| `001_identity_foundation.sql` — `user_accounts`, `user_profiles`, `audit_logs` | Conflicts with `core_user_accounts`; couples account to email/password hash; uses active/disabled; profile shares user UUID; audit uses dotted unrestricted events and incomplete canonical record shape; cascade deletes profile | **DO NOT USE** as migration; **ARCHIVE** as historical runtime evidence |
| `002_organizations_foundation.sql` — `organizations`, `organization_members` | Assumes legacy `user_accounts`; duplicates owner field and owner member role; lacks canonical type, lifecycle, visibility, representing profile, archive rules, and rollback | **DO NOT USE** as migration; **ARCHIVE** as historical runtime evidence |
| `003_contact_foundation.sql` — `contact_inquiries` | Stores private name/email/message; lacks governed foreign keys to business/user entities and rollback; outside recovered 001–005 identity lineage | **DO NOT USE**; requires separate scope/privacy governance if ever recreated |
| `004_analytics_foundation.sql` — `analytics_events` | Stores anonymous/session references and arbitrary JSON metadata; is a tracking-shaped table forbidden by current database boundaries; lacks rollback and governed privacy/retention | **DO NOT USE**; KILL CRITICAL review required before any future analytics persistence |

The legacy files are not equivalent to governed Migrations 001–004 merely because their filenames share numbers. They are a separate, incomplete, non-reversible lineage. They must never be copied, renumbered, or applied ahead of `backend/migrations/versions`.

No file is deleted by Mission 069M. A later archival mission may move or mark `infra/database` more prominently only after verifying no external deployment depends on it.

## 7. Authoritative Database Lineage Decision

| Decision | Authority |
| --- | --- |
| Database technology | PostgreSQL-compatible SQL and adapters |
| Migration authority | `backend/migrations/versions` only |
| Schema source | Successfully reviewed forward migrations in that directory, interpreted with current canonical contracts; documentation and legacy SQL are not executable schema |
| Table naming authority | Final physical-schema contract followed by the approved versioned migration; lowercase plural snake_case, with explicit reconciliation of `users` vs `core_user_accounts` |
| Rollback authority | The paired `NNN_*_rollback.sql` for the exact forward migration plus Mission 048 safety/verification rules |
| Runtime persistence authority | Repository ports/adapters over `backend/database`; controllers and canonical domain modules do not access database clients directly |

`backend/migrations/versions` is confirmed as the only future migration source. `backend/database` supports connections/adapters but does not define tables. `infra/database` and runtime Maps do not establish schema authority.

## 8. Mission 046 Field Dictionary Compatibility

### Matching direction

- PostgreSQL timestamp semantics and lowercase plural table naming are compatible.
- Governed Migration 001 includes a unique identifier, status, lifecycle, visibility classification, timestamps, and archive timestamp.
- The intended future profile chain uses distinct identifiers and explicit references.
- Archived records are not hard-deleted by the forward design, and rollback is scoped to its own table/indexes.

### Conflicts

| Topic | Mission 046 direction | Governed/current direction | Required correction |
| --- | --- | --- | --- |
| User table/key | `users.user_id` UUID | `core_user_accounts.user_identifier` TEXT plus `identity_reference` | Decide canonical physical naming/type and safe compatibility strategy; do not silently rewrite 001 |
| User fields | normalized email/phone, locale may exist privately | 001 intentionally excludes credentials/contact/profile data | Preserve exclusion from account identity until separate private storage contracts decide placement |
| Lifecycle | `account_status` plus `lifecycle_state` | `account_status` plus `lifecycle_status`; same vocabulary but no equality check | Decide whether fields remain duplicated; enforce the Mission 069I compatibility rule via a future correction only after applied-state review |
| Profile fields | public name, Arabic name, slug/description, draft status, `visibility_class` | Newer profile foundation emphasizes identifiers/type/status/lifecycle/visibility and ownership | Reconcile field scope, naming, status vocabulary, Arabic-first fields, uniqueness, and archive behavior before 002 |
| Professional profile | profession plus specialty/summaries/service/location/trust references | Newer foundation limits initial identity persistence | Freeze non-identity fields for later migrations or explicitly authorize them; do not bundle into 003 implicitly |
| Business profile | business name/category/contact/service/location/trust and conditional organization owner | Newer foundation leaves organization-managed ownership unresolved | Decide minimal 004 identity fields and defer dependent concepts; break circular organization ownership explicitly |
| Organization | owner, public/Arabic names, location/member refs, platform flag, status | Deleted 005 had profile, type, status/lifecycle, visibility only | Reconcile owner-of-record, representing profile, public identity fields, platform-owned/other types, and memberships before recreating 005 |
| Identifier vocabulary | Mostly `*_id` UUID | Newer contracts use `*_identifier` TEXT and typed reference strings | Publish one physical identifier decision for the entire 001–005 lineage |

Mission 046 remains a governance input, not SQL. Later reconciliation contracts may narrow implementation slices, but any departure from the field dictionary must be explicitly recorded rather than silently omitted.

## 9. Runtime Database Impact

The executable NestJS runtime currently uses process-local Maps:

- Identity stores accounts, profiles, sessions, and audit logs;
- Organizations stores organizations and members;
- Contact stores business snapshots, inquiries, and click actions;
- Analytics stores event records;
- rate limiting also uses an in-memory bucket Map.

There is no ORM, SQL driver, connection provider, migration invocation, or durable database configuration in `apps/backend`. Runtime UUID/email/password/session shapes conflict with the governed identity-reference model, and runtime repository classes mix persistence with feature-specific assumptions.

Future integration requires repository port contracts, authenticated-subject/identifier mapping, credential/session separation, safe error translation, transaction boundaries, lifecycle/ownership validation before writes, and PostgreSQL adapters below canonical application/domain layers. No adapter is implemented or authorized here.

## 10. Recovery Strategy

### Options

| Option | Advantages | Risks |
| --- | --- | --- |
| A — restore missing migrations from history | Preserves exact prior text where legitimate | Impossible for 002–004; restoring 005 revives a deliberately removed, dependency-invalid migration |
| B — recreate from approved contracts | Produces one coherent, reviewable, reversible lineage | Unsafe until naming, identifier, lifecycle, ownership, and minimal-field conflicts are reconciled |
| C — hybrid recovery | Keeps valid 001 history while recreating missing successors | Requires an applied-state decision and may need a corrective migration rather than editing 001 |

### Recommendation: Option C, governed hybrid recovery

1. Preserve the existing Migration 001 pair and determine whether any environment has applied it.
2. Reconcile physical identifier/table naming and lifecycle compatibility; never edit an applied migration.
3. If 001 is known never to have been applied anywhere, governance may explicitly approve replacement; otherwise add a later corrective migration in a separately approved sequence.
4. Recreate 002, 003, and 004 from approved minimal identity contracts with paired rollbacks and executable dependency tests.
5. Recreate—not restore—005 only after organization/profile/ownership decisions and predecessors are complete.
6. Quarantine `infra/database` from deployment and document archival without using it as seed SQL or a field source of truth.

Option C recovers legitimate history without treating missing or withdrawn SQL as approved. It is a strategy decision only, not authorization to create migrations.

## 11. Security Review

No production database URL, hostname, username, password, API key, token, private key, or live credential value was found in the reviewed database foundation, migrations, legacy SQL, or runtime database configuration. Configuration descriptors expressly exclude connection strings and credentials.

Legacy SQL still presents design-level exposure risks:

- `user_accounts.password_hash` mixes credentials into the legacy account table;
- `contact_inquiries` proposes storage of private names, emails, and messages without retention/access/redaction rules;
- `analytics_events` proposes anonymous/session references and arbitrary JSON metadata;
- unrestricted audit event strings and identifiers could expose operational or private correlations;
- cascade deletion and absent rollbacks can destroy relationship/profile history.

These are schema risks, not evidence that real secret or private production values are committed. The legacy SQL must not be executed.

## 12. KILL CRITICAL Review

The governed migration lineage contains no marketplace, payment, order, commission, advertising, ranking, social graph, or tracking tables.

Legacy SQL contains no marketplace, payment, order, commission, advertising, ranking, or social graph tables. However, `analytics_events` with `anonymous_id`, `session_reference`, and arbitrary metadata is tracking-shaped, and runtime Contact persists click actions in memory. These are **not** admitted into the governed lineage and require the separate scope/privacy review already identified by Mission 069L.

**KILL CRITICAL result: GOVERNED LINEAGE PASS; LEGACY TRACKING-SHAPED SQL QUARANTINED.**

## 13. Exact Next Missions

1. **Migration 001 Applied-State and Identifier Reconciliation:** determine external application status and decide `core_user_accounts`/`users`, TEXT/UUID, identity references, and corrective-vs-replacement strategy.
2. **Profile Physical Schema Contract:** reconcile Mission 046 with newer profile ownership/lifecycle/visibility contracts and authorize the exact minimal Migration 002 shape—without implementing it.
3. **Professional and Business Physical Schema Contract:** freeze minimal 003/004 fields and resolve organization ownership/circular dependency—without implementation.
4. **Organization Physical Ownership Contract:** resolve owner-of-record, representing profile, public identity, memberships, types, and lifecycle before 005.
5. **Migration Framework Integrity Plan:** specify pair/version/dependency/checksum/ledger/transaction/verification behavior and tests.
6. **Legacy SQL Quarantine and Deployment Audit:** prove `infra/database` is not referenced externally, then archive or guard it from execution.
7. **Tracking and Private Data Persistence Review:** decide Contact/Analytics V1 scope, consent, minimization, retention, and deletion before any related schema.

Only after missions 1–6 approve a coherent physical sequence may an implementation mission recreate Migration 002. Mission 069M stops at audit and reconciliation.
