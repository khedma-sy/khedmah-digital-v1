# Identity, Role, Permission & Account Lifecycle Contract

## Mission Boundary

This document is documentation and architecture preparation only. It does not implement production features, APIs, database models, migrations, UI screens, authentication code, authorization middleware, backend code, frontend code, admin panels, workflows, payments, marketplace features, messaging/chat, automation, AI, or production infrastructure.

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

## 2. Identity Model Contract

The official identity structure is:

```text
User Account
↓
Profile
↓
Roles
↓
Permissions
↓
Owned Resources
↓
Organization Relationships
```

### Identity Layer Meanings

| Layer | Meaning | Boundary |
| --- | --- | --- |
| User Account | The private login/security identity for a human actor. | User private data must not be exposed as public profile identity. |
| Profile | The public or semi-public representation connected to a user, professional, business, partner, representative, or organization context. | Profile is not authentication identity. |
| Roles | Named responsibility scopes such as Owner, Admin, Manager, Representative, Member, or Worker. | Role names do not automatically grant permissions without contract mapping. |
| Permissions | Explicit action allowances derived from role, resource, ownership, and relationship context. | Permissions must be scoped to resources. |
| Owned Resources | Profiles, organizations, services, locations, or relationships that have a single owner-of-record. | Ownership is separate from management and representation. |
| Organization Relationships | Membership and relationship records connecting users to organizations. | Organization membership is not automatically partnership or representation. |

### Identity Distinctions

| Identity type | Canonical meaning | Boundary |
| --- | --- | --- |
| User identity | Private account identity used for access, security, and ownership linkage. | Not a public professional, business, partner, or representative identity by itself. |
| Professional identity | Public professional identity for a person providing professional services. | Separate from user login and from the organization where the professional may work. |
| Business identity | Public identity for a commercial provider such as restaurant, shop, workshop, or salon. | Separate from user identity and organization membership. |
| Organization identity | Formal identity for factory, hospital, school, company, or similar entity. | Can own resources but does not automatically verify all members. |
| Partner identity | Future ecosystem role identity supporting growth, regional expansion, or digital/community partnership. | Not employee, affiliate, marketplace seller, or commission role. |
| Representative identity | Future authority identity for representing an organization, provider, service, or region. | Must be explicit; not implied by membership, partnership, or employment. |

## 3. Account Types

Future account types describe the primary relationship between a user account and platform use. They do not create runtime account systems in this mission.

### A. Individual User

Examples:

- Customer.
- Service consumer.

Purpose: a user who discovers services, views public profiles, submits future contact intent, saves preferences under future privacy rules, or consumes public knowledge.

### B. Professional Account

Examples:

- Doctor.
- Engineer.
- Lawyer.
- Consultant.
- Freelancer.

Purpose: a user connected to a Professional Profile or service-capable public professional identity.

### C. Business Account

Examples:

- Restaurant.
- Shop.
- Workshop.
- Salon.

Purpose: a user or organization-managed account context connected to a Business Profile for commercial discovery.

### D. Organization Account

Examples:

- Factory.
- Hospital.
- School.
- Company.

Purpose: an organization-managed account context with members, roles, ownership boundaries, and possible multiple profiles or services.

### E. Partner Account

Examples:

- Regional Partner.
- Digital Partner.
- Community Partner.

Purpose: a future ecosystem account context for approved partner roles. Partner Account does not imply employment, affiliate tracking, revenue sharing, payments, commissions, marketplace selling, recruitment, or financial rewards.

## 4. Role Contract

Official roles:

- Owner.
- Admin.
- Manager.
- Representative.
- Member.
- Worker.

### Role Meanings

| Role | Meaning | Boundary |
| --- | --- | --- |
| Owner | The role with ultimate responsibility over a resource or organization under owner-of-record rules. | There should be one owner-of-record for each future owned resource. |
| Admin | A delegated high-permission manager of an organization or resource. | Admin can manage only within scoped authorization; not ownership by default. |
| Manager | A delegated operator for assigned resources, profiles, services, or locations. | Manager cannot transfer ownership unless explicitly authorized in future contracts. |
| Representative | A role authorized to represent an assigned organization, provider, service, or region. | Representative is not automatically partner, employee, affiliate, or worker. |
| Member | A limited participant in an organization or resource. | Member has limited access and no default ownership or representation. |
| Worker | A future execution actor compatible with Job Work or service delivery vocabulary. | Worker is not automatically representative, partner, owner, or organization member. |

