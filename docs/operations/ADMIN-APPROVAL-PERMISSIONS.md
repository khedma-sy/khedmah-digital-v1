# Human Admin Approval Permissions

## Outcome

`smart_admin_approver` is a bounded, authenticated **human reviewer** role. The name does not create an autonomous AI actor and does not allow KORA to decide a review. Every acceptance still requires an explicit button/API action from a signed-in reviewer and the domain service records that review against the authenticated user.

The role is bound only through the server-side `OPERATIONS_PRODUCT_ROLE_BINDINGS` runtime configuration. Email addresses, role claims, and reviewer identities are never accepted from a request body or browser header.

## Exact authority

| Permission | May read | May accept | Explicitly excluded |
| --- | --- | --- | --- |
| `content.approvals.approve` | Pending Classifieds, Store products, business profiles, professional profiles, and the public images exposed to their review queues | The exact revision shown in the queue | Reject, suspend, resolve reports, edit owner content, or change prices |
| `trust.approvals.approve` | Current pending business/professional verification requests, their current private evidence images, and the exact profile revision | The current request and evidence state, with mandatory human review notes | Reject, suspend trust, reactivate an account, or claim an automated identity/authenticity check |
| `mobility.approvals.approve` | Current private driver/vehicle documents and Taxi operational candidates | A visually reviewed current document; then the eligible driver/vehicle/zone record when all four latest documents are accepted | Reject a document, suspend/revoke an operational approval, dispatch a trip, or change Taxi pricing |

The role does not receive `operations.read`. The existing `overview` endpoint accepts one of the three bounded approval permissions only to open the authenticated administration shell. In that limited context it returns roles and permissions with an empty service list and neutral incident/change counts; it does not read environment service status or the operations repository. Operational inventory, history, KORA, and supervised-admin audit remain protected by `operations.read`. The role also does not receive `security.manage`, infrastructure, deployment, release, incident, RBAC, billing, finance, secret, IAM, database-migration, or Production mutation authority.

## Mandatory safeguards

These are the supporting backend source contracts. The proven older serving `f4f8ce2` image does not supply every safeguard; the held Floot execution gate below prevents treating source support or preflight as live enforcement.

- Approval of a record owned by the reviewer is forbidden on the server.
- Approval remains bound to the current domain revision or review revision. A changed record must be reloaded and reviewed again.
- The backend enforces approval-only authority even if a caller forges a rejection, suspension, or revocation request. Those decisions remain restricted to `security.manage`.
- The limited-role UI does not request report data and hides rejection, suspension, and revocation actions. Hiding controls is usability defense only; the backend permission checks remain authoritative.
- Classifieds Smart Admin output remains an advisory, structural assessment with `automatedDecisionAllowed=false`; it never authorizes automatic publication.
- Document hashes and upload signatures prove byte integrity and type framing only. A human reviewer must open private driver/vehicle evidence and assess it before acceptance.
- Business/professional verification accepts from one to three private evidence **images** per profile (JPEG, PNG, or WebP, at most 5 MiB each). This V1 flow does not accept PDFs and is not a document archive.
- A trust reviewer can open private verification evidence only while that profile's latest verification request is pending. The server rechecks the media metadata and authorization after reading the stored object; a decided or superseded request does not leave a reviewer-readable evidence link.
- The decision is a review of the current evidence state. Uploading or deleting verification evidence advances the locked parent revision. If a prior request was approved, the prior decision row remains historical, a new pending request is created, and the public business trust/verification state is invalidated until another explicit human review.
- Business/professional verification is a human attestation recorded with notes. The platform must describe the public result as **human-reviewed verification**, not as an automated identity, document-authenticity, or government-registry check. The flow does not preserve deleted evidence files for later forensic reconstruction.

## Activation boundary

