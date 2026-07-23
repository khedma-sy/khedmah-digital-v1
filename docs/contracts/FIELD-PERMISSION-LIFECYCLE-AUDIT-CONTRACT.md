# Field-Level Permission Matrix, Lifecycle State Transitions & Audit Contract

## Mission Boundary

This document is documentation and architecture preparation only. It does not implement production features, APIs, database models, migrations, UI screens, backend code, frontend code, authentication implementation, authorization middleware, admin dashboards, workflows, payments, marketplace features, messaging/chat, automation, permission engines, audit databases, approval systems, AI, advertising, or production infrastructure.

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

## 2. Field-Level Permission Concept

The official field-level permission chain is:

```text
Role
↓
Permission
↓
Action
↓
Field Access
```

### Permission Type Differences

| Permission type | Meaning | Example |
| --- | --- | --- |
| Resource permission | Permission to access or operate a whole resource such as profile, organization, service, relationship, or trust record. | Manager can edit assigned Business Profile. |
| Action permission | Permission to perform a specific action on a resource. | Admin can add organization member. |
| Field permission | Permission to view or modify specific fields within a resource. | Manager can edit description but cannot edit verification information. |

### Field Permission Principles

- Field access must be explicit for sensitive fields.
- Ownership changes must require owner-level authority and audit.
- Verification fields must be controlled by future trust/verification authority, not profile owners.
- Public information changes must be auditable.
- Private fields must never be exposed through public permissions.
- Representative and worker roles must receive narrow field access only for assigned scope.
- No permission engine or authorization middleware is implemented by this contract.

## 3. Business Profile Permission Matrix

Future Business Profile fields:

- Name.
- Description.
- Category.
- Services.
- Location.
- Contact information.
- Media.
- Verification information.

### Business Profile Field Matrix

| Field | Owner | Admin | Manager | Representative | Member | Boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Name | Request/edit under future rules | Request/edit if delegated | No default edit | No edit | View if authorized | Public identity; changes require audit. |
| Description | Edit | Edit if delegated | Edit assigned public copy | No edit unless delegated | View if authorized | Public text; moderation may be required. |
| Category | Request/edit under taxonomy rules | Request/edit if delegated | Request only | No edit | View | Category affects discovery and trust. |
| Services | Manage/profile services | Manage if delegated | Operate assigned services | Represent assigned services only | View assigned | Service changes affect discovery and Job Work compatibility. |
| Location | Manage public location/coverage | Manage if delegated | Edit assigned coverage only | View/represent assigned coverage | View assigned | Location may expose sensitive data. |
| Contact information | Manage public contact channels | Manage if delegated | Edit assigned public contact fields only | Use assigned public contact context only | Limited view | Private routing must remain protected. |
| Media | Manage | Manage if delegated | Upload/request edits if delegated | No edit unless delegated | View | Media requires moderation. |
| Verification information | No direct modification | No direct modification | No direct modification | No direct modification | No access | Controlled by future verification authority only. |

### Business Profile Prevention Rules

- Prevent unauthorized ownership changes by separating owner-of-record from management roles.
- Prevent unauthorized verification changes by excluding owners, admins, managers, representatives, and members from direct verification field modification.
- Prevent unauthorized public information changes by requiring scoped field permission and audit for public fields.
- Prevent representative overreach by allowing representation only for assigned service, category, or region scope.

## 4. Professional Profile Permission Matrix

Applies to professional profiles for:

- Doctor.
- Engineer.
- Lawyer.
- Consultant.
- Freelancer.

### Professional Identity Fields vs Business/Organization Fields

| Field group | Meaning | Boundary |
| --- | --- | --- |
| Professional identity fields | Name display, professional category, credentials summary, professional services, professional location/coverage, public biography. | Belongs to the professional identity and trust review context. |
| Business/Organization fields | Clinic, firm, workshop, company, hospital, school, or organization details connected to the professional. | Belongs to the business or organization identity, not the professional alone. |

### Professional Profile Matrix

| Field | Professional Owner | Organization Admin | Manager | Representative | Member | Boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Professional display name | Request/edit under identity rules | No edit unless organization-owned display context | No edit | No edit | View | Must not impersonate. |
| Professional category | Request/edit under taxonomy and trust rules | Request only for organization-linked professional | No edit | No edit | View | Regulated categories require review. |
| Credentials summary | Submit/request edit | No direct modification | No edit | No edit | No access to private evidence | Private evidence remains protected. |
| Professional services | Manage/request service links | Manage organization-linked services if delegated | Operate assigned service fields | Represent assigned services only | View assigned | Service links must stay separate from business services. |
| Organization link | Request/link under relationship rules | Manage if authorized by organization | No edit | No edit | View if authorized | Link does not transfer professional identity ownership. |
| Verification information | No direct modification | No direct modification | No direct modification | No direct modification | No access | Future verification authority only. |

