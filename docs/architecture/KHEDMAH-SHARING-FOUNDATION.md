# Khedmah Digital Sharing Foundation

## Mission Boundary

This foundation is documentation and architecture preparation only. It does not implement production features, APIs, database models, migrations, UI screens, social network features, followers, likes, comments, messaging/chat, advertising, paid promotion, ranking, marketplace, affiliate systems, commissions, AI recommendations, jobs, automations, or production infrastructure.

## Sharing Vision

Khedmah Digital sharing is a branded sharing layer that allows discovery and knowledge to spread outside the platform while preserving Khedmah Digital identity, Arabic-first presentation, and V1 scope protection.

Core identity:

```text
☂️ أنا مع خدمة 💙
```

Sharing should help users, professionals, businesses, services, and local discoveries travel beyond the platform as public, safe, branded discovery entry points. It is a growth foundation, not a social network.

## Sharing Content Types

### A. Professional Knowledge

Future sharing can support public professional knowledge content such as:

- Doctor articles.
- Dentist knowledge.
- Engineer articles.
- Lawyer awareness content.
- Technical expertise.

Professional knowledge sharing should present educational or awareness-oriented content with public author/provider identity when approved. It must not expose private consultation details, patient/client information, private messages, paid promotion, ranking, or AI recommendations.

### B. Business Profiles

Future sharing can support public business profile cards for:

- Restaurants.
- Shops.
- Workshops.
- Factories.
- Suppliers.

Business profile sharing should expose only approved public profile information. It must not share owner-private fields, verification evidence, internal moderation status, contact abuse signals, private analytics, or transaction data.

### C. Services

Future sharing can support public service cards for:

- Home services.
- Technical services.
- Professional services.

Service sharing should connect a public service description to a provider or business profile and discovery path. It must not imply ordering, payments, commissions, delivery, inventory, marketplace eligibility, or affiliate tracking.

### D. Local Discoveries

Future sharing can support public local discovery cards for:

- New business in area.
- New service provider.
- Local discovery.

Local discovery sharing should use structured public location context such as country, city, area, or service coverage. It must not expose a user's private location, personal activity, favorites, recent services, or precise geolocation without explicit future consent contracts.

## Share Card Foundation

Future shared cards should use a consistent, Arabic-first, public-safe structure:

- Khedmah umbrella identity.
- `أنا مع خدمة` slogan.
- Provider/business identity.
- Category/service.
- Short description.
- Public profile link.

### Share Card Guardrails

- The Khedmah umbrella identity should remain clearly visible.
- The `أنا مع خدمة` slogan should reinforce brand/community direction without creating social network mechanics.
- Provider or business identity must come from approved public profile data only.
- Category and service labels must come from governed taxonomy values.
- Short descriptions must be public-safe and moderation-aware.
- Public profile links must not include secrets, private tokens, private user identifiers, or private tracking data.
- Share cards must not contain likes, comments, follower counts, paid badges, ranked position, advertising labels, affiliate codes, commission metadata, or AI recommendation labels.

## Sharing Relationship

The official sharing relationship is:

```text
Content
↓
Share Card
↓
External User
↓
Khedmah Digital Discovery
```

Sharing starts from approved public content, creates a branded share card, reaches an external user outside the platform, and brings that user into Khedmah Digital discovery. The relationship is discovery and growth-oriented only. It does not create a social feed, follower graph, chat channel, marketplace transaction, paid promotion system, ranking system, affiliate system, commission system, or AI recommendation loop.

## Compatibility Analysis

### Compatibility With `business_profiles`

Sharing is compatible with future `business_profiles` if shared cards use approved public profile fields only. A future profile should clearly separate public shareable identity, private owner data, private contact routing data, moderation data, and verification evidence.

Required future decisions:

- Which business profile fields are shareable.
- How profile visibility affects share availability.
- How removed, suspended, rejected, or private profiles invalidate shared links.
- How Arabic labels and optional secondary-language labels appear on share cards.

### Compatibility With Professional Profiles

Sharing is compatible with professional profiles if public professional identity, category, service, and trust display are governed. Professional cards must never expose private client, patient, legal, technical, or credential evidence details.

