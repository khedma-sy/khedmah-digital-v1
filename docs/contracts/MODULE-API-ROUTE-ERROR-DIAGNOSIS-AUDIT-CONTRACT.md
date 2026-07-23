# Module API Route Contract, Error Diagnosis, Auto Specification & Critical Consistency Audit

## Mission Boundary

This document is documentation and architecture preparation only. It does not implement APIs, backend routes, frontend integration, database models, migrations, UI screens, authentication, authorization middleware, production code, automation systems, payment systems, marketplace features, messaging/chat, AI systems, analytics pipelines, or production infrastructure.

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

## 2. Module API Contract Blueprint

This blueprint defines future module API contract boundaries without implementing routes.

### Identity Module

Future contract subjects:

- User Account.
- Profile.
- Roles.
- Permissions.

Future contract requirements: identity payloads must protect private account fields, separate profile identity from login identity, use role/permission contracts, and avoid exposing authentication secrets.

### Business Module

Future contract subjects:

- Business Profile.
- Organization.
- Supplier.

Future contract requirements: business payloads must use canonical owner references, category references, service references, location references, trust references, and relationship references without creating marketplace, ordering, payment, or supplier transaction behavior.

### Services Module

Future contract subjects:

- Categories.
- Subcategories.
- Services.
- Workflow Types.

Future contract requirements: service payloads must keep Category, Subcategory, Service, and Workflow Type separate, use Arabic-first labels, preserve governed allowed values, and avoid creating workflow engines.

### Trust Module

Future contract subjects:

- Verification.
- Trust Level.

Future contract requirements: trust payloads must keep private verification evidence separate from public trust indicators and prevent owners, representatives, managers, members, and users from modifying trust decisions directly.

### Discovery Module

Future contract subjects:

- Search.
- Public Profiles.

Future contract requirements: discovery payloads must expose public profile data only, support category/location/service filters, and avoid marketplace, paid ranking, advertising, and AI recommendations.

### Relationships Module

Future contract subjects:

- Partners.
- Representatives.
- Members.

Future contract requirements: relationship payloads must prevent duplicate ownership, invalid representation, partner/provider conflicts, membership confusion, affiliate drift, commission drift, and unauthorized relationship creation.

## 3. Error Diagnosis Contract

Every future error must include:

- Error Code.
- Error Name.
- Description.
- Affected Module.
- Affected Field.
- Reason.
- Suggested Resolution.
- Severity Level.

### Error Diagnosis Shape

| Field | Purpose | Example |
| --- | --- | --- |
| errorCode | Stable uppercase snake case code. | `BUSINESS_PROFILE_DUPLICATE` |
| errorName | Short human-readable name. | Duplicate business profile. |
| description | Safe explanation of the problem. | A business with the same identity already exists. |
| affectedModule | Module where the error occurred. | Business. |
| affectedField | Field or relationship reference, if applicable. | `businessName` |
| reason | Why the error occurred. | Similar name, owner, location, and contact were found. |
| suggestedResolution | What the user or operator can do. | Review existing profile or update existing record. |
| severityLevel | Severity for handling and diagnostics. | Info, Warning, Error, Critical. |

### Example Error

```text
ERROR CODE: BUSINESS_PROFILE_DUPLICATE
Meaning: A business with the same identity already exists.
Resolution: Review existing profile or update existing record.
```

## 4. Error Classification

Standard error categories:

| Category | Meaning |
| --- | --- |
| VALIDATION_ERROR | Field value, format, or required-field failure. |
| AUTHORIZATION_ERROR | Actor lacks authentication or permission context. |
| OWNERSHIP_ERROR | Actor does not own or cannot manage the resource. |
| DUPLICATE_ERROR | Resource conflicts with existing active or pending resource. |
| RELATIONSHIP_ERROR | Relationship reference or authority is invalid. |
| LIFECYCLE_ERROR | Requested state transition is not allowed. |
| TRUST_ERROR | Verification, trust, or evidence operation is invalid. |
| SYSTEM_ERROR | Unexpected internal failure with safe public message. |

## 5. Duplicate Detection Contract

Duplicate prevention applies to:

- Duplicate users.
- Duplicate emails.
- Duplicate phone numbers.
- Duplicate professional profiles.
- Duplicate businesses.
- Duplicate services.
- Duplicate organizations.
- Duplicate partners.
- Duplicate representatives.

### Duplicate Identity Principles

Two entities may be duplicates when they share enough stable identity signals to create confusion, impersonation risk, ownership conflict, verification conflict, or user-discovery conflict.

Potential duplicate signals:

- Same normalized name.
- Same owner or identity evidence.
- Same contact method.
- Same location or coverage.
- Same organization relationship.
- Same professional credential reference.
- Same verification evidence reference.
- Same category and service scope.

