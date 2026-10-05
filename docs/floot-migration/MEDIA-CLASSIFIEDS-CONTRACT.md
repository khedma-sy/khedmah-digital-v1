# Khedmah to Floot — media, Classifieds ownership and moderation

Status: bounded source-backed contract and open findings; NOT Production, PostgreSQL, browser or Floot acceptance.
Pinned source: `khedma-sy/khedmah-digital-v1` at `a2a26f8b27e63a2e041e43d5657cf2ce78700c24`.
Review date: 2026-10-05. No executable source, schema, infrastructure or deployed configuration changed by this slice.

## 1. Source owners and scope

| Source at the pinned commit | Scope reviewed |
| --- | --- |
| [MediaController](../../apps/backend/src/media/media.controller.ts), [MediaService](../../apps/backend/src/media/media.service.ts), [validation](../../apps/backend/src/media/media.validation.ts), [types](../../apps/backend/src/media/media.types.ts) | Shared upload/list/read/delete, parent ownership, visibility and review invalidation. |
| [storage.adapter.ts](../../apps/backend/src/media/storage.adapter.ts) | Server-side storage selection, object write/read/delete and failure boundaries. |
| [AdController / AdminAdController](../../apps/backend/src/classifieds/ad.controller.ts), [AdService](../../apps/backend/src/classifieds/ad.service.ts), [AdRepository](../../apps/backend/src/classifieds/ad.repository.ts) | Classifieds routes, owner/reviewer gates, publication, revisions, quota and receipts. |
| [AdMediaController](../../apps/backend/src/classifieds/ad-media.controller.ts), [AdMediaService](../../apps/backend/src/classifieds/ad-media.service.ts), [image validation](../../apps/backend/src/classifieds/ad-media.validation.ts) | Dedicated Classifieds image writes and owner/public/reviewer reads. |
| [Ad validation](../../apps/backend/src/classifieds/ad.validation.ts), [types](../../apps/backend/src/classifieds/ad.types.ts), [moderation assessment](../../apps/backend/src/classifieds/ad-moderation-assessment.ts) | Accepted fields, statuses and advisory Smart Admin signals. |
| [driver-document controller](../../apps/backend/src/media/driver-document-review.controller.ts), [service](../../apps/backend/src/media/driver-document-review.service.ts) | Narrow private-document ownership/reviewer exception; no complete Taxi/courier certification. |
| [025 Classifieds](../../backend/migrations/versions/025_classifieds.sql), [027 document review](../../backend/migrations/versions/027_mobility_document_reviews.sql), [AdSchemaGuard](../../apps/backend/src/classifieds/ad-schema.guard.ts) | Source constraints, receipts/review records and startup probe; no migration execution. |
| [classifieds-client.ts](../../apps/frontend/lib/classifieds-client.ts), [classifieds.ts](../../apps/frontend/lib/classifieds.ts) | Same-origin credentialed JSON requests, error decoding, flag and request-key helpers. |
| [IdentityService](../../apps/backend/src/identity/identity.service.ts), [app.ts](../../apps/backend/src/app.ts), [global filter](../../apps/backend/src/filters/global-exception.filter.ts) | Existing session, API prefix, body limit and error transport relevant to this slice. |

The relevant [SITE-ATLAS](../operations/SITE-ATLAS.md) owners are `/classifieds`, its detail/new/manage/edit pages, `/courier-signup` and `/admin/driver-documents`. Ad is independent of Store Product; these Classifieds paths do not implement a cart, payment, commission or order. Full page behavior, account erasure, storage lifecycle policies and other moderation modules remain outside completed scope. Preserve the companion [authentication](AUTH-API-CONTRACT.md) and [error/access](ERROR-PROFILE-ACCESS-CONTRACT.md) contracts.

## 2. Identity and enablement are server boundaries

Protected calls resolve the Khedmah cookie through `IdentityService.getCurrentUser`; the inspected session path requires a live session, an account with `account.status === 'active'`, and a profile. A Floot role label, request-body owner ID or hidden button cannot replace that check. Ad ownership comes from `ad_listings.owner_user_id`; migration 025 makes the Ad ID and owner immutable. Linking a business checks current business ownership on create/content update; it does not transfer Ad ownership.