Source support for this **additional bounded role** does not change a live account or environment. Activating that role requires a reviewed binding, Preview/Staging negative tests (including rejection/suspension denial and self-approval denial), a reviewed merge, and a separately authorized deployment. It is not a prerequisite for an already working director account. No Floot operation, IAM change, secret write, database migration, or Production deployment is part of this source change.

### Existing administrator and published site — reconciled 2026-10-21

The designated application administrator `khedmasy@gmail.com` is already bound to `operations_product_director`; the owner confirms it is activated and working. Floot's integration plan records real admin 200 at `2026-10-18T20:53:11.527Z`, with the director's seven permissions. Safari login/reload, post-hour absence and explicit logout-to-401 are also accepted. This evidence covers the recorded overview/inventory and session slices; it does not grant cloud IAM or certify every submodule.

Floot is published/public and continues to use the existing Preview V2 backend. Owner Cloud Run/Cloud Build receipts close the image-to-build-to-checkout chain: backend revision `khedmah-pr-274-backend-00008-tg8`, build `9ab03624-687d-43d7-a32e-086ab68a596a`, actual checkout `f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a`; exact digest/source evidence is in [CURRENT-STATE](../project-control/CURRENT-STATE.md#new-source-capabilities-and-the-serving-version) and [deployment job 117173512207](https://github.com/khedma-sy/khedmah-digital-v1/actions/runs/38959671388/job/117173512207). This older artifact does not include PR287/288. The current continuation must establish a compatible Preview target and applicable gates before reviewing activation of the implemented held forms; it does not reopen administrator setup or select a default schema/Staging mission.

Preserve the existing director mapping. The serving `f4f8ce2` role resolver does not recognize `smart_admin_approver` and rejects a mapping containing an unknown role; adding it there could remove the existing effective authority. On source that supports both roles, their permissions are a union, so a broadly authorized director still cannot prove approval-only denial. A separately approved bounded test identity is needed only when that additional-role acceptance is actually selected.

### Floot approval integration status

Floot baseline `1792514696385` implements the director overview/inventory and explicitly labeled external administration links. Its `khedmah_manage` adapter contains owner/order actions, not administrative review decisions. The compatibility repair at code version `1792597447431`, checkpoint `83c0d313-2637-4a8b-86bb-8e11bb7f082c`, validates overview before conditionally reading inventory and filters handoffs by permission while preserving the director. Management/checkout ID compatibility was repaired in the same eight-file pass. All four affected spec files passed and full TypeScript was clean; [CURRENT-STATE](../project-control/CURRENT-STATE.md#floot-contract-audit-and-compatibility-repair) retains the baseline and failing-before/fixed-after receipts. That compatibility pass did not add a native queue, role binding, live approval or publication.

The prior native read-only phase is complete in preview at tested code version `1792601348935`, checkpoint `172cabe3-aa78-4718-b651-494d14963cd7` (**مركز مراجعة الطلبات والأدلة المحمية**). All 16 source/test files matched exact readback; six spec files passed with zero failures and full TypeScript was clean. That checkpoint supplies seven queues, a driver-document drilldown and protected image reads, without an approval write path. Its five-note handoff is documentation version `1792602338986`, checkpoint `aae8b6e8-f04f-46b8-9661-e0dbb3554d8b`, separate from the tested code. Full test scope and acceptance limits remain in the [native-read receipt](../project-control/CURRENT-STATE.md#native-floot-review-queues-and-protected-evidence).

**The following approval source/fixture phase is complete, with execution held.** Tested code version `1792604513416`, checkpoint `88feabe9-ed9b-4ebd-bd26-36cfed22b863` (**نماذج الموافقة البشرية مع بوابة تنفيذ مغلقة**), contains **13 files: five new and eight modified**, all matched by exact readback. Seven spec files passed with zero failures and full TypeScript was clean; the [approval receipt](../project-control/CURRENT-STATE.md#native-floot-bounded-approval-forms-and-held-execution) names the suites. It adds explicit human forms, a closed approval-only schema, a dedicated transport/endpoint and server-derived eligibility/execution metadata. The five-note documentation handoff is version `1792604714468`, checkpoint `1c51a6a9-41ce-4fbe-a532-07cdf883cd17`. No live approval or publication follows from these receipts.

| Domain / permission | Native read implementation in preview | Implemented approval contract; execution held |
| --- | --- | --- |
| Classifieds / content | Pending queue, displayed content/price, structural Smart Admin assessment, exact review metadata and protected review images | `PATCH /admin/classifieds/{id}/moderation`, fixed `decision:"approved"`, exact `expectedReviewRevision` and `expectedAssessmentVersion`; no owner edit or quota bypass. |
| Store / content | Pending products, description/price/pharmacy flags, protected images and exact revision metadata | `PATCH /admin/products/{id}/moderation`, fixed `status:"approved"` and exact microsecond `expectedRevision`; image prerequisite required. |
| Business/professional content / content | Separate queues preserving full `reviewSnapshot`, services, business hours/branches/social links, protected images and `exactRevision` | `POST /businesses/{id}/moderation/approve` or `/professionals/{id}/moderation/approve`, bound to the displayed exact `expectedRevision`. |
| Private verification / trust | Pending requests, `profileSummary`, evidence metadata and authenticated private image reads | `POST /admin/moderation/verification/{requestId}/approve`, current `profileRevision` as `expectedRevision` and trimmed human notes of 10–2000 characters. |
| Driver/vehicle documents / mobility | Business queue, document drilldown and protected images; all returned document states participate in latest-upload proof | `POST /driver-documents/{id}/review` with only `status:"approved"`; business ID is a local preflight locator, not an upstream field. Require pending and uniquely latest upload per type; maximum-timestamp ties disable all tied records. No invented revision. |
| Taxi operational approval / mobility | Candidate readiness, four-document states and exact decimal-string driver/vehicle revisions | `POST /taxi-operational-approvals/{businessId}/approve`, both exact revision strings and required zone, verification reference, reason and expiry; ready candidates only, without suspended/revoked restoration, trip activation or pricing authority. |

Routes above have the fixed upstream `/api/v1` prefix. Every form requires explicit human confirmation of its captured snapshot. The dedicated write preflight obtains fresh server permissions and the selected domain queue, applies the strict projector, and requires exact identity/revision/eligibility matches before a possible dispatch. Microsecond and decimal revisions are preserved as strings. Server ownership/self-review and transactional current-state checks remain authoritative; preflight does not create idempotency or eliminate concurrent changes.

The real approval handler enforces `Object.freeze({enabled:false})` and returns `503 / not_applied` before any upstream request. Queue metadata derives from the same constant; false or missing metadata disables final UI submission. No browser payload, header, query, role or environment variable can enable execution. Synthetic examples/specs alone use true, and their approval endpoint is intercepted. Independently read [serving f4 driver review source](https://github.com/khedma-sy/khedmah-digital-v1/blob/f4f8ce2b4b3d0efafedcddfe5f49e7fa4d783d9a/apps/backend/src/media/driver-document-review.service.ts), exact blob `037a37256a8a069b6c17bddadaf6a1267f22fe5e`, lacks main's atomic latest-document, self-approval and pending-state guards. Fresh queue reads cannot supply those missing transaction guarantees, even for the working director.

All API paths remain server-owned. The dedicated GET-only transport verifies the selected domain permission through the server overview, then reconstructs fixed routes using the current adapter session cookie. Classifieds review images use the protected admin-media route; product/profile and verification images use their authenticated media contract; driver images use the document-content route. A path containing `public` does not make protected evidence anonymous. The proxy enforces private/no-store headers, a 10-second deadline through body streaming, caller cancellation, 2 MiB JSON/5 MiB image limits, JPEG/PNG/WebP MIME-and-magic framing and redirect denial. The page clears private state on 401/403 and aborts evidence reads on close, navigation or unmount; these behaviors have fixture coverage.

The dedicated read transport preserves genuine 404, 409 and 503 responses. A hidden, removed or superseded image can be 404; the adapter does not invent 409 from that absence. The dedicated approval transport now preserves redacted 409 as a stopped decision requiring a fresh GET and renewed human review/confirmation. A preflight 404 is `not_applied`; a 404 after dispatch is `unknown`, because profile services can commit before rereading their result. A timeout, abort or invalid success receipt after dispatch also remains uncertain. No automatic retry occurs. The UI locks before dispatch, ignores late closed/unmounted results and stores only opaque SHA-256 snapshot fingerprints across in-app refresh or edited notes. A full page reload resets that memory; these backend endpoints have no idempotency contract. The unrelated generic write transport's 409-to-502 mapping is unchanged.

The serving `f4f8ce2` legacy security-only routes are not equivalent to main's bounded-role evidence/revision contracts. Populated responses missing required modern fields fail closed rather than inventing snapshots, evidence or revisions; genuine empty arrays remain valid. A compatible runtime and applicable target gates are required before activation or populated live acceptance, and the new role name must not be added to the older image. A fresh page-examples navigation again found no responding Floot window; desktop/mobile visual acceptance was not performed. The earlier anonymous HTTP probe was rejected before execution and not retried, so it establishes no anonymous 401 receipt. The published baseline remains unchanged. No publication, live approval, role binding, backend/cloud/schema change or persistent application-data write is part of this phase.

Source references: [main admin navigation](../../apps/frontend/app/admin/page.tsx), [overview/inventory gate](../../apps/backend/src/operations-product/operations-product.service.ts), [Classifieds validation](../../apps/backend/src/classifieds/ad.validation.ts), [product review](../../apps/backend/src/products/product.service.ts), [profile review](../../apps/backend/src/moderation/profile-review-write.ts), [verification review](../../apps/backend/src/moderation/verification-review.service.ts), [document review](../../apps/backend/src/media/driver-document-review.service.ts), and [Taxi approval](../../apps/backend/src/taxi/taxi-operational-approval.service.ts). Floot source includes `pages/platform.admin.reviews.tsx`, the review/evidence GET endpoint/schema pairs and their projection/transport/options helpers. The following pass adds `helpers/khedmahApprovalExecution.tsx`, `khedmahApprovalTransport.tsx`, its spec and the `khedmah_approval_POST` endpoint/schema pair, with eight existing integration/UI/spec files modified. Existing admin/manage adapters and generic transport retain their separate scopes. GitHub baseline `7db8c7d39222fc6cc16df660b3eb2e6686db1d03` has five successful workflows with the known deployment/evidence/production-secret skips; [CURRENT-STATE](../project-control/CURRENT-STATE.md#new-source-capabilities-and-the-serving-version) links the exact runs/jobs. Those checks do not certify this documentation successor or separate Floot bytes.

**Next Safe Action:** establish the exact compatible Preview source/artifact and applicable release, schema and server-role contracts before reviewing activation of the false execution constant. Prove modern queue/evidence/revision support and atomic latest/self/pending enforcement; do not replace this with health tags or preflight. Execute target-specific deployment, schema or binding changes only after their existing applicable gates and scoped authorization are verified; none occurred in this checkpoint. Preserve the existing director, completed native reads/compatibility receipts and accepted Safari evidence. No administrator reset or publication occurred, and a default Cloud Shell/Staging rollout is not the continuation. Bounded live decisions and activation remain subject to their existing applicable gates and scoped authorization; Production retains its existing release-authorization requirement.

## Nonproduction activation handoff — 2026-10-21

The owner resumed the completed admin-permissions work after the previous session stopped. [PR #288](https://github.com/khedma-sy/khedmah-digital-v1/pull/288) is already merged into `main` at `63b0fa3c6f886eebe8034f70780715a044c2d4d5`. [PR #289](https://github.com/khedma-sy/khedmah-digital-v1/pull/289) contains the remaining 035/037 schema-stage integration and its reviewed source repair. Its tested head is `5229089f449668ca5bebdb5c1186f668e905e7b9`; the control-document successor does not change application, migration, workflow or test source. Do not rebuild the role or repeat completed Preview bootstrap/grants.

The earlier proposal uses the existing **Staging** helper. It is retained as a conditional preparation proposal if a separate Staging rollout is selected; it is not the global website next action, a recorded activation or permission to execute. GitHub's configured Staging target and protection settings were read directly on 2026-10-21 at 13:28 UTC, as recorded below. Actual cloud resources, database state, dedicated-workflow WIF acceptance and the choice of an additional bounded reviewer for that target remain unverified. The existing application administrator is known and working. Configured GitHub values are not proof of current cloud state.

### What each migration does

| Item | Purpose and prerequisite |
| --- | --- |
| `035_specialized_admin_roles.sql` | Extends the separate `admin_roles` constraint for `taxi_pricing_admin` and `category_admin`. It does not assign `smart_admin_approver` or bind an account. |
| `036_classifieds_rolling_publication_quota.sql` | Supplies the rolling Classifieds quota function. The Classifieds runner owns this migration. The 035/037 runner requires its exact canonical definition and ownership by `khedmah_migrator`, as well as canonical 034. |
| `037_verification_evidence_media.sql` | Extends two constraints on existing `media_assets` for private business/professional evidence. It creates no new tables or generic runtime grants. The current backend requires schema 037 before startup. |
| `OPERATIONS_PRODUCT_ROLE_BINDINGS` | Supplies the human reviewer's role at runtime. This remains a separate, explicitly reviewed account-binding change after schema readiness. |

Sources: the three [migration files](../../backend/migrations/versions/), [035/037 runner](../../scripts/deployment/run-approval-prerequisites-035-037-nonproduction-migration.sh), [backend compatibility gate](../../apps/backend/src/database/database.migrator.ts), and [runtime role resolver](../../apps/backend/src/operations-product/operations-rbac.service.ts).

### Live GitHub configuration readback

Read-only sources: [Staging environment](https://github.com/khedma-sy/khedmah-digital-v1/settings/environments/21654680357/edit), [Actions secret names](https://github.com/khedma-sy/khedmah-digital-v1/settings/secrets/actions), and [Actions variables](https://github.com/khedma-sy/khedmah-digital-v1/settings/variables/actions). No setting was saved and no secret payload was read.

| Configured Staging target | Observed value |
| --- | --- |
| Project / Firebase project | `khedmah-digital-staging-503812` |
| Project number / region | `238556897388` / `me-central1` |
| Cloud SQL connection | `khedmah-digital-staging-503812:me-central1:khedmah-staging-db` |
| Artifact Registry / media bucket | `khedmah-staging` / `khedmah-staging-media-238556897388` |

The readback established concrete configuration gaps before any activation:

| Field or boundary | Observed state | Required reconciliation |
| --- | --- | --- |
| Staging's `PRODUCTION_GOOGLE_CLOUD_PROJECT` and `PRODUCTION_FIREBASE_PROJECT_ID` | Both still `khedmah-prod-836235-260919` | Canonical exclusion is `khedma-dl`, also shown in current Production/Preview variables. The current source validator rejects the stale Google project value before authentication. |
| Staging's `PREVIEW_GOOGLE_CLOUD_PROJECT` and `PREVIEW_FIREBASE_PROJECT_ID` | Both still `khedmah-preview-774201339973` | Current Preview variables identify `khedmah-preview-v2-20261012`; reconcile those separation references. |
| `GCP_STAGING_MIGRATION_SERVICE_ACCOUNT` | Absent from the inspected Staging and repository secret-name lists | Read back the actual isolated migrator identity before proposing its GitHub binding. Do not infer that the cloud resource is absent merely because the GitHub reference is missing. |
| `STAGING_DATABASE_MIGRATION_SECRET_VERSION` | Absent from Staging's 15 variables; repository has no variables | Read the enabled numeric version metadata from the Staging migration secret; do not guess or copy Preview's version. |
| Staging Environment protection | Required reviewers unchecked; wait timer unchecked; administrator bypass enabled; deployment branches/tags show `No restriction` | The current environment is not evidence of the protected approval boundary required by the future activation workflow. Prepare and approve that boundary explicitly. |

These findings concern the proposed Staging deployment configuration. They do not invalidate the completed admin feature, working director or published site, and do not establish live database/account state. If that separate rollout is selected, its next prerequisite is target metadata/schema readback plus the narrowly scoped configuration/activation proposal. The current global next action is the Floot contract work above; no workflow dispatch or `develop` push is justified by these observations.

### Required target record

Read back environment-specific target values before finalizing the runnable activation proposal. The final reviewed integration SHA, dedicated workflow authority and reviewer binding are execution gates, not prerequisites for preparing their source changes. Mark unresolved fields explicitly; do not fill them from a naming convention or request execution authorization as though they were verified.

| Required field | Evidence needed | State at this checkpoint |
| --- | --- | --- |
| Source | Reviewed integration SHA containing PR288 and PR289; exact checkout and dispatch SHA must match | PR288 merged; PR289 Draft/unmerged |
| Project and resource identity | `STAGING_GOOGLE_CLOUD_PROJECT`, project number, region, Artifact Registry, Cloud SQL connection, database `khedmah`; prove environment isolation | GitHub values recorded above; actual cloud resources/database not read back |
| Execution identities | Actual deployer, runtime and migrator service-account resources; runtime and migrator must differ; database/current/session user must be `khedmah:khedmah_migrator:khedmah_migrator` | Deployer/runtime secret names present; migrator reference absent in inspected lists; actual cloud identities not read back |
| Migration credential | Enabled, positive numeric `STAGING_DATABASE_MIGRATION_SECRET_VERSION` for `DATABASE_MIGRATION_URL` in this Staging project | GitHub version variable absent; cloud version state not read back |
| Schema state | Exact 034/036 definitions and 036 function ownership; classify 035/037 as predecessor, resumable or complete with the existing runner's contract | No live Staging receipt |
| Activation authority | Dedicated workflow, protected Environment review, exact repository/develop WIF condition and scoped cloud permissions | Workflow absent; current Staging has no required reviewer/branch restriction; cloud WIF/IAM unverified |
| Runtime readiness | Existing Staging Firebase/media/email bindings, current application revision and role-binding version metadata | GitHub target references present; actual runtime and role-binding version not read back |
| Additional bounded reviewer | Explicit choice of application identity and proposed additive role change for this Staging rollout | Existing director identity is known; the separate bounded delegation/test identity is not selected. Do not infer it from GitHub/cloud-operator identity or replace the director. |

The existing [Staging discovery script](../../scripts/deployment/discover-staging-github-config.sh) reads resource metadata and secret-version states without secret payloads. Reuse it with a confirmed target and explicit region; then use the existing [configuration validator](../../scripts/deployment/validate-staging-deployment-config.sh) and [cloud-resource validator](../../scripts/deployment/validate-staging-cloud-resources.sh) where their prerequisites are met. Discovery checks the **general** Staging workflow's WIF reference, so its success does not prove the dedicated activation workflow's authority. A Cloud Run helper invoked in `verify` mode still builds an image and deploys/executes a Job; it is not a cloud-read-only metadata operation.

### Dedicated workflow boundary

The reserved path is `.github/workflows/staging-approval-prerequisites-activation.yml@refs/heads/develop`. It is intentionally absent from PR289. A separate source change must implement and review it against the target record above before any activation:

- Reuse the existing 035/037 helper, image and pinned SQL. The workflow must validate explicit dispatch, canonical repository/develop, exact source/checkout/identifier, run ID, attempt 1 and the existing explicit confirmation contract.
- Limit OIDC to the protected activation job. Review the Environment, WIF condition, impersonation and target-resource authority together. The current shell provenance checks and general Staging deployer configuration alone do not establish this boundary.
- Persist the Cloud Run Job as `verify` with empty confirmation; use `apply` only as the single authorized execution override. Capture the exact workflow run, source SHA, image/job/execution identity and schema readback. Reconcile an ambiguous or partial execution before issuing another dispatch.
- Keep the general Preview/Staging deployment's 035/037 stage verify-only. Do not add an activation input to that workflow or use a push to `develop` to prepare missing schema. Its earlier migration stages retain their own behavior and could mutate the database before the 035/037 gate stops deployment.

### Ordered execution after the relevant approvals

1. Collect the target metadata and database readback. Prepare the exact repair/execution proposal for any missing or drifted 034/036 under the existing schema-release governance, and obtain the relevant owner authorization before any persistent change. For absent 036, review the narrowly selected Classifieds migration execution, including its migrator identity and pinned credential; the current general Staging profile's runtime identity/`DATABASE_URL:latest` is not evidence of the required function ownership. Do not replay the whole deployment.
2. Complete the separate activation source review and obtain the corresponding authorization before integration or any live mutation; then execute the approved target-specific plan. Apply only the missing 035 then 037 through the retained helper, or verify a proved completed state. Record completion and exact schema readback before application deployment.
3. Prepare the additive `smart_admin_approver` binding for the confirmed lowercase application email, preserving all other mappings and roles. Review the current mapping before writing it. Existing broader roles remain effective because permissions are a union; do not describe an already broad administrator as an approval-only test identity or silently remove their roles.
4. Deploy the reviewed application revision to that same Staging environment with the authorized role-binding version available. The normal deployment verifies 035/037. A role-binding secret update alone does not refresh an already running process. Record the resolved revision and binding version, and keep Taxi trips disabled.
5. Run the live acceptance matrix below with approved nonproduction fixtures. A successful source workflow or public health response is not a substitute for these authenticated checks.

### Live acceptance receipts still required

Use a reviewer with only the bounded role, a separate ordinary account and separately owned test records. If the intended administrator has broader roles, use a separately approved bounded test identity for denial checks. Record non-secret outcomes and revision/audit identifiers, without copying evidence images, tokens or secret payloads into GitHub.

| Surface | Required positive receipt | Required denial/current-state receipt |
| --- | --- | --- |
| Classifieds | Read and approve an eligible pending ad at its displayed review revision | Ordinary-account, self-review, stale revision and rejection denial; preserve PR287's separate publication/quota behavior |
| Store | Review displayed photos, description and price; approve an eligible, separately owned product | Self-review, stale revision, rejection and owner-content/price-edit denial |
| Business/professional content | Approve an eligible current profile revision | Self-review, changed revision, rejection and suspension denial |
| Private business/professional evidence | Open the current pending request's images; accept that exact evidence state with human notes | Ordinary-account/self-review and stale/superseded decision denial; evidence access requires the latest pending request and current asset authorization, and ends when that latest request is decided or the asset is no longer authorized; suspended business trust cannot be reactivated |
| Driver/vehicle documents and Taxi authority | Open and accept latest pending documents; approve an eligible driver/vehicle/zone only after all four current documents pass | Self-review, superseded documents, missing prerequisites, stale revisions, rejection and suspend/revoke denial; no trip activation |
| Admin shell and audit | Open the bounded shell and observe the domain's authenticated review/audit record | No operational inventory, KORA, security, RBAC, billing or release authority; ordinary account cannot enter approval routes |

The recorded real Safari lifecycle and positive director acceptance are complete within their scope. Real signed-in non-admin denial, safe server-side revocation/replay and the new bounded role's domain acceptance remain separate receipts; do not reopen the completed owner/Safari tests merely because old notes request them. Production migration, deployment and role binding retain their separate release gates.