### Conflict Detection Principles

- Normalize names before comparison.
- Compare owner references and organization references.
- Compare verified or private contact identifiers only through secure internal matching.
- Compare location references using governed country, city, area, branch, and coverage identifiers.
- Compare status so archived duplicates can be treated differently from active duplicates.
- Never expose private matching evidence in user-facing error messages.

### User Communication Principles

Users should be informed with safe error details:

- State that a similar record exists.
- Provide the error code.
- Provide safe next action.
- Do not reveal private owner, contact, credential, verification, or moderation details.

## 6. Profession Duplicate Analysis

Professional duplication cases:

| Case | Conflict signal | Handling principle |
| --- | --- | --- |
| Two doctors with same identity | Same professional identity evidence, specialty, location, and contact signal. | Flag for review; do not auto-merge private evidence. |
| Doctor registered twice | Same owner user, credential evidence, and profession. | Prevent duplicate active profile; suggest updating existing profile. |
| Engineer with same profile | Same owner, profession, service scope, and location. | Detect conflict and route to existing profile or review. |
| Lawyer duplicate profile | Same legal identity, organization/firm link, and contact signal. | Protect verification evidence and require review. |

### Professional Merge Principle

Merging is future governance-only. No automatic merge should occur without owner confirmation, verification review, audit record, and privacy-safe evidence handling.

### Professional Conflict Handling

- Return duplicate or review-required error.
- Keep private evidence hidden.
- Preserve existing verification status until review.
- Audit attempted duplicate creation.

### Verification Protection

Duplicate detection must not allow users to infer private credentials, identity documents, owner identity, or verification evidence of another professional.

## 7. Business Duplicate Analysis

Business duplication cases:

| Case | Identity matching principles | Handling principle |
| --- | --- | --- |
| Restaurant duplicate | Name, owner, physical location, contact, category, verification status. | Reject duplicate or route to ownership claim/review. |
| Shop duplicate | Name, location, owner/contact, category. | Flag conflict and provide safe resolution guidance. |
| Factory duplicate | Organization identity, headquarters, owner, verification evidence, category. | Require organization-level review. |
| Supplier duplicate | Supplier type, organization, coverage, contact, category, verification status. | Prevent duplicate active supplier profile and require review. |

### Business Identity Matching Principles

- Name: compare normalized Arabic and optional secondary-language names.
- Owner: compare owner-of-record and organization relationships.
- Location: compare business location, branch, headquarters, and coverage separately.
- Contact: compare private contact internally without exposing it.
- Verification status: consider verified records stronger duplicate signals than unreviewed records.

## 8. Auto Specification Rules

Each future module must have:

- Entity definition (`entity definition`).
- Fields.
- Validations.
- Permissions.
- Errors.
- Audit events.
- Relationships.

### Auto Specification Principles

- Every entity field must link to a validation rule.
- Every sensitive field must link to permission and audit rules.
- Every relationship must define ownership, authority, lifecycle, and duplication rules.
- Every lifecycle transition must define error codes and audit event names.
- Every future route contract must define request payload, success response, error response, audit events, and privacy class.
- Documentation must remain source-of-truth before implementation.

## 9. IQ Architecture Review

### Missing Entities

- Public Profile Claim or Ownership Claim contract.
- Merge Review contract for duplicate profiles/businesses.
- Error Localization catalog.
- Audit Payload Body contract.
- Route Naming contract by module.

### Duplicated Concepts

- Profile and Business Profile can still be confused in error naming.
- Owner, Admin, Manager, Representative, Partner, and Worker can overlap without strict permission keys.
- Service can mean taxonomy service, offered service, or executable service without route-specific naming.
- Location can mean address, coverage, branch, headquarters, or territory.

### Naming Conflicts

- `profileId` versus `businessProfileId` needs route-specific clarity.
- `serviceId` versus `serviceRef` versus `serviceRefs` needs payload naming governance.
- `trustLevel` versus `verificationStatus` must stay distinct.
- `representativeProfileId` versus `representativeRelationshipId` must be separated.

### Future Scalability Risks

- Duplicate detection may become expensive without normalized identity keys.
- Cross-border organizations and suppliers need location-aware duplicate logic.
- Multi-branch businesses require branch-aware duplication handling.
- Professional profiles linked to organizations require non-destructive merge/review flows.

### Migration Risks

- API routes designed before duplicate and error contracts may leak private details.
- Error names not standardized early could fragment client behavior.
- Audit event names not standardized early could fragment analytics and compliance review.
- Ambiguous relationship identifiers could force later API-breaking changes.

## 10. KILL CRITICAL Review