Every AdService and AdMediaService entry requires backend `CLASSIFIEDS_ENABLED === 'true'`; otherwise it throws 503. Frontend `NEXT_PUBLIC_CLASSIFIEDS_ENABLED === 'true'` is a separate build-facing visibility flag, not API authorization. Shared MediaService and driver-document routes do not use the Classifieds flag. Both modules are registered in [AppModule](../../apps/backend/src/app.module.ts).

When enabled, AdSchemaGuard checks specified tables, functions, indexes, triggers and media constraint strings for schema 025. This presence probe does not certify the complete migration ledger, role privileges or later document schema. `GCS_MEDIA_BUCKET` selects GCS; missing/blank bucket fails initialization for normalized `NODE_ENV=production` or `staging`. Other environments may use a process-local Map, whose success is not durable-storage evidence. This review did not read live flag, bucket, IAM or schema state.

## 3. Exact route inventory

All paths below are relative to `/api/v1`. The controller return shapes are source contracts; the real middleware/error stack still applies.

| Shared media route | Authority and result |
| --- | --- |
| POST `/media` | Current parent owner; base64 JSON upload; returns one media metadata object. |
| GET `/media/:ownerType/:ownerId` | Current parent owner, checked before and after the metadata query; returns an array. |
| GET `/media/public/:id` | Public eligibility or authorized owner/reviewer fallback; returns image bytes. The name `public` does not make every asset anonymous. |
| DELETE `/media/:id` | Stored uploader plus branch-specific parent checks; returns `{ deleted: true }`. The Ad bypass finding below is material. |

| Classifieds route | Authority and result |
| --- | --- |
| GET `/classifieds?q=&categoryCode=&cityCode=&page=` | Anonymous discovery; `{ ads, total, page }`, page size 20; page 1–100000. |
| GET `/classifieds/:id` | Anonymous public projection; `{ ad }` or not-found. |
| GET `/classifieds/mine`, GET `/classifieds/mine/:id` | Current Ad owner; `{ ads }` (at most 200) or `{ ad }`. |
| GET `/classifieds/quota` | Current account; `{ used, limit: 3 }`. |
| POST `/classifieds` | Current account plus validated content and `clientRequestId`; creates a draft; `{ ad }`. |
| PATCH `/classifieds/:id` | Current Ad owner; content patch, `clientRequestId`, `expectedContentRevision`; `{ ad }`. |
| POST `/classifieds/:id/submit` | Current Ad owner; `clientRequestId`, `expectedContentRevision`; `{ ad }`. |
| POST `/classifieds/:id/deactivate`, POST `/classifieds/:id/reactivate` | Current Ad owner; `clientRequestId`, `expectedRevision`; `{ ad }`. |
| GET `/admin/classifieds/pending` | `security.manage`; up to 200 pending Ads with advisory `smartAdmin`; `{ ads }`. |
| PATCH `/admin/classifieds/:id/moderation` | `security.manage`; review revision, assessment version, decision and optional reason; `{ ad }`. |
| POST `/classifieds/:id/media` | Current Ad owner; validated image, request key and content revision; `{ adRevision, contentRevision, image }`. |
| GET `/classifieds/:id/media` | Current Ad owner; `{ images }`. |
| GET `/classifieds/:id/media/:mediaId` | Current Ad owner and stored uploader must both match; returns image bytes. |
| DELETE `/classifieds/:id/media/:mediaId` | Current Ad owner and stored uploader; request key/content revision; `{ deleted: true, adRevision, contentRevision }`. |
| GET `/classifieds/media/public/:mediaId` | Anonymous eligible Ad image; returns bytes. |
| GET `/admin/classifieds/media/:mediaId` | `security.manage`; eligible review image; returns bytes. |

## 4. Publication, revisions and human moderation