### Role Questions

| Question | Canonical answer |
| --- | --- |
| Who can own resources? | Owners can own resources; organizations can own resources through owner-of-record rules and owner members. |
| Who can manage resources? | Owners, admins, and managers can manage resources according to scoped permissions. |
| Who can represent resources? | Representatives can represent assigned resources only through explicit relationship authority. Owners may represent their own resource only where future contracts allow it. |
| Who can execute tasks? | Workers, providers, assigned professionals, or approved representatives may execute future tasks only after Job Work contracts and permissions are defined. |

## 5. Permission Contract

The official permission chain is:

```text
Role
↓
Permission
↓
Action
```

### Permission Principles

- Permissions must be explicit and resource-scoped.
- Roles do not grant global access by default.
- Ownership, management, representation, and execution permissions must remain separate.
- Permissions must be auditable when implemented.
- Least privilege must be the default.
- Permission names must be stable and governed before implementation.
- No authorization middleware is implemented by this document.

### Permission Examples

#### Owner

- Manage profile.
- Manage services.
- Manage members.
- Transfer ownership only under future approved rules.

#### Admin

- Manage assigned organization resources.
- Manage assigned members or profiles where delegated.
- View operational audit context where approved.

#### Manager

- Operate assigned resources.
- Update approved profile/service fields where delegated.
- Coordinate assigned service areas where authorized.

#### Representative

- Represent assigned organization/service.
- View public relationship context.
- Request future relationship verification where authorized.

#### Member

- Limited access.
- View assigned organization context.
- Perform explicitly assigned actions only.

#### Worker

- Execute assigned future tasks where Job Work is approved.
- Update execution status only under future workflow contracts.
- No default access to organization ownership or partner relationships.

## 6. Ownership Boundary Review

### Ownership Rules

| Resource | Owner-of-record | Management boundary |
| --- | --- | --- |
| User Account | Individual user. | Account access belongs to the user; no shared login ownership. |
| Professional Profile | Individual user or organization-linked professional relationship. | Professional identity and organization employment must remain separate. |
| Business Profile | Individual owner or organization owner depending on profile type. | Managers can operate but do not own by default. |
| Organization | Organization owner role held by approved user/member. | Members do not automatically become owners. |
| Partner Profile | Future partner owner or organization relationship. | Partner ownership does not imply affiliate or revenue rights. |
| Representative Role | Represented resource plus approved representative actor. | Representative does not own represented resources by default. |
| Worker Role | Worker actor or organization-linked worker relationship. | Worker execution does not imply management or representation. |

### Prevention Rules

- Prevent duplicate ownership with one owner-of-record per owned resource.
- Prevent unauthorized management by requiring scoped permissions for every action.
- Prevent role confusion by separating owner, admin, manager, representative, member, worker, partner, provider, and customer responsibilities.
- Prevent partner ownership conflicts by keeping partnership relationship separate from resource ownership.
- Prevent representative authority conflicts by requiring explicit represented-resource relationship.
- Prevent worker/provider confusion by keeping task execution separate from profile ownership and service catalog ownership.

## 7. Organization Membership Contract

Future organization membership relationship:

```text
Organization
↓
Members
↓
Roles
↓
Permissions
```

### Membership Principles

- Organization membership connects a user to an organization context.
- Membership status does not automatically grant ownership.
- Membership role determines possible permission scope.
- Permission scope must be resource-specific.
- Membership lifecycle must be auditable when implemented.

An organization member is not automatically:

- Owner.
- Partner.
- Representative.
- Worker.
- Provider.
- Admin.

## 8. Account Lifecycle Contract

Future account states:

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

### State Meanings

| State | Meaning | Boundary |
| --- | --- | --- |
| Created | Account or profile shell exists after a future approved creation event. | Does not imply public visibility or verification. |
| Pending | Account or profile awaits completion, review, email confirmation, ownership check, or verification readiness. | Does not imply approval or trust. |
| Active | Account or profile is eligible for approved use or public display according to future contracts. | Active is not automatically verified or trusted. |
| Suspended | Account or profile is restricted due to policy, security, trust, or governance reasons. | Suspension handling must avoid leaking private moderation data. |
| Archived | Account or profile is no longer active and retained only under future retention rules. | Archive is not deletion unless future deletion contracts define it. |

