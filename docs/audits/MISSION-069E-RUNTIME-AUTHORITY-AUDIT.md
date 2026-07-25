# Mission 069E — Runtime Authority Audit

## 1. Audit Decision

The repository contains one executable application workspace under `apps/`, one canonical backend architecture and migration foundation under `backend/`, and one earlier, disconnected SQL path under `infra/database/`. They are not interchangeable.

**Implementation must pause at the current boundary until the active NestJS runtime is explicitly reconciled with the canonical `backend/modules` contracts.** No file is deleted or moved by this audit.

## 2. Repository Identity

| Check | Result |
| --- | --- |
| Working directory | `/workspace/khedmah-digital-v1` |
| Git root | `/workspace/khedmah-digital-v1` |
| Repository basename | `khedmah-digital-v1` |
| Branch | `work` |
| Remote | None configured |
| Initial working tree | Clean |
| Legacy repository | Not detected |

The current repository is the official repository. “Legacy” below describes superseded paths inside it, not a second repository.

## 3. Runtime Inventory

| Area | Present purpose | Runtime status | Authority/ownership | Approved future role |
| --- | --- | --- | --- | --- |
| `apps/frontend` | Next.js/React Arabic-first web application | **ACTIVE, not release-ready** | Frontend application team | Official V1 frontend implementation host after tests pass and deployment is approved |
| `apps/backend` | NestJS/TypeScript HTTP application | **ACTIVE, not release-ready** | Backend application team | Official executable V1 backend host, consuming canonical backend contracts after reconciliation |
| `backend/core`, `backend/shared`, `backend/config` | Framework-neutral errors, validation, logging, common types, and configuration foundations | **ACTIVE library foundation** | Platform/backend architecture | Canonical shared backend rules; may be consumed by authorized runtime implementation |
| `backend/modules` | Twelve governed domain foundations | **ACTIVE architecture, not an executable application** | Domain/backend architecture | Canonical domain boundary and validation source; integrate deliberately into `apps/backend`, do not create a second server |
| `backend/database` | PostgreSQL-compatible database boundary/config descriptors | **ACTIVE foundation, no connection runtime** | Database architecture | Official database integration boundary |
| `backend/migrations` | Governed migration framework and Migration 001 pair | **ACTIVE governed migration source** | Database architecture/governance | Sole source for new approved migrations |
| `infra/database` | Early standalone SQL files for identity, organizations, contact, and analytics | **LEGACY/QUARANTINE** | Unassigned legacy infrastructure | Do not execute or extend; archive after lineage decision |
| `infra/environments` | Local/staging/production placeholder documentation | **FUTURE** | Platform operations | Environment/deployment documentation only until an approved deployment mission |
| `packages` | Reserved shared-package placeholder | **FUTURE** | Platform architecture | Remain empty until shared runtime packages are approved |
| `tests` | Root contracts/foundation tests and canonical test orchestrator | **ACTIVE** | Cross-repository quality | Continue as the canonical repository verification entry point |
| root `database/` | Not present | **ABSENT** | None | Do not create a competing database root |
| root `modules/` | Not present | **ABSENT** | None | Do not create a competing module root |

Generated, ignored `apps/backend/dist` and `apps/frontend/.next` directories may exist locally after builds. They are build outputs, are not tracked source, and have no authority.

## 4. Application Runtime Audit

### `apps/frontend` — ACTIVE

- Framework: Next.js 15, React 19, TypeScript.
- Entry model: Next.js App Router through `app/layout.tsx` and route `page.tsx` files.
- Existing routes: root, login, registration, current-user profile, and organization list/create/detail views.
- Build/start: `next build`, `next start`, and `next dev` from its workspace package.
- V1 relation: preserves Arabic `lang="ar"` and RTL direction and contains approved early identity/organization foundation screens.
- Readiness: not deployment-ready. No deployment definition exists, and the frontend workspace test suite has a failing regex assertion.

The frontend README is stale: it says authentication, user, organization, and business screens are not implemented even though tracked route files exist. That documentation must be corrected in a dedicated consistency mission, not by this audit.

### `apps/backend` — ACTIVE

- Framework: NestJS 11 on TypeScript.
- Entry point: `src/main.ts`, which loads platform config, creates the Nest application, and listens on the configured port.
- Composition root: `src/app.module.ts` imports Identity, Organizations, Contact, and Analytics modules and provides health/logging infrastructure.
- Build/start: TypeScript compilation to ignored `dist`, then `node dist/main.js`; development uses `tsx`.
- Persistence: current repositories are in-memory runtime repositories; the application does not import or execute either SQL migration path.
- V1 relation: implements approved early runtime foundations, but does not consume the newer `backend/modules` domain definitions.
- Readiness: not build- or deployment-ready. The installed NestJS package does not export the referenced `TooManyRequestsException`, causing backend tests and compilation to fail.