## 5. Organization Permission Matrix

Organization relationship:

```text
Organization
↓
Members
↓
Roles
↓
Permissions
```

### Organization Action Matrix

| Action | Owner | Admin | Manager | Representative | Member | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- |
| Add members | Yes | If delegated | No default | No | No | Actor, action, organization, added member, role, timestamp, reason. |
| Remove members | Yes | If delegated | No default | No | No | Actor, action, organization, removed member, previous role, timestamp, reason. |
| Assign roles | Yes | If delegated and below owner scope | No default | No | No | Actor, previous role, new role, resource, timestamp, reason. |
| Edit organization information | Yes | If delegated | Assigned fields only | No | No | Actor, changed fields, previous value class, new value class, timestamp, reason. |
| Transfer ownership | Owner only under future transfer rules | No | No | No | No | Strong audit and future confirmation required. |
| Suspend organization profile | Future trust/governance authority | No direct action | No | No | No | Actor, state, reason, evidence reference, timestamp. |

### Organization Membership Rules

- Members do not automatically become owners.
- Representatives do not automatically become organization members.
- Partners do not automatically become organization members.
- Managers operate assigned resources only.
- Admin authority must be delegated and auditable.

## 6. Partner and Representative Permission Matrix

### Partner Profile Permissions

| Field/action | Partner Owner | Organization Owner/Admin | Manager | Representative | Boundary |
| --- | --- | --- | --- | --- | --- |
| Partner type | Request/edit under partner governance | Request/edit if profile is organization-owned | No default | No | Type changes affect trust and discovery. |
| Coverage area | Manage/request update | Manage if delegated | Request/update assigned coverage only | View/act in assigned scope | Coverage uses governed locations. |
| Supported categories | Request/edit under taxonomy rules | Request/edit if delegated | Request only | View/act in assigned scope | Category changes require audit. |
| Organization relationship | Request relationship | Approve/request relationship if authorized | No default | No | Relationship evidence remains private. |
| Trust status | No direct modification | No direct modification | No | No | Future trust authority only. |
| Activity history | View own aggregate/public-safe history | View authorized aggregate context | View assigned aggregate context | View assigned scope only | Private data must be protected. |

### Representative Relationship Permissions

Representative can:

- Act on assigned scope.
- Represent assigned organization/service/region where explicitly authorized.
- View public relationship context.
- Request relationship updates where allowed.

Representative cannot:

- Become owner through representation.
- Change ownership.
- Modify trust status.
- Modify verification evidence.
- Grant roles to others.
- Edit unassigned profile fields.
- Access private user, owner, financial, or verification data.

## 7. Lifecycle State Transition Contract

Allowed future state chain:

```text
Created
↓
Pending
↓
Active
↓
Suspended
↓
Archived
```

### Transition Matrix

| Transition | Who can trigger | Required reason | Audit requirement |
| --- | --- | --- | --- |
| Created → Pending | Owner, system-created future process, or authorized admin after approved creation contract. | Initial completion, review request, or identity/profile setup. | Actor, action, resource, previous state, new state, timestamp, reason. |
| Pending → Active | Future approval authority, owner for low-risk self-activation where approved, or admin if delegated. | Business approval, profile completion, verification approval, or policy clearance. | Actor, approval basis, resource, previous state, new state, timestamp, reason. |
| Active → Suspended | Future trust/governance/security authority. | Policy violation, security risk, verification issue, abuse, or legal/governance reason. | Actor, resource, previous state, new state, timestamp, reason, evidence reference. |
| Suspended → Active | Future trust/governance/security authority. | Appeal accepted, issue resolved, verification restored, or policy clearance. | Actor, resource, previous state, new state, timestamp, reason, resolution reference. |
| Pending → Archived | Owner, admin if delegated, or future governance authority. | Incomplete, duplicate, withdrawn, or rejected profile/account. | Actor, resource, previous state, new state, timestamp, reason. |
| Suspended → Archived | Future governance/security authority. | Permanent removal, closure, retention rule, or repeated violation. | Actor, resource, previous state, new state, timestamp, reason. |
| Active → Archived | Owner under future closure rules or governance authority. | Voluntary closure, business closure, consolidation, or governance action. | Actor, resource, previous state, new state, timestamp, reason. |