| Actor/action | Existing transition and guard |
| --- | --- |
| Owner creates | New Ad is `draft`; no free slot consumed. |
| Owner edits content or uses dedicated image writes | Rejects `active` and `pending_review`; requires current content revision. `rejected`/`expired` becomes `draft`; `draft`/`inactive` stays unchanged. Increments overall and content revisions. |
| Owner submits | `draft`, `inactive` or `rejected` → `pending_review`; requires current content revision and future expiry if supplied. Increments overall/review revisions. |
| Owner deactivates | `active` → `inactive`; requires current overall revision. It cannot withdraw `pending_review`. |
| Owner reactivates | `inactive` → `pending_review`, never directly public; current overall revision and future expiry required. |
| Reviewer approves/rejects | Only `pending_review` with matching review revision → `active`/`rejected`; increments overall revision and records the decision with reviewed content/review revisions. |

Approval additionally requires unexpired content and a linked business, if present, that is public, approved, trusted and active. Public Ad detail/list/count and public image queries repeat status/expiry/business eligibility predicates. Expiry can hide a row still stored as `active`; no automatic status-changing expiry worker is established by this slice.

Moderator authority is the server-side Operations RBAC `security.manage` permission, separate from account IDs and database roles. Decision validation requires `expectedAssessmentVersion: 'classifieds-smart-admin-v1'`, positive `expectedReviewRevision`, and `decision: 'approved' | 'rejected'`. Rejection needs a trimmed reason of 2–2000 characters; approval cannot carry one. The repository locks the Ad and writes its decision/event in a transaction.

Smart Admin evaluates structural signals such as missing description/image, direct contact, unlinked/profile-only contact, price mismatch and invalid review revision. It sets `humanDecisionRequired: true` and `automatedDecisionAllowed: false`; it neither reads image contents nor grants publication. The controller prioritizes elevated items within the oldest 200 fetched pending records, retaining FIFO order within a priority. This is not a globally complete moderation queue or automated image-safety certification.

First submission inserts one durable free slot for that Ad; an advisory-lock trigger limits the account to three slots. Later submissions of the same Ad reuse it. Rejection, deactivation and expiry do not refund a slot in these paths; slot/receipt/moderation tables reject update/delete in migration 025. There is no Ad deletion endpoint in the inspected controllers. Do not invent a reset period or equate quota with currently active Ads.

Ad request keys are scoped by account/action and fingerprint. A repeated compatible key returns the current Ad, not a frozen historical response; a different payload on the same key conflicts. Content revision, overall revision and review revision have different purposes. Client request keys are 16–100 characters from `[A-Za-z0-9_-]`; do not substitute a new key while recovering an uncertain result.

## 5. Upload, intents, finalize and object lifecycle

There is no upload-intent, signed-upload-URL or finalize endpoint in these controllers. Both upload paths accept base64 in JSON and perform storage writes on the backend. A successful GCS object write alone does not complete the application operation: media metadata/revision/receipt writes still have to commit. Migration must preserve this one-request protocol unless a separately authorized design changes it.

Both paths allow JPEG/PNG/WebP, declared size from 1 byte through 5 MiB, and check decoded length plus short MIME signatures. This is not full image decoding, metadata removal, malware inspection or image moderation. The app declares a 7 MiB JSON body limit. Shared validation additionally limits encoded length and its alphabet; Ad image validation only requires a nonempty encoded string before decoding/length/signature checks. They are not identical validators.

Shared upload accepts `ownerType`, `ownerId`, `filename`, `mimeType`, `sizeBytes`, `content`, optional `visibility`, `assetType`, `sortOrder`. Allowed owner types are business/professional profile, product listing and user, excluding Ad. Visibility defaults to `public`. Product requires `product_image`; business driver-document types require `private`. Shared metadata omits storage key/uploader ID but retains parent type/ID, filename, visibility and a public API URL when applicable.

Shared business/profile/product writes recheck ownership while locking the parent. Gallery limit is 12; product images are limited to five under the product lock. Business logo/cover replacement retires previous metadata in the transaction and attempts object cleanup afterwards. Profile media changes move moderation to `pending` while preserving `suspended`; product media changes set draft/pending and clear rejection. User media has no corresponding parent-review invalidation. Shared upload generates a new UUID each time and has no inspected request-receipt replay protocol.