The backend and apps READMEs are stale because they claim identity, authentication, organizations, contact/analytics behavior, and related screens are absent. The tracked code contradicts those claims.

## 5. Backend Runtime Authority

There are not two executable backend servers:

- `apps/backend` is the **only executable backend application** and therefore the runtime host.
- `backend/modules` has no bootstrap, HTTP listener, package manifest, controller, or independent service process. It is the **canonical domain architecture and contract implementation foundation**.
- `backend/database` has no live connection and is the **canonical future database adapter boundary**.

The authority defect is that `apps/backend` currently duplicates identity and organization concepts instead of importing or adapting the canonical `backend/modules` definitions. Future work must not expand either path independently. A reconciliation mission must define adapters and dependency direction before more backend features are authorized.

**Decision:** keep `apps/backend` as the single executable NestJS host; keep `backend/modules` as the single canonical domain-boundary source; prohibit a second bootstrap under `backend/`.

## 6. Legacy Detection and Disposition

| Area | Classification | Finding | Disposition |
| --- | --- | --- | --- |
| `infra/database/*.sql` | LEGACY/QUARANTINE | Parallel 001–004 numbering, no rollback files, and table models incompatible with the governed chain | **ARCHIVE** after a database-lineage ADR; never run beside `backend/migrations` |
| `apps/backend/src/identity` | ACTIVE but unreconciled | In-memory account/profile/session model predates governed `core_user_accounts` persistence | **KEEP**, freeze expansion, reconcile through adapters/contracts |
| `apps/backend/src/organizations` | ACTIVE but unreconciled | In-memory organization/member model predates the blocked organization migration | **KEEP**, freeze expansion until database and domain authority are reconciled |
| Contact and analytics runtime modules | ACTIVE but governance-sensitive | Runtime code and legacy SQL exist while newer foundations impose stronger privacy boundaries | **KEEP**, require privacy/data-lineage review before persistence or deployment |
| Generated `dist` and `.next` | Build artifacts | Ignored and reproducible | **REMOVE LOCALLY AS NEEDED**; never commit |
| Stale root/apps/backend/frontend/infra READMEs | Obsolete status statements | Claim runtime and SQL artifacts do not exist | **UPDATE LATER** in a documentation consistency mission |
| `packages` | Reserved | No package runtime exists | **KEEP** as future placeholder |

No abandoned package dependency was proven. NestJS, Next.js, React, RxJS, TypeScript, and `tsx` correspond to current workspace scripts or imports. Express types are used by Nest response typing. The invalid NestJS exception import is a code compatibility defect, not evidence of a duplicate framework.

## 7. Database Authority

### Official decisions

- **Official database technology direction:** PostgreSQL.
- **Official database boundary:** `backend/database/`.
- **Official migration source:** `backend/migrations/versions/`.
- **Official implemented migration state:** `001_core_identity_accounts.sql` and its paired rollback only.
- **Legacy database path:** `infra/database/`; quarantined and forbidden for new work.

### Conflicts

| Concept | Legacy `infra/database` | Governed backend path | Authority result |
| --- | --- | --- | --- |
| User identity | `user_accounts` with UUID/email/password hash | `core_user_accounts` with textual user/identity references and lifecycle fields | Governed backend migration wins; requires reconciliation before data migration |
| Profile | `user_profiles` | Migration 002 absent; domain foundation only | No approved physical profile table yet |
| Organization | `organizations` and `organization_members` | Migration 005 absent; domain foundation only | Legacy tables are not authorization to implement or deploy organization persistence |
| Services | None | Domain foundation only | No physical authority yet |
| Contact | `contact_inquiries` without governed chain/rollback | Apps in-memory repository; no governed migration | No approved production persistence |
| Analytics | `analytics_events` with flexible identifiers/metadata | Apps in-memory repository plus privacy-focused domain foundation | No approved production persistence; tracking/privacy review required |

The application currently has no database adapter import, so neither SQL path is operationally connected. New migration work must remain stopped until 002–004 and runtime/database reconciliation are separately approved.

## 8. Dependency Authority