Required future decisions:

- Which professional credentials can be publicly summarized.
- Whether articles can be attached to professional profiles.
- How professional trust status affects share card availability.
- How regulated or high-risk professional categories are reviewed before sharing.

### Compatibility With Service Taxonomy

Sharing depends on governed service taxonomy values. Shared service cards should reference category, subcategory, and service labels without creating transaction behavior.

Required future decisions:

- Whether cards share a provider, a service, or both.
- Which taxonomy labels are mandatory on a share card.
- How owner-proposed service descriptions are moderated.
- How service cards remain separate from orderable product listings.

### Compatibility With Public Discovery

Sharing should route external users into public discovery and public profile views after those experiences are approved. Share cards should be discovery entry points, not social posts or ads.

Required future decisions:

- Link routing rules for public discovery pages.
- Link expiration or invalidation behavior when content changes.
- Abuse reporting for shared public links.
- Analytics boundaries for public share interactions.

### Compatibility With Trust Foundation

Sharing can display public-safe trust information such as a future verification label or profile confidence indicator only after trust contracts define what can be shown. Shared cards must not expose private verification evidence or use trust as paid visibility.

Required future decisions:

- Which trust labels can appear on share cards.
- How trust changes affect existing shared cards.
- How suspended, rejected, or expired trust states affect public sharing.
- How trust display avoids ranking, paid badges, and advertising.

### Compatibility With Locations

Sharing is compatible with structured locations if cards use public country, city, area, or service coverage values. Sharing should avoid free-text location dependency and never expose private precise location or user activity location.

Required future decisions:

- Which location fields are shareable.
- Whether service coverage or branch location appears on cards.
- How cross-border partner or supplier discovery cards display location context.
- How local discovery cards avoid implying user tracking.

## Security & Privacy

Sharing must use public information only.

Security and privacy requirements:

- No private user information exposed.
- No personal activity sharing without consent.
- No private verification evidence exposed.
- No private owner data exposed.
- No private moderation data exposed.
- No private analytics or abuse signals exposed.
- No secrets, credentials, tokens, API keys, passwords, production URLs, or production infrastructure values embedded in shared links or cards.

Future implementation must define consent, retention, link safety, abuse handling, and visibility invalidation before runtime work begins.

## V1 Boundaries

This sharing foundation does not implement:

- Social feed.
- Followers.
- Likes.
- Comments.
- Chat.
- Advertising.
- Ranking.
- Paid visibility.
- Paid promotion.
- Marketplace.
- Affiliate systems.
- Commissions.
- AI recommendations.

## Architecture Decisions

1. Define sharing as a branded external discovery layer, not a social network.
2. Use `☂️ أنا مع خدمة 💙` as the core sharing identity.
3. Keep share cards based on approved public profile, content, service, taxonomy, location, and trust data only.
4. Route sharing toward Khedmah Digital discovery rather than transactions, feeds, chats, or paid promotion.
5. Keep professional knowledge, business profiles, services, and local discoveries as share-compatible content types.
6. Require public/private field separation before any share runtime implementation.
7. Preserve Arabic-first and right-to-left presentation in future sharing experiences.

## Risks

- Sharing could drift into a social feed if likes, comments, followers, or reactions are introduced without governance.
- Share cards could leak private user, owner, verification, moderation, analytics, or location data if public/private boundaries are weak.
- Business profile cards could become advertisements or paid promotion if visibility rules are not explicit.
- Service cards could be misread as orderable listings if marketplace, payments, commissions, or delivery are not excluded.
- Local discovery cards could imply user tracking if location consent and privacy rules are not defined.
- Trust labels could become paid badges or ranking signals if trust display governance is not strict.
- Affiliate codes or commission metadata would conflict with the V1 sharing foundation.

## Explicit Exclusions

This sharing foundation does not authorize or implement:

- Production features.
- APIs.
- Database models.
- Migrations.
- UI screens.
- Social network features.
- Followers.
- Likes.
- Comments.
- Messaging/chat.
- Advertising.
- Paid promotion.
- Ranking.
- Marketplace.
- Affiliate systems.
- Commissions.
- AI recommendations.