Dedicated Ad image upload accepts only `clientRequestId`, `expectedContentRevision`, `filename`, `mimeType`, `sizeBytes`, `content`, optional `sortOrder` (0–1000); unknown keys are rejected. It derives image ID from account/Ad/request key, fingerprints content bytes and metadata, locks the request key and Ad, enforces five images, and stores `owner_type='ad_listing'`, `asset_type='ad_image'`, `visibility='public'`. A public-marked image remains unreadable anonymously while its Ad is a draft or awaiting review.

Ad image upload/delete changes metadata, content revision and receipt in the database transaction. Upload saves the object during that transaction, but object storage is outside PostgreSQL rollback. Delete commits metadata removal before best-effort object deletion; a cleanup failure still returns logical deletion. An upload replay requires the original image row still to exist; replay after a later deletion is not a guarantee of the old success result. No cleanup worker, orphan inventory or uncertain-commit repair is verified here.

## 6. Read authority and account privacy

Shared image reads resolve metadata/authority, read storage, then repeat metadata/authority checks and compare key/parent. Public eligibility is parent-specific:

| Parent | Shared anonymous read predicate |
| --- | --- |
| Business | Public visibility, approved moderation/trust and active status. |
| Professional | Public visibility, approved moderation and active lifecycle. |
| Product | Active/approved Product and public/approved/trusted/active business. |
| User | Active account and active account lifecycle; no profile-visibility predicate in this query. |

When anonymous eligibility fails, the shared endpoint may admit the authenticated current parent owner. A `security.manage` reviewer fallback is limited to public-marked business/professional/product media; it does not authorize arbitrary private documents or user files. Shared owner lists filter private rows to the stored uploader, although the shared read fallback uses current parent ownership. Shared deletion initially requires the stored uploader and additionally locks/checks current profile/product ownership in those branches. These are distinct rules when ownership changes.

Dedicated Ad owner/public/reviewer image reads also check metadata before and after storage and compare key/parent. Reviewer images must be public-marked, unexpired and attached to `pending_review`, `active` or `rejected`; that path intentionally omits linked-business public eligibility, but does not expose drafts/inactive Ads. A pending queue entry can therefore outlive its image-review eligibility after expiry.

Public Ad projection removes `ownerUserId`, rejection reason and three revisions. It retains advertised contact mode/value, linked business, content, location text, image URLs and timestamps. Public Ad/image SQL does not check the owning account's active status/lifecycle or ongoing equality between Ad owner and linked-business owner. Active-session checks on owner writes alone do not prove account suspension/erasure removes published content. Profile contact without a linked business is an advisory signal, not an enforced link requirement in the inspected validator.

Shared and Ad owner/reviewer binary endpoints declare `Cache-Control: private, no-store` and `Vary: Cookie`; the anonymous Ad image endpoint declares private/no-store without Cookie variation. These declarations do not certify actual browser/proxy handling. Authenticated JSON responses and an adapter's own caching need separate acceptance.

## 7. Private driver-document exception

| Route relative to `/api/v1` | Observed authority |
| --- | --- |
| GET `/driver-documents/review-queue` | `security.manage`; latest document per type for Taxi/courier businesses, included only when that latest document is pending; at most 200 businesses. |
| GET `/driver-documents/business/:businessId` | Current business owner or `security.manage`; private driver-document metadata and secure content URL. |
| GET `/driver-documents/:id/content` | Stored media uploader or `security.manage`; private driver-document bytes. |
| POST `/driver-documents/:id/review` | `security.manage`; request field `status` is `approved` or `rejected`, rejection reason 5–500 characters. |

The four types are driver photo, identity card, driving licence and vehicle licence. Migration 027 enforces private business media and creates pending review rows on insert. Review locks business/document, upserts the decision and inserts a review event; rejecting a Taxi/courier document makes that business private with moderation/trust pending. Approval alone does not publish the business or grant Taxi/courier operational authority.

The dedicated content read checks stored uploader, not current business owner, and has no post-storage metadata/authority recheck. Its authorization differs from its list route and shared-media reads. Migration 027 also cascades deletion of a media asset to its document-review and review-event rows; do not describe those events as immutable retained audit evidence. Neither transfer privacy nor review-history retention is resolved by this mapping.

## 8. Prioritized unresolved findings and acceptance work

Priorities below order follow-up; they are source findings and required acceptance, not newly reproduced live incidents or approved implementation changes.