### Profile Lifecycle

Profile lifecycle should follow Created, Pending, Active, Suspended, and Archived while also tracking public visibility, completeness, verification status, and owner-of-record. A profile may be Active privately but not publicly discoverable until visibility and trust rules allow it.

### Business Lifecycle

Business lifecycle should track business profile completeness, service readiness, location readiness, ownership, management permissions, and trust status. Business lifecycle must not imply payments, marketplace eligibility, advertising, or ranking.

### Organization Lifecycle

Organization lifecycle should track organization creation, membership, owner role, active/suspended/archived state, and profile ownership relationships. Organization lifecycle must not automatically alter professional, partner, representative, or worker identity without explicit relationships.

## 9. Trust Compatibility

Trust relationship:

```text
Identity
↓
Verification
↓
Trust Level
```

### Compatibility Analysis

| Trust context | Compatibility rule |
| --- | --- |
| Trust Foundation | Identity and roles provide ownership context for verification readiness and trust state. |
| Business Profiles | Business profile trust depends on owner-of-record, completeness, category, location, and verification readiness. |
| Professional Profiles | Professional trust depends on user identity, professional evidence, category, services, and relationship to organizations if applicable. |
| Partners | Partner trust depends on partner role evidence, organization relationship, contribution history, and coverage scope. |
| Representatives | Representative trust depends on represented-resource authority, territory, identity readiness, and verification readiness. |

### Trust Duplication Prevention

- User identity verification does not automatically verify every profile the user manages.
- Organization trust does not automatically verify every member.
- Partner trust does not automatically authorize representation.
- Representative trust does not imply ownership.
- Worker performance history does not automatically become public trust.
- Trust Level must be scoped by entity and relationship type.

## 10. Security Review

This contract verifies:

- No secrets.
- No credentials.
- No tokens.
- No passwords.
- No private user data.
- No production information.
- No authentication code.
- No authorization middleware.
- No production infrastructure.

Future implementation must define password/session handling, role assignment audit, permission checks, account recovery, secure deletion, suspension, abuse handling, and privacy controls in separate approved implementation contracts.

## 11. V1 Boundary Check

This mission does not implement:

- Authentication system.
- Authorization system.
- Admin dashboard.
- Payments.
- Subscriptions.
- Marketplace.
- Commissions.
- Messaging.
- Chat.
- AI.
- Automation.
- APIs.
- Database models.
- Migrations.
- UI screens.
- Backend code.
- Frontend code.
- Production infrastructure.

## 12. Architecture Decisions

1. User Account is the private identity anchor; profiles are public or semi-public representations.
2. Professional, business, organization, partner, and representative identities must remain distinct from user login identity.
3. Owner, Admin, Manager, Representative, Member, and Worker are canonical role names for future permission mapping.
4. Permissions derive from role, resource, ownership, and relationship context.
5. Organization membership is not ownership, partnership, representation, worker status, or provider status by default.
6. Account lifecycle states are Created, Pending, Active, Suspended, and Archived.
7. Trust Level is scoped to identity/resource/relationship type and must not be duplicated globally.
8. This contract does not create authentication or authorization runtime behavior.

## 13. Remaining Risks

- Field-level permissions are not yet defined.
- Role transitions and approval flows remain documentation-only.
- Ownership transfer rules need a future lifecycle specification.
- Account recovery and deletion policies are not yet defined.
- Organization membership roles currently implemented as owner/member will need reconciliation before richer roles.
- Representative and worker roles can still be confused without future relationship and Job Work contracts.
- Trust and verification workflows require future privacy and security specifications.

## 14. Readiness Score Update

Readiness score after Mission 038 identity contract: **78 / 100**.

Rationale: Identity, account types, role names, permission principles, ownership boundaries, organization membership, lifecycle states, and trust compatibility are now reconciled at the architecture-contract level. Implementation should still wait for field-level permissions, state transitions, audit requirements, and security-specific implementation contracts.

## 15. Recommended Next Mission

Recommended next mission: **Mission 039 — Field-Level Permission Matrix, Lifecycle State Transitions & Audit Contract**.

Purpose: define permission keys, allowed actions, state transitions, audit events, and lifecycle rules for users, profiles, organizations, partners, representatives, workers, services, and trust without implementing runtime code.
