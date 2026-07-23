# API Payload, Validation Error & Audit Event Naming Contract

## Mission Boundary

This document is documentation and architecture preparation only. It does not implement production features, APIs, backend routes, frontend integration, database models, migrations, UI screens, authentication implementation, authorization middleware, payment systems, marketplace features, ordering systems, messaging/chat, AI systems, automation, analytics pipelines, or production infrastructure.

## 1. Repository Identity Check

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
(clean before this contract file was created)
```

Repository identity confirmation: this is the correct `khedmah-digital-v1` repository. No legacy repository was detected.

## 2. API Contract Principles

Future API communication must use:

- Consistent naming.
- Predictable structures.
- Validation clarity.
- Security boundaries.
- Version compatibility.
- Arabic-first user-facing message readiness.
- Explicit auditability for sensitive actions.

The future API processing separation is:

```text
Request
↓
Validation
↓
Business Logic
↓
Response
↓
Audit Event
```

### Principle Details

| Principle | Contract |
| --- | --- |
| Consistent naming | Use stable lower camelCase for payload fields and uppercase snake case for error/audit codes. |
| Predictable structures | Responses should use a consistent envelope for data, errors, and metadata. |
| Validation clarity | Validation errors should identify code, field, message, and resolution guidance. |
| Security boundaries | Request and response payloads must not expose secrets, credentials, tokens, passwords, private evidence, or internal moderation details. |
| Version compatibility | Future API contracts should preserve `/api/v1` compatibility and avoid breaking payload semantics without governance. |

## 3. Request Payload Contract

### Request Principles

- Field names should use lower camelCase.
- Required fields must be documented per operation.
- Optional fields must have defined defaults or omission behavior.
- Nested objects must be shallow enough for validation clarity.
- Relationship references must use explicit reference fields such as `profileId`, `organizationId`, `serviceId`, `locationId`, or `relationshipId`.
- Payloads must not contain owner-only, trust-authority-only, or internal operational fields unless the future operation explicitly authorizes them.
- Requests must distinguish public data from private data and internal operational data.
- Validation must run before business logic.
- This document does not create actual APIs.

### Example: Create Business Profile Request Shape

```json
{
  "ownerRef": {
    "ownerType": "organization",
    "ownerId": "future-uuid"
  },
  "businessName": "Future public Arabic name",
  "categoryRef": "future-category-id",
  "description": "Future public-safe description",
  "serviceRefs": ["future-service-id"],
  "locationRefs": ["future-location-id"]
}
```

Validation expectations: owner reference must be valid, business name is required, category must be approved, services must reference approved service records, locations must be governed references, and trust/verification fields must not be accepted from this request.

### Example: Create Service Request Shape

```json
{
  "subcategoryId": "future-subcategory-id",
  "nameAr": "اسم الخدمة",
  "description": "Future service description",
  "defaultWorkflowType": "Inquiry"
}
```

Validation expectations: subcategory must exist, Arabic name is required, workflow type must be an allowed value, and service creation must not imply Job Work implementation, marketplace listing, ordering, or payment behavior.

### Example: Create Organization Member Request Shape

```json
{
  "organizationId": "future-organization-id",
  "userId": "future-user-id",
  "role": "Manager",
  "permissionsScope": {
    "profileIds": ["future-profile-id"]
  }
}
```

Validation expectations: organization and user must exist, actor must have member-management permission, role must be allowed, permissions scope must be valid, and duplicate active membership must be rejected.

### Example: Submit Verification Request Shape

```json
{
  "resourceType": "businessProfile",
  "resourceId": "future-profile-id",
  "verificationType": "businessIdentity",
  "evidenceRefs": ["future-private-evidence-ref"],
  "submissionReason": "Future owner-provided reason"
}
```

Validation expectations: resource must exist, actor must be authorized to submit verification, evidence references must remain private, verification decision fields must not be submitted by owners, and audit is required.

## 4. Response Contract

### Success Response Structure

Future success responses should use a predictable envelope:

```json
{
  "data": {
    "resource": {}
  },
  "meta": {
    "requestId": "future-request-id",
    "correlationId": "future-correlation-id"
  }
}
```

### Error Response Structure

Future error responses should use a predictable envelope:

```json
{
  "error": {
    "code": "INVALID_VALUE",
    "message": "Human-readable safe message.",
    "field": "categoryRef",
    "resolution": "Choose an approved category."
  },
  "meta": {
    "requestId": "future-request-id",
    "correlationId": "future-correlation-id"
  }
}
```

### Pagination Principles

Pagination metadata should be consistent across future list responses:

- `page` or cursor approach must be chosen per future contract.
- `limit` must have maximum bounds.
- `nextCursor` must not encode private data.
- Pagination must not imply ranking, advertising, or paid visibility.

### Metadata Principles

Metadata may include request identifiers, correlation identifiers, pagination, and safe processing context. Metadata must not expose private user data, authentication tokens, secrets, moderation internals, verification evidence, or abuse-detection internals.

### Module Consistency

The response contract should apply consistently across future modules:

- Users.
- Profiles.
- Services.
- Organizations.
- Discovery.
- Trust.
- Job Work.

## 5. Validation Error Contract

Standard error categories:

| Error code | Meaning | Example field | Resolution guidance |
| --- | --- | --- | --- |
| REQUIRED_FIELD | Required field is missing. | `businessName` | Provide the required field. |
| INVALID_FORMAT | Field format is invalid. | `email` | Use the required format. |
| INVALID_VALUE | Field value is not allowed. | `role` | Choose an allowed value. |
| DUPLICATE_RESOURCE | Resource already exists or active duplicate conflicts. | `userId` | Use existing resource or remove duplicate. |
| UNAUTHORIZED_ACTION | Actor is not authenticated or lacks identity context. | none | Sign in or provide valid identity context in future auth scope. |
| FORBIDDEN_ACTION | Actor is authenticated but not allowed to perform the action. | none | Request proper permission or contact owner/admin. |
| RESOURCE_NOT_FOUND | Referenced resource does not exist or is not visible to actor. | `profileId` | Check the reference. |
| INVALID_RELATIONSHIP | Relationship between resources is invalid. | `organizationId` | Use a valid relationship reference. |
| INVALID_STATE_TRANSITION | Requested lifecycle transition is not allowed. | `status` | Follow allowed lifecycle transitions. |

Each validation error should define:

- Error code.
- Human-readable message.
- Field reference where applicable.
- Resolution guidance.
- Safe metadata only.

## 6. Status and Lifecycle Error Rules

Future APIs should handle lifecycle states consistently:

| State condition | Response principle | Compatible lifecycle |
| --- | --- | --- |
| Pending states | Return safe state message and next allowed action if public-safe. | Account Lifecycle, Business Lifecycle, Verification Lifecycle. |
| Suspended accounts | Return forbidden or unavailable response without exposing private moderation details. | Account Lifecycle and Trust/Security lifecycle. |
| Archived resources | Return not found or archived response according to visibility contract. | Account, Profile, Business, Organization lifecycle. |
| Invalid transitions | Return `INVALID_STATE_TRANSITION` with safe guidance. | All lifecycle contracts. |

Status and lifecycle errors must not reveal private suspension reasons, private verification evidence, internal abuse signals, or hidden moderation state.

## 7. Audit Event Naming Contract

Future audit event structure:

```text
Actor
↓
Action
↓
Resource
↓
Result
```

### Audit Event Naming Rules

- Use uppercase snake case.
- Include clear action.
- Include resource or resource class.
- Avoid ambiguous names.
- Use past-tense result names for completed events where appropriate.
- Use request/submission names for pending review actions where appropriate.
- Do not encode private data in event names.

### Audit Event Examples

| Event name | Meaning |
| --- | --- |
| USER_PROFILE_UPDATED | User-related profile fields were updated. |
| BUSINESS_PROFILE_SUBMITTED | Business profile was submitted for review or activation. |
| VERIFICATION_APPROVED | Verification decision approved by future authority. |
| MEMBER_ROLE_CHANGED | Organization member role changed. |
| OWNERSHIP_TRANSFERRED | Owner-of-record changed under future transfer rules. |
| PROFILE_SUSPENDED | Profile was suspended by future governance authority. |
| REPRESENTATIVE_SCOPE_UPDATED | Representative relationship scope changed. |
| SERVICE_LINKED_TO_PROFILE | Service was linked to a profile. |

## 8. Relationship Reference Contract

Future APIs should reference resources explicitly:

| Resource | Reference field | Rule |
| --- | --- | --- |
| User | `userId` | Private/internal unless response contract allows owner-visible display. |
| Profile | `profileId` | Must identify a valid profile visible or manageable by actor. |
| Organization | `organizationId` | Must identify valid organization and actor relationship. |
| Business | `businessProfileId` | Must identify valid Business Profile and ownership/management permission. |
| Service | `serviceId` | Must reference approved Service Catalog entry. |
| Partner | `partnerProfileId` | Must reference valid partner profile or relationship. |
| Representative | `representativeProfileId` | Must reference valid representative profile and assigned scope. |
| Location | `locationId` | Must reference governed location record or future location contract entity. |

### Relationship Reference Rules

- Prevent duplicate identifiers by using canonical resource-specific reference fields.
- Prevent unclear ownership references by requiring `ownerRef` objects where owner may be user or organization.
- Prevent invalid relationships by validating actor permission, resource existence, lifecycle status, and relationship scope.
- Do not accept trust-authority-only or internal operational relationship fields from public owner requests.

## 9. Security Review

This contract verifies:

- No secrets.
- No credentials.
- No tokens.
- No passwords.
- No production URLs.
- No private user data.
- No API endpoints.
- No backend routes.
- No runtime implementation.

Future implementation must ensure request/response payloads never expose tokens, password hashes, session secrets, private verification evidence, private moderation state, private abuse signals, or production infrastructure values.

## 10. V1 Boundary Check

This mission does not implement:

- API endpoints.
- Authentication APIs.
- Payment APIs.
- Marketplace APIs.
- Ordering APIs.
- Messaging APIs.
- AI APIs.
- Analytics pipelines.
- Backend routes.
- Frontend integration.
- Database models.
- Migrations.
- UI screens.
- Automation.
- Production infrastructure.

## 11. API Contract Decisions

1. Payload fields use lower camelCase.
2. Error and audit codes use uppercase snake case.
3. Requests must separate public, private, and internal operational data.
4. Validation runs before business logic.
5. Responses use predictable success/error envelopes with safe metadata.
6. Relationship references must be explicit and resource-specific.
7. Lifecycle errors must avoid leaking moderation or verification internals.
8. Audit event names must be clear, resource-oriented, and privacy-safe.
9. This contract does not create APIs or routes.

## 12. Resolved Risks

- API payload examples now show how owners submit profile/service/member/verification data without accepting trust-authority-only decisions.
- Error codes now use canonical names for required fields, invalid values, unauthorized/forbidden actions, missing resources, invalid relationships, and invalid transitions.
- Audit event naming now has clear uppercase resource/action conventions.
- Relationship references now distinguish profile, organization, business, service, partner, representative, and location identifiers.
- Response metadata is constrained to safe request/correlation identifiers and pagination context.

## 13. Remaining Risks

- Exact API routes and method names remain undefined by design.
- Full payload schemas need future module-specific examples before implementation.
- Validation error localization and Arabic message catalog are not yet defined.
- Pagination strategy must be selected before list APIs are implemented.
- Audit payload body format and retention rules still require future security/governance contracts.

## 14. Readiness Score Update

Readiness score after Mission 041 API payload, validation error, and audit event contract: **89 / 100**.

Rationale: API communication principles, payload shapes, response envelopes, validation errors, lifecycle error handling, audit event names, and relationship references are now documented before runtime API design. Implementation should still wait for module-specific route contracts, localized error catalogs, audit payload structure, and final database-neutral relationship diagrams.

## 15. Recommended Next Mission

Recommended next mission: **Mission 042 — Module-Specific API Route Contract & Error Localization Blueprint**.

Purpose: define API-neutral route naming, module-specific payload contracts, Arabic-first validation message catalog, and audit payload schemas without creating runtime APIs.
