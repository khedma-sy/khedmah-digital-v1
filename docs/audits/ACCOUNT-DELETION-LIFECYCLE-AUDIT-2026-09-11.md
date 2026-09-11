# KHEDMA Account Deletion Lifecycle Audit — 2026-09-11

Status: **BLOCKED FOR DESTRUCTIVE IMPLEMENTATION**

Scope: source-level audit of the current PR #166 release candidate. This document records technical deletion dependencies only. It does **not** choose legal retention periods or legal bases and does not authorize destructive migrations.

## Executive finding

KHEDMA currently exposes an external account-deletion request surface, but it does not implement an end-to-end deletion lifecycle in the backend. A direct `DELETE FROM core_user_accounts` is neither safe nor generally executable because the canonical schema intentionally mixes `CASCADE`, `SET NULL`, `RESTRICT`/`NO ACTION`, polymorphic references without foreign keys, append-only audit structures, and external media/provider state.

The repository's account-lifecycle contract explicitly states that account deletion policies are not yet defined. Until an approved retention/anonymization contract exists, destructive implementation must remain blocked.

## Current request surface

- `apps/frontend/app/delete-account/page.tsx` is a request-only support-email flow.
- `apps/backend/src/identity/users.controller.ts` exposes `GET /users/me` and profile update only; it has no deletion endpoint.
- `apps/backend/src/identity/identity.service.ts` has login/logout/session/profile operations but no account deletion lifecycle and no revoke-all-sessions operation.
- `apps/frontend/app/privacy/page.tsx` states general deletion/limited-retention principles but does not define per-domain retention periods or disposition rules.

## Technical disposition matrix

The `Technical action` column is a source-derived engineering classification, not a legal retention decision.

| Domain / table | Current linkage | Current delete behavior | Technical action before account-root deletion | Policy dependency |
| --- | --- | --- | --- | --- |
| `core_user_accounts` | deletion root | blocked by dependent rows | Delete only after all blocking/explicit-cleanup domains are resolved | Yes |
| `identity_credentials` | direct user FK | `CASCADE` | Delete with account root | No additional technical dependency |
| `identity_sessions` | direct user FK | `CASCADE` | Revoke all sessions before lifecycle execution; account delete then removes rows | Retention/revocation audit policy may apply |
| `password_reset_tokens` | direct user FK | `CASCADE` | Delete with account root | No additional technical dependency |
| `external_identities` | direct user FK | `CASCADE` | Delete local binding; separately decide Firebase/provider identity handling | Yes |
| `email_verifications` | direct user FK | `CASCADE` | Delete with account root | No additional technical dependency |
| `admin_roles` | direct user FK | `CASCADE` | Delete with account root after admin audit dependencies are resolved | Yes for administrative history |
| `audit_logs.actor_user_id` | direct user FK | `SET NULL` | Detach actor automatically if root deletion becomes executable | Yes for audit retention |
| `profiles` | direct user FK | `RESTRICT` | Explicitly archive/delete/anonymize according to approved policy, after dependent professional content | Yes |
| `professional_profiles` | composite parent-profile owner FK | `RESTRICT` | Explicit disposition before base profile | Yes |
| `business_profiles.owner_user_id` | direct user FK | `RESTRICT` | Explicit disposition/transfer/anonymization before account root | Yes |
| `organizations.owner_user_id` | direct user FK | `RESTRICT` | Ownership transfer or organization disposition required | Yes |
| `organization_members.user_id` | direct user FK | `RESTRICT` | Remove/detach membership under approved ownership rules | Yes |
| `service_listings` | polymorphic `owner_type/owner_id`, no parent FK | no automatic cleanup | Explicit delete/retire by owning business/professional identifier before parent removal | Yes |
| `business_opening_hours`, `business_branches`, `business_social_links` | business FK | `CASCADE` | Removed when business profile is removed | Depends on business disposition |
| `supplier_capabilities` | business FK | `CASCADE` | Removed when business profile is removed | Depends on business disposition |
| `product_listings.owner_user_id` | direct user FK | `RESTRICT` | Explicit product disposition before account root | Yes |
| `media_assets.owner_user_id` | direct user FK | `CASCADE` | **Do not rely on DB cascade alone**; capture storage keys and run physical object cleanup | Yes / media-retention rule |
| GCS media objects | external storage | no DB FK can delete objects | Explicit GCS delete/reconciliation path required | Yes; bucket soft-delete also applies |
| `nearby_preferences` | direct user FK | `CASCADE` | Delete with account root | No additional technical dependency |
| `nearby_notifications` | direct user FK | `CASCADE` | Delete with account root | No additional technical dependency |
| `contact_inquiries.submitter_user_id` | direct user FK | `CASCADE` | User-submitted inquiries delete with account root under current schema | Yes: current cascade may conflict with support/security retention needs |
| `contact_inquiries` target business/professional | target FK | `RESTRICT` | Owner deletion can be blocked by third-party inquiries; disposition must be decided before target profile deletion | Yes |
| `contact_submission_idempotency` | user + inquiry FKs | `CASCADE` | Delete with submitter/inquiry | No additional technical dependency |
| `contact_action_events.actor_user_id` | text only, no FK | no automatic cleanup | Explicit detach/delete/anonymize lookup is required | Yes |
| `contact_action_events.business_profile_id` | text only, no FK | no automatic cleanup | Explicit cleanup/detach when target business is removed | Yes |
| `analytics_events` | no user FK; entity/session/anonymous references are textual | no automatic cleanup | Evaluate linkability and retention; no safe account-FK cascade exists | Yes |
| `provider_reports.reporter_user_identifier` | direct user FK | `CASCADE` | Current schema deletes reporter-created reports with account | Yes: abuse/security retention decision required |
| `provider_reports.reviewed_by_user_identifier` | reviewer user FK | `SET NULL` | Reviewer identity detaches on root deletion | Yes for moderation audit |
| `verification_requests.requester_id` | direct user FK | default `NO ACTION` | Explicit disposition required | Yes |
| `verification_requests.reviewed_by` | reviewer user FK | default `NO ACTION` | Explicit disposition required | Yes |
| `trust_history.changed_by` | user FK | default `NO ACTION` | Explicit disposition required | Yes |
| `ad_listings.owner_user_id` | direct user FK | `RESTRICT` | Explicit ad disposition required | Yes |
| `ad_free_slots` | ad/owner audit relation | `RESTRICT`; append-only trigger rejects update/delete | Cannot be erased or rewritten by ordinary lifecycle SQL | **Yes — architecture decision required** |
| `ad_request_receipts.owner_user_id` | direct user FK | `RESTRICT`; append-only | Direct account deletion is blocked | **Yes — architecture decision required** |
| `ad_moderation_events.reviewer_user_id` | direct user FK | `RESTRICT`; append-only | Moderator account deletion is blocked | **Yes — architecture decision required** |
| rate-limit buckets | SHA-256 digest only; raw user/IP identifiers not stored | independent expiry/reset semantics | No direct user-row cleanup path | Retention policy still applies to operational security data |