| ID / priority | Source finding | Required closure before relying on the boundary |
| --- | --- | --- |
| MC-01 / P1 | At the pinned `a2a26f8...` source, shared `DELETE /media/:id` accepts an existing `ad_listing` row through its generic fallback after uploader-ID equality. It bypasses the dedicated Classifieds flag, Ad lock, content revision, review-state lock and receipt/revision update. | Bounded fix `6648fc9...` is merged through #251 at `dba1b5ee...`, with all nine exact-head source checks passed. Actual authority/SQL/browser acceptance and Production rollout remain separate; see the follow-up evidence below. |
| MC-02 / P1 | Private document content uses stored uploader authority with no post-storage recheck; current-owner listing uses a different rule. Review events are deleted by the schema cascade when the asset is removed. | Decide transfer/revocation and retention requirements; verify old/new owners, reviewer access, delete-during-read and retained decision evidence with real SQL/HTTP. |
| MC-03 / P1 | Public user media defaults public and checks account activity without profile visibility. Public Ad/image queries omit account activity and linked-owner equality; public contact remains disclosed. | Define and verify account suspension/privacy/erasure and linked-business transfer behavior; preserve explicit contact disclosure. Do not claim automatic unpublication or silently change policy. |
| MC-04 / P2 | At the pinned source, the Classifieds client reads top-level `message`/`code`; the installed global filter returns nested safe errors and reduces domain 409/429 exceptions to `request_error`. | Decoder correction `5b21217...` is merged through #252 with its source gates complete. The separate [two-handler 429 implementation](#mc-04-429-presentation-follow-up--2026-10-05), `08b116a8...`, has 20 passing local cases and completed independent review; its own head gates remain pending. Broader recovery acceptance remains OPEN; a repository exception code is not proof that the browser receives it. |
| MC-05 / P2 | Object save/delete is not atomic with SQL; cleanup is best-effort, shared uploads are not receipt-idempotent, and an Ad upload replay after image removal can fail. | Exercise lost responses, storage failures, commit uncertainty and replay after removal; define orphan reconciliation without deleting an object on uncertain commit. |
| MC-06 / P2 | Pending withdrawal has no owner endpoint; public expiry does not establish stored `expired` status; reviewer image expiry differs from queue inclusion. Owner/reviewer lists cap at 200. | Specify recovery/expiry and queue-completeness acceptance; do not label capped lists complete or invent unsupported withdrawal/renewal behavior. |

Additional adapter acceptance remains open: ordinary owner versus unrelated account versus reviewer across every mapped route; flag combinations; validation/size boundaries; stale media/content/review revisions and concurrent five-image/quota limits; visibility or ownership changes during reads; contact projection; actual cookie/CSRF/error transport; and browser upload/view/delete/review journeys against the same pinned backend. A passed metadata-only listing is insufficient image-byte or moderation acceptance.

## 9. Evidence and next bounded action

The original mapping pass inspected repository source and schema text against the pinned main commit. All 25 linked executable/schema source files byte-matched `git show` at that SHA; every relative link resolved and the whitespace check emitted no diagnostics. That pass introduced only this document and ran no application tests, PostgreSQL, browser/Floot journeys, cloud commands, secret reads, workflow dispatch or Production mutation. Existing tests were not re-executed or re-certified by the mapping. Source transaction/lock intent and schema declarations remain distinct from runtime proof.

### MC-01 implementation follow-up — 2026-10-05

