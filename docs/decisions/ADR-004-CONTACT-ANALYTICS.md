# ADR-004: Contact and Analytics Foundation

## Status

Accepted for documentation and architecture preparation.

## Context

Khedmah Digital V1 is an Arabic-first business growth platform foundation. After public discovery preparation, the platform needs a governed foundation for controlled contact intent and privacy-aware analytics definitions.

Contact must mean controlled communication intent between a user and an approved business. It must not become chat, instant messaging, conversations, social network behavior, Messaging, Marketplace, Payments, Advertising, Ranking, Recommendations, AI, Community, or Khedmah Connect.

Analytics must remain limited to event definitions until a separate authorized implementation mission approves runtime work. Event planning must avoid unnecessary personal data, private owner data, internal moderation data, private user information, secrets, credentials, and production URLs.

## Decision

Adopt a controlled inquiry/contact and privacy-aware analytics foundation for V1.

The V1 foundation will prepare contracts for:

- Inquiry submission.
- Contact action tracking.
- Business owner notification preparation.
- Privacy-aware event definitions such as business view, search action, contact action, and inquiry submitted.
- Rate limiting, spam prevention, validation, and abuse reporting preparation.
- Arabic-first, RTL-safe, and accessible future user-facing behavior.

This decision is documentation and architecture preparation only.

## Alternatives Considered

### Implement full messaging

A full messaging system could support ongoing conversations between users and businesses.

### Implement production analytics immediately

A production analytics implementation could collect, store, and process events immediately.

### Use advertising or recommendation analytics

Analytics could be designed around paid promotion, ranking, recommendations, or behavioral targeting.

### Defer all contact and analytics planning

The project could postpone Contact and Analytics contracts until implementation begins.

## Alternatives Rejected

### Full messaging rejected

Full messaging is rejected because it expands V1 beyond controlled communication intent and introduces chat, instant messaging, conversations, social network behavior, moderation complexity, and privacy obligations not approved for this mission.

### Immediate production analytics rejected

Immediate production analytics is rejected because this mission does not authorize runtime implementation, event storage, tracking scripts, dashboards, packages, APIs, databases, migrations, or production infrastructure.

### Advertising or recommendation analytics rejected

Advertising, Ranking, Recommendations, AI, Marketplace, Community, and Khedmah Connect behavior are rejected because they are outside this Contact and Analytics foundation and could expand V1 without governance approval.

### No planning rejected

Deferring all planning is rejected because secure contracts should be defined before implementation to protect privacy, abuse boundaries, Arabic-first requirements, accessibility, and V1 scope.

## Consequences

- Future Contact work must remain controlled inquiry/contact intent, not Messaging.
- Future Analytics work must begin from privacy-aware event definitions, not production tracking assumptions.
- Public Discovery and Trust Foundation boundaries must be respected.
- Anti-abuse, validation, privacy, security, Arabic-first, RTL, and accessibility requirements must be reviewed before implementation.
- Future implementation still requires separate mission authorization.

## Security Considerations

Future implementation must include:

- Rate limiting for inquiry and contact actions.
- Spam prevention for automated or abusive submissions.
- Input validation at every external boundary.
- Authorization for owner-facing and operational access.
- Safe notification boundaries that do not expose private owner data publicly.
- Privacy-aware event payloads that minimize private user information.
- Safe logging and audit boundaries that avoid secrets, credentials, tokens, private keys, API keys, production URLs, private owner data, private user information, and internal moderation data.
- Abuse reporting preparation.

## Non-Implementation Confirmation

This ADR does not implement Contact or Analytics.

It creates no backend runtime code, frontend screens, APIs, database entities, database tables, migrations, packages, production infrastructure, secrets, credentials, production URLs, Messaging, Marketplace, Payments, Advertising, Ranking, Recommendations, AI, Community, Khedmah Connect, or analytics implementation.