## External state blockers

### GCS media

`MediaService` explicitly deletes storage objects through `StorageAdapter.delete()`. Database cascade of `media_assets` does not call that service, so deleting only the account row can orphan physical GCS objects.

The managed media bucket is also configured with versioning and a 30-day (`2592000` seconds) soft-delete policy. That is a technical infrastructure retention property and must be reconciled with the approved deletion policy before claiming immediate irreversible erasure.

Required lifecycle design:

1. lock/mark the account as deletion-in-progress so new writes cannot race the request;
2. enumerate media rows and durable storage keys before DB rows disappear;
3. execute database disposition transaction according to the approved matrix;
4. delete corresponding GCS objects;
5. persist retry/reconciliation evidence for any storage deletion failure without retaining unnecessary personal content.

### Firebase / external authentication

The application stores only local external-identity bindings (`provider`, provider subject, email, local user id), and those rows cascade with the KHEDMA account. The current source contains no `deleteUser` or Identity Toolkit `accounts:delete` lifecycle.

Therefore local account deletion alone does not prove deletion of the Firebase Authentication identity. It also does not prevent a still-valid external identity from signing in later and causing creation of a new KHEDMA account. The approved design must decide whether to delete/revoke the Firebase identity, retain a minimal non-login tombstone, or use another approved prevention mechanism.

## V1 domain scope reconciliation

Current V1 authority defines Taxi and Delivery as location-based discovery of approved providers with direct contact. Internal dispatch, assignment, tracking, pricing and payment are excluded. The current mobility page searches canonical business categories and opens Google Maps for routing. No independent Taxi trip/order persistence was found in the canonical migrations.

Food appears as taxonomy/business discovery in current V1 sources; a separate restaurant ordering/payment data model is not part of the canonical V1 migration set.

A standalone user-review table was not found in the canonical migration set. The current `rating` value is an aggregate column on `business_profiles`, introduced by migration 007, not evidence of a persisted review author/body lifecycle.

## Non-FK orphan risks

These domains must be handled explicitly because account/profile deletion cannot rely on relational cascades:

- `service_listings.owner_id` / `owner_type`;
- `contact_action_events.actor_user_id`;
- `contact_action_events.business_profile_id`;
- analytics textual entity/session/anonymous references;
- physical media objects in GCS;
- external Firebase Authentication identity.

## Required policy decisions before destructive implementation

Blocker id: `RETENTION_POLICY_APPROVAL_REQUIRED`.

The approved policy/contract must decide, at minimum:

1. which user-owned public content is deleted versus anonymized, archived, transferred, or retained;
2. organization/business ownership transfer rules when the deleting account is owner-of-record;
3. treatment of third-party contact inquiries attached to a deleting owner's profile;
4. moderation, verification, trust and abuse-report retention/anonymization rules;
5. treatment of append-only Classifieds audit records and reviewer/owner identifiers;
6. operational/audit-log retention and actor detachment rules;
7. GCS versioning/soft-delete alignment and deletion-completion semantics;
8. Firebase Authentication identity deletion/revocation/tombstone behavior;
9. deletion completion SLA and retry/reconciliation behavior;
10. how a user-facing request moves through requested → verified → frozen → processed → completed/partially retained states.

No duration or legal basis is invented by this audit.

## Safe implementation gates after policy approval

Only after the disposition contract is approved:

1. add a dedicated deletion state/request model with idempotency;
2. require recent authentication for destructive self-service execution;
3. immediately revoke all KHEDMA sessions once deletion is accepted for execution;
4. freeze owner writes to prevent races;
5. apply explicit child-domain dispositions in deterministic order;
6. perform external GCS/Firebase cleanup with retry/reconciliation;
7. remove/anonymize account root only after blocking references are resolved;
8. retain only approved minimal audit evidence;
9. add integration tests for ordinary user, business owner, professional owner, organization owner/member, ad owner, moderator/admin, external-auth account, media-owner account, repeated request, partial external failure, and concurrent writes;
10. prove the lifecycle in isolated Staging before any Production release.

## Release decision

**Account deletion lifecycle: NOT PRODUCTION READY.**

The public request surface can remain as a request channel, but the project must not claim completed technical account erasure until the approved retention/disposition policy and the tested backend lifecycle above exist.