Implementation commit: [`6648fc9f017ac449edc6603702b6ba279e7e8e54`](https://github.com/khedma-sy/khedmah-digital-v1/commit/6648fc9f017ac449edc6603702b6ba279e7e8e54), based on `a2a26f8...` and preserved when integrating documentation main `b7b6d0aa6c06d7b9650158f5e49569656eb8aa4d`. The five-line guard in [MediaService](../../apps/backend/src/media/media.service.ts) rejects a database row whose stored `owner_type` is `ad_listing`, after existing authentication/missing/uploader checks and before any transaction, metadata write or object-storage call. Ad images must use the existing dedicated Classifieds lifecycle. No endpoint, schema, role, feature flag, revision policy or ordinary-media deletion branch was added or replaced.

The new [HTTP regression fixture](../../apps/backend/src/media/media-delete-http.test.ts) uses the real Nest controller/service and HTTP listener with isolated identity, database and object-storage doubles. Its 17 cases cover nine Ad-state/feature-flag fixture combinations, spoofed request owner fields, absence of mutations, existing authentication/not-found responses, ordinary-media success and transferred-parent rejection. Running that fixture against unmodified `a2a26f8...` reproduced nine failures (HTTP 200 instead of 403); all eight controls passed.

On Node.js `v24.19.0`, the new fixture plus existing `media-access`, `media-http` and dedicated `ad-media.service` tests passed **26/26**, zero failed/skipped; the backend TypeScript build and whitespace check passed. An independent security reviewer found no blockers after removing an assertion on default-Nest raw error text. Reviewed Git blobs: service `234146c4e2d2a214313f579c5ab4faae91af1c9b`, new test `2cf556b7f057c3e7f536d231b0e12497426d4a62`.

PR #251 merged this source into `dba1b5ee94b69ffbc305ddfeff6a3b99c5661ae2` at `2026-10-05T07:33:24Z`, after all nine required checks passed on exact head `1ca322cb9e75eb4346860ba706dae7be7ac7e51e`. CI reported 2415 passing tests. One isolated Preview evidence retry passed 64/64 primary, 72/72 supplementary and 32/32 mobile cases, with empty Classifieds data; the first attempt's timeout and partial artifact remain recorded in [CURRENT-STATE.md](../project-control/CURRENT-STATE.md). Its Preview services were subsequently cleaned up. Real PostgreSQL, live identity, the complete middleware/error stack, authenticated browser journeys and Floot acceptance remain separate gates. MC-01's wider acceptance remains OPEN, as do MC-02 through MC-06; no Production deployment is certified.

### MC-04 implementation follow-up — 2026-10-05

Implementation commit: [`5b21217bc610a656850755e9084169e56217b563`](https://github.com/khedma-sy/khedmah-digital-v1/commit/5b21217bc610a656850755e9084169e56217b563), on `fix/classifieds-error-transport-2026-10-05`. The [Classifieds client](../../apps/frontend/lib/classifieds-client.ts) now uses the existing [shared decoder](../../apps/frontend/lib/api-errors.ts) for canonical, legacy and malformed error envelopes. The wrapper preserves HTTP status, decoded message/code, request bodies, revisions, request keys and one-attempt behavior. The global filter is unchanged; suppressed domain conflict/quota/image codes are not reconstructed or exposed. Error redaction remains the server filter's responsibility; the shared decoder is not a general sanitizer of arbitrary third-party payloads.

Targeted local runners reported **18 frontend + 12 backend + 11 root entries = 41 total**. These are runner counts across the selected suites, not 41 new independent journeys. Evidence includes [client regressions](../../apps/frontend/tests/classifieds-error-contract.test.ts), [Nest HTTP/filter/client tests](../../apps/backend/src/classifieds/ad-client-error-http.test.ts) and the updated [admin-client lifecycle test loader](../../tests/admin-classifieds-review-lifecycle.test.mjs). The HTTP fixture uses the real controller, installed `GlobalExceptionFilter` and client with injected service failures, covering safe 400/401/409/429/503 responses without retrying rejected writes. It does not exercise real authentication, SQL, the complete middleware stack or browser/Floot recovery.

Reviewed Git blobs at that commit: client `db33bd8d06cf49afebce56d13513aa1a06b60a9d`; frontend tests `694dc8254bddacc2eb4d1bef438e84bc47e053fd`; HTTP tests `9f51f792aa61642917e0e93cd1f35b3f1145d3e4`; root test `c353e0b89b8da6504d9035f4975ce7bcad8ca58b`. PR #252 merged this correction through accepted head `01f1a9e934b130fee613e8f65cb55743a615b333` into `e61d1142c3aa9d03ae63798b6b0987bc799a879d`, after its own CI and complete Preview. [CURRENT-STATE.md](../project-control/CURRENT-STATE.md) records the exact runs and empty-fixture limits; broader recovery acceptance and Production deployment remain separate gates.

The decoder change did not correct the separate 429 presentation issue in either the new-Ad or editor submission handler. That bounded follow-up is recorded below. MC-01's broader authority/SQL/browser acceptance also remains OPEN.

### MC-04 429 presentation follow-up — 2026-10-05

Created implementation commit: [`08b116a84b713d646b70d20c46136ab1181e0775`](https://github.com/khedma-sy/khedmah-digital-v1/commit/08b116a84b713d646b70d20c46136ab1181e0775), parent #253 head `eb5918a2b4ddc25d1d4580e2da82fba40b949ec6`, tree `361e374435a456467b514c6f4dc3768f5f94b155`. It contains three runtime line replacements across the two pages plus the regression fixture below. Final independent source review received at `2026-10-05 09:09 UTC` reported no blockers; the coordinating review also confirmed the runtime diff and that both baseline page blobs are unchanged from `e61d1142...` to this parent. Its own complete head CI/Preview remains pending; no deployed acceptance is claimed.

At baseline `e61d1142...`, both [new-Ad submission](../../apps/frontend/app/classifieds/new/page.tsx) and [editor submission](../../apps/frontend/app/classifieds/manage/[id]/edit/page.tsx) interpret any HTTP 429 as `AD_FREE_QUOTA_EXHAUSTED`. The [shared rate limiter](../../apps/backend/src/middleware/rate-limit.middleware.ts), [registered for Classifieds](../../apps/backend/src/app.ts), can reject before draft creation; the [installed safe filter](../../apps/backend/src/filters/global-exception.filter.ts) maps ordinary rate and quota 429 exceptions to `request_error`. HTTP status alone therefore does not establish the quota cause or prove that a draft exists.

The candidate removes the status-429 inference in those two catch handlers and the new-Ad quota branch's unconditional saved-draft/no-duplicate assurance. It retains explicit `AD_FREE_QUOTA_EXHAUSTED` compatibility when that code is actually supplied. Canonical filtered 429 responses remain generic even when the underlying cause is quota exhaustion; the UI does not reconstruct a suppressed domain code. Request bodies, request keys, revisions, state transitions, retries, quota/rate policy and the backend error contract remain unchanged.

Local Node.js `v24.19.0` command `node --test tests/classifieds-new-draft-lifecycle.test.mjs tests/classifieds-frontend-separation.test.mjs` passed **20/20 = nine newly added + 11 existing cases**, zero skipped; frontend `tsc --noEmit --incremental false` also passed without diagnostics. Against original page blobs `b0d2a1740a7f06246faff2b55f92a308da0a7fbe` and `7911f47006b77e7eacfdbaebb204f5038c646313`, the same final 12 lifecycle cases produced eight semantic failures and four passes. These were behavior failures, not fixture setup failures. The 20-case run is separate from #253's 2479 cases.

Reviewed implementation blobs: new page `8de5a51a30df49d6f48debe62c09a16e2f9d9a8d`; editor `c3d842ae94e3580a884284f51a7efb6d78b4dcd8`; [lifecycle tests](../../tests/classifieds-new-draft-lifecycle.test.mjs) `dc2be016077f2df4f1d27d48fba9dd5cf57474af`. The tests execute actual TSX component behavior through a hook/element harness, mocked APIs and an in-memory `requestId`/`clearRequestId` store. They do not execute a real DOM, browser/sessionStorage reload durability, live HTTP/authentication/SQL or generic-429 cause differentiation.

This is a narrow presentation correction, not closure of MC-04. Other generic fallback no-duplication copy and MC-05 durability behavior are unchanged and remain acceptance work. Real authentication, SQL/receipt concurrency, complete middleware, saved-draft recovery in an actual browser and Floot acceptance remain OPEN. A previous Preview with empty Classifieds data cannot certify those journeys or this new implementation head.

MC findings are indexed in [the implementation/acceptance backlog](IMPLEMENTATION-ACCEPTANCE-BACKLOG.md) and remain open for their stated acceptance. Resume MC-01 and MC-04 from their published source repairs rather than reimplementing them; private-document/account policy decisions remain separately reviewed work. Re-read live main, PR heads, checks and [project-control](../project-control/CURRENT-STATE.md) before selecting that work. This document grants no deployment or data-mutation authority.
