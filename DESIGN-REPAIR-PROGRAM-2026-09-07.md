# Khedmah Full-Site Design Repair Program — 2026-09-07

## Objective

Repair the entire web experience without destabilizing the product shell or overwriting approved behavior. Arabic-first RTL, the shared header, and the Khedmah umbrella brand remain protected invariants.

## Seven-role review gate for every page

Every route must pass the same seven review perspectives before it is considered visually closed:

1. **Product UX** — hierarchy, task completion, navigation and journey clarity.
2. **Visual UI** — spacing, composition, card density, imagery and hierarchy.
3. **Arabic RTL & Typography** — Arabic reading flow, font metrics, line wrapping and icon alignment.
4. **Responsive** — mobile, tablet and desktop behavior without overflow or collapsed actions.
5. **Accessibility** — focus, labels, semantics, contrast and reduced motion.
6. **Design System** — shared tokens/primitives, section accent compliance and no local reinvention.
7. **QA / Regression** — header preservation, route behavior, state handling and test coverage.

## Protected invariants

- Global `khedma-header` remains owned by `app/layout.tsx`.
- Arabic `dir="rtl"` remains global.
- Functional state colors are separate from brand section accents.
- Categories/service directory use the green sector accent.
- Commerce/store/food use the orange sector accent when migrated.
- Home/global shell remain navy-led.
- No page may hide or replace the global header unless explicitly approved for an isolated journey such as authentication.
- Existing backend/API contracts are out of scope for visual repair unless a visual defect proves a contract mismatch.

## Repair order

### Foundation
- Shared brand/section tokens.
- Header and navigation convergence.
- Typography loading and scale.
- UI primitives and shared surfaces.

### Public discovery
- Home.
- Search / Discover.
- Categories / Service catalog.
- Map / Nearby.
- Mobility / Taxi & Delivery.
- Store / Classifieds.

### Provider and business journeys
- Business profiles list/detail/create/manage.
- Professional profiles list/detail/search/create.
- Organizations.
- Locations.

### Account and trust
- Login/register/reset/verify.
- User account.
- Welcome.

### Operations
- Admin.
- Moderation.
- Operations product.

## Completion rule

A route is not marked complete because its color changed. It must pass all seven review gates and remain consistent with the shared shell at mobile and desktop widths.