### Examples

- Business approval: `Pending → Active` after profile completeness and policy review.
- Verification approval: trust/verification authority records verification decision and may support `Pending → Active` or trust status update.
- Account suspension: `Active → Suspended` with required reason and audit record.

## 8. Audit Contract

Every sensitive action should record:

- Actor.
- Action.
- Resource.
- Previous state.
- New state.
- Timestamp.
- Reason.

### Audit Scope

Applies to:

- Ownership changes.
- Permission changes.
- Verification decisions.
- Suspensions.
- Profile changes.
- Organization membership changes.
- Role assignment changes.
- Representative relationship changes.
- Partner relationship changes.
- Trust status changes.
- Sensitive location or contact information changes.

### Audit Principles

- Audit records must not expose private evidence publicly.
- Audit records must distinguish actor, affected resource, and target user where applicable.
- Audit must capture state transitions and sensitive field classes without requiring full private value exposure.
- Audit should support investigation, rollback analysis, trust decisions, and governance review.
- No audit database or audit runtime is implemented by this contract.

## 9. Trust Compatibility

Compatibility chain:

```text
Permissions
↓
Verification
↓
Trust Level
```

### Trust Protection Rules

- Users cannot modify their own trust directly.
- Representatives cannot change trust status.
- Owners cannot directly modify verification evidence or final verification decisions.
- Managers and members cannot modify trust or verification fields.
- Unauthorized verification updates must be impossible under future permission contracts.
- Trust decisions require audit records with actor, resource, previous state, new state, timestamp, and reason.
- Trust Level must be scoped by entity and relationship type.

## 10. Security Review

This contract verifies:

- No secrets.
- No credentials.
- No tokens.
- No passwords.
- No private user data.
- No production infrastructure.
- No authentication implementation.
- No authorization middleware.
- No admin dashboard.
- No audit database.

Future implementation must define secure permission evaluation, audit storage, tamper resistance, access logging, least privilege enforcement, reason-code governance, data retention, private evidence protection, and incident review.

## 11. V1 Boundary Check

This mission does not implement:

- Permission engine.
- Audit database.
- Admin system.
- Approval workflows.
- Authentication.
- Authorization middleware.
- Marketplace.
- Payments.
- Subscriptions.
- AI.
- Advertising.
- APIs.
- Database models.
- Migrations.
- UI screens.
- Backend code.
- Frontend code.
- Messaging/chat.
- Automation.
- Production infrastructure.

## 12. Resolved Risks

- Field-level access is now separated from resource-level and action-level permission vocabulary.
- Verification information is explicitly protected from owner/admin/manager/representative/member direct modification.
- Representative authority is constrained to assigned scope and cannot create ownership.
- Organization membership actions identify role and audit boundaries.
- Lifecycle transitions require actor, reason, and audit requirements.
- Trust changes require future authority and audit rather than profile-owner self-editing.

## 13. Remaining Risks

- Exact field names and permission keys still require future implementation-ready specification.
- State transition rules need error handling and appeal lifecycle documentation.
- Audit retention, deletion, and tamper-resistance are not yet specified.
- Admin delegation depth and role hierarchy need future constraints.
- High-risk categories may require stricter permission matrices.
- Field values are not modeled, and this document intentionally avoids database schemas.

## 14. Architecture Decisions

1. Permission design must separate resource permission, action permission, and field permission.
2. Sensitive Business Profile fields require field-specific access boundaries.
3. Professional identity fields must remain separate from business/organization fields.
4. Organization membership actions require scoped role checks and audit.
5. Partner and Representative permissions must not grant ownership, trust modification, or verification modification.
6. Lifecycle transitions require an actor, required reason, and audit record.
7. Trust modification is authority-controlled and cannot be self-edited by users, owners, representatives, managers, or members.
8. This contract does not implement permission engines, audit databases, approval workflows, or authorization middleware.

## 15. Readiness Score Update

Readiness score after Mission 039 permission, lifecycle, and audit contract: **82 / 100**.

Rationale: Field-level permission principles, sensitive field boundaries, lifecycle transitions, and audit expectations are now documented. Development should still wait for implementation-ready permission keys, field schemas, audit retention rules, state transition error handling, and security implementation contracts.

## 16. Recommended Next Mission

Recommended next mission: **Mission 040 — Implementation-Ready Field Schema & Validation Contract for Profiles, Services, Locations, Relationships, Identity, Permissions, and Trust**.

Purpose: define field names, validation rules, enumerations, visibility classes, audit event names, and privacy classes without creating runtime code.