| Risk | Problem | Impact | Prevention |
| --- | --- | --- | --- |
| Marketplace drift | Business, service, supplier, and discovery contracts could be misread as listings. | Scope explosion into transactions and seller operations. | Keep payload examples non-transactional and exclude marketplace APIs. |
| Payment drift | Service and Job Work concepts could invite payment fields. | Premature payment, wallet, and compliance scope. | Exclude payment APIs and payment data from all contracts. |
| Delivery marketplace drift | Supplier, transport, and representative examples could imply delivery operations. | Dispatch and logistics scope explosion. | Keep delivery vocabulary future-only and exclude delivery marketplace behavior. |
| Social network drift | Sharing and professional knowledge could become feeds or follows. | User-generated social system scope. | Exclude followers, likes, comments, feeds, and messaging from API contracts. |
| AI drift | Search, duplicate detection, and recommendations could invite AI systems. | Privacy and complexity risk. | Use deterministic validation language and exclude AI APIs. |
| Advertising drift | Discovery, analytics, and trust could be misused for paid visibility. | Trust erosion and monetization drift. | Exclude advertising, ranking, and paid visibility. |
| Ranking drift | Search and discovery responses could imply ranking contracts. | Hidden ranking and fairness concerns. | Keep pagination/order distinct from ranking and require future governance. |
| Commission drift | Partner and representative relationships could imply rewards. | Financial scope and affiliate risk. | Exclude affiliate, commission, and revenue-sharing semantics. |
| Data privacy risks | Duplicate detection and errors could reveal private matches. | Privacy breach or inference attacks. | Use safe messages, hide private evidence, and audit sensitive attempts. |

## 11. Error User Experience Principles

Future user-facing errors should be safe, Arabic-first, and actionable.

Example:

```text
العنوان:
تعذر إنشاء الملف

رقم الخطأ:
BUSINESS_PROFILE_DUPLICATE

السبب:
يوجد نشاط مشابه مسجل مسبقاً.

الحل:
راجع الملف الموجود أو تواصل مع الدعم.
```

### Error UX Rules

- Show safe title.
- Show stable error code.
- Explain reason without exposing private data.
- Provide a next step.
- Preserve Arabic-first language and RTL display.
- Avoid technical stack traces, secret values, private owner data, private verification evidence, or internal moderation details.

## 12. Security Review

This contract verifies:

- No secrets.
- No tokens.
- No passwords.
- No private data.
- No production information.
- No APIs.
- No backend routes.
- No runtime implementation.

## 13. V1 Boundary Check

This mission does not implement:

- APIs.
- Backend routes.
- Frontend integration.
- Database models.
- Migrations.
- UI screens.
- Authentication.
- Authorization middleware.
- Production code.
- Automation systems.
- Payment systems.
- Marketplace features.
- Messaging/chat.
- AI systems.
- Analytics pipelines.
- Production infrastructure.

## 14. API Module Decisions

1. Module contracts are grouped by Identity, Business, Services, Trust, Discovery, and Relationships.
2. Error diagnosis requires code, name, description, affected module, affected field, reason, resolution, and severity.
3. Error classification uses canonical categories across validation, authorization, ownership, duplicate, relationship, lifecycle, trust, and system failures.
4. Duplicate detection must use private-safe matching and user-safe messages.
5. Professional and business duplicates require review principles, not automatic unsafe merging.
6. Every module must define entities, fields, validations, permissions, errors, audit events, and relationships before implementation.
7. Audit, error, relationship, and duplicate contracts must remain privacy-safe.

## 15. Resolved Risks

- Module-specific API contract subjects are now identified before route design.
- Error diagnosis is standardized beyond simple error codes.
- Duplicate detection now has cross-entity principles and safe user communication rules.
- Professional and business duplicate analysis now protects verification evidence.
- Auto specification rules now require entities, fields, validations, permissions, errors, audit events, and relationships for each module.
- Kill-critical drift risks are explicitly documented with prevention rules.

## 16. Remaining Risks

- Actual route names remain undefined by design.
- Error localization catalog needs future Arabic-first message inventory.
- Duplicate matching confidence thresholds need future data rules.
- Merge/review workflows need future governance documentation.
- Audit payload body schema still needs implementation-ready naming.
- Client behavior for each error category remains future scope.

## 17. Readiness Score Update

Readiness score after Mission 042 module API, error diagnosis, duplicate detection, and critical audit contract: **91 / 100**.

Rationale: Module API subjects, error diagnosis, error classification, duplicate detection, profession/business conflict analysis, auto-specification rules, and critical drift prevention are now documented. Implementation should still wait for module route naming, Arabic error localization, duplicate confidence rules, and audit payload schemas.

## 18. Recommended Next Mission

Recommended next mission: **Mission 043 — Module Route Naming, Arabic Error Localization & Audit Payload Schema Contract**.

Purpose: define future module route names, Arabic error catalog entries, duplicate review payloads, and audit payload schemas without implementing APIs or backend routes.