- Root npm workspaces recognize only `apps/backend` and `apps/frontend` as executable packages.
- `apps/backend` depends on NestJS/RxJS and imports only its own application modules; it does not consume `backend/modules`, `backend/core`, or `backend/database`.
- `apps/frontend` depends on Next.js/React and does not import backend runtime internals.
- `backend/modules` uses relative framework-neutral imports into core/shared and approved upstream domain modules; it has no NestJS dependency.
- The user repository foundation is the only governed module repository importing the backend database error foundation.
- No circular `.mjs` dependency or cross-import from `backend/modules` into `apps` was found in the prior forensic graph audit.

This separation prevents accidental cycles but also proves the active NestJS runtime and canonical domain architecture are not integrated. The approved direction is adapters from the executable host toward canonical domain/application interfaces, never domain imports from API/framework code back into an alternative model.

## 9. Deployment Authority

No tracked Dockerfile, Compose file, GitHub Actions workflow, deployment manifest, Procfile, Vercel configuration, Fly configuration, Render configuration, Kubernetes manifest, Terraform, committed `.env`, or production URL was found.

- There is **no official deployment path today**.
- Package `build`, `start`, and `dev` scripts are local runtime mechanics, not deployment approval.
- `infra/environments` contains documentation placeholders only.
- Future deployment must package `apps/frontend` and `apps/backend`, inject secrets externally, run only governed backend migrations, and pass the canonical `npm test` path before release.
- `infra/database` must not be inferred as a deployment mechanism.

## 10. V1 Source-of-Truth Decisions

| Decision | Official source |
| --- | --- |
| Official repository/governance source | Repository root and approved `docs/` contracts/governance |
| Official frontend source | `apps/frontend` |
| Official executable backend source | `apps/backend` |
| Official backend domain architecture | `backend/modules` with `backend/core` and `backend/shared` |
| Official database integration boundary | `backend/database` |
| Official migration source | `backend/migrations/versions` |
| Official test entry | Root `npm test` / `npm run test:all` |
| Archived/legacy candidate | `infra/database` SQL chain |
| Future-only areas | `packages`, deployment infrastructure, missing governed migrations 002–005 |

These decisions do not approve new behavior. They establish where future authorized changes must land and identify the reconciliation gate between runtime and domain foundations.

## 11. KILL CRITICAL Runtime Audit

No hidden runtime module, controller, service, table, package, or deployment artifact implements marketplace, payments, orders, commissions, advertising, ranking, a social network, followers, AI recommendations, or a delivery marketplace.

Analytics event recording and legacy anonymous/session identifiers are a **tracking-risk primitive**, not a full tracking system. They must remain non-production until data minimization, consent, retention, deletion, and identifier governance are approved.

**Result: PASS with analytics privacy hold.**

## 12. Risk Assessment

| Risk | Severity | Impact | Recommendation |
| --- | --- | --- | --- |
| Runtime/domain split | Critical | New code can implement conflicting identity, ownership, lifecycle, and validation rules | Freeze feature expansion; approve an adapter and authority reconciliation mission |
| Parallel SQL lineages | Critical | Duplicate versions and incompatible identity tables can corrupt or split environments | Quarantine `infra/database`; issue lineage ADR before executing any SQL |
| Stale source-of-truth documentation | High | Contributors may treat active code as forbidden or legacy SQL as current | Update root/apps/infra/backend status documents after this audit is approved |
| No deployment authority | High | Local scripts may be mistaken for production readiness | Define CI/CD, artifact, secret, environment, migration, and rollback policy in a dedicated mission |
| Canonical tests currently red | High | Active backend cannot build and frontend has a failing assertion | Complete test repair missions before merge/deployment claims |
| In-memory repositories | Medium | Runtime behavior is non-durable and may diverge from future persistence | Keep non-production; introduce persistence only through governed repositories/migrations |
| Analytics identifier flexibility | High | Session/anonymous metadata may enable tracking drift | Require privacy review and block production persistence |
| Generated local build artifacts | Low | Can confuse manual inventory if mistaken for tracked source | Rely on `git ls-files`; keep ignored and clean locally |

## 13. Required Next Actions

1. Repair existing backend and frontend workspace failures without product behavior changes.
2. Approve a runtime/domain adapter decision connecting `apps/backend` to canonical `backend/modules` rules.
3. Approve a database-lineage ADR quarantining and eventually archiving `infra/database`.
4. Correct stale repository and application READMEs to describe current authorized state.
5. Define deployment authority only after builds and canonical tests pass.
6. Do not resume Migrations 002–005 or Mission 070 until the authority and lineage gates are complete.

**Final runtime decision: the applications are active source trees, the backend foundation is canonical architecture, the governed backend migration directory is the only future migration source, and the infra SQL chain is legacy/quarantined.**
