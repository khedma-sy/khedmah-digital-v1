# Khedmah Full-Site Design Repair Program — Fixed Execution Roadmap

## Executive rule

This roadmap is fixed for PR #166. The execution order does not change because a later page looks more interesting or receives a cosmetic request. The only permitted interruption is a P0 security, data-loss, build, or route-breaking defect. Any such interruption is repaired and execution returns to the same roadmap position.

The objective is to converge the complete web product without destabilizing approved behavior. Arabic-first RTL, the shared Khedmah header, the umbrella brand, and existing backend/API contracts are protected invariants.

## Seven-role gate — mandatory for every route

A route is not complete until all seven gates pass:

1. **Product UX** — task hierarchy, navigation, journey clarity, empty/loading/error states.
2. **Visual UI** — spacing, composition, density, imagery, card hierarchy and CTA priority.
3. **Arabic RTL & Typography** — Arabic reading flow, font loading, metrics, line wrapping and icon alignment.
4. **Responsive** — mobile, tablet and desktop without overflow, hidden actions or broken grids.
5. **Accessibility** — semantic landmarks, labels, focus visibility, dialog semantics, contrast and reduced motion.
6. **Design System** — shared tokens/primitives, section accents, no inline reinvention and no duplicate shell ownership.
7. **QA / Regression** — build, route behavior, API contract preservation, regression tests and CI evidence.

## Protected invariants

- Global `khedma-header` remains owned by `app/layout.tsx` and the canonical shell layer.
- Arabic `lang="ar" dir="rtl"` remains global.
- Functional success/warning/danger colors remain separate from brand section accents.
- Home/global shell remain navy-led.
- Categories/service directory remain green-led.
- Commerce/store/food remain orange-led.
- Authentication may remain an isolated journey; ordinary product pages may not hide or replace the global header.
- No visual task may silently alter backend/API contracts.
- No direct work is performed on `main`; PR #166 remains the controlled integration boundary until all mandatory gates are green.

# Fixed execution phases

## Phase 0 — CI and repository integrity — BLOCKING

**Goal:** establish a green technical baseline before further visual expansion.

Mandatory checks:
- Root `npm test` / `test:all`.
- Workspace tests.
- Frontend production build.
- Existing Firebase/Google/Terraform validations in CI.
- New design regression tests.
- No unresolved CSS-module class references introduced by this PR.
- No browser `prompt/alert/confirm` in moderation decisions.

Exit criteria:
- Node.js CI green.
- PR Preview quality-gates green through test, lint/type, security and validation steps.
- Khedmah Test & Verify green.

**Current status:** IN PROGRESS. First confirmed regression fixed: professional owner workspace referenced missing CSS-module classes; repaired in commit `61e77b0`.

## Phase 1 — Foundation and shell

Order is fixed:
1. Design tokens and approved brand accents.
2. Global header/navigation ownership.
3. Global Arabic typography loading and scale.
4. Shared UI primitives: button/link/surface/header/status/empty/loading states.
5. CSS cascade cleanup: eliminate duplicate component ownership from token files and prevent new layering debt.

Exit criteria:
- One canonical shell authority.
- One guaranteed Arabic font strategy.
- Shared interactive states for hover/focus/disabled/loading.
- No route-level replacement of the global shell.

## Phase 2 — Public discovery

Fixed order:
1. Home `/`.
2. Discover/Search `/search` and discovery surfaces.
3. Categories `/categories` and catalog directory.
4. Nearby/Map `/map` and legacy redirect `/locations`.
5. Mobility/Taxi/Delivery `/mobility`.
6. Store/Classifieds `/store` and associated listing surfaces in scope.

For each route: seven-role gate, desktop/mobile verification and regression evidence before moving forward.

## Phase 3 — Provider and business journeys

Fixed order:
1. Business profiles list.
2. Business public detail.
3. Business create/edit.
4. Business manage workspace.
5. Professional profiles owner page.
6. Professional public detail.
7. Professional search/list.
8. Professional create/edit.
9. Organizations existing-management surfaces.

Exit criteria include coherent CTA hierarchy, media handling, moderation states, contact eligibility and shared owner workspace behavior.

## Phase 4 — Account, authentication and trust

Fixed order:
1. Welcome.
2. Login.
3. Register.
4. Password reset.
5. Verification flows.
6. User account/profile.
7. Trust/status messaging shared across authenticated journeys.

## Phase 5 — Administration and moderation

Fixed order:
1. Admin shell/navigation.
2. Operations summary/product surfaces.
3. Moderation queues.
4. Approval/rejection dialogs.
5. Reports and product-review decisions.
6. Permission-gated administration states.

Browser-native decision prompts are prohibited for moderation actions.

## Phase 6 — Full-site visual and responsive audit

This is not a cosmetic pass. It is a route matrix audit covering:
- 320–375px mobile.
- 390–430px mobile.
- tablet breakpoint.
- standard desktop.
- wide desktop.
- Arabic line wrapping.
- long names and descriptions.
- empty/loading/error states.
- keyboard focus.
- reduced motion.
- image contain/crop behavior.
- header overflow and action collapse.

## Phase 7 — Consolidation and debt removal

Only after route behavior is stable:
- Remove obsolete duplicate CSS declarations made redundant by canonical layers.
- Consolidate system files where safe; do not create `fix-v2/final-final` layers.
- Remove stale selectors and unused classes introduced or exposed by the repair.
- Update this document with measured final status, not subjective PASS labels.

## Phase 8 — Final release gate

PR #166 may leave Draft only when:
- All mandatory CI workflows are green on the current HEAD.
- No P0/P1 route or visual regression remains.
- Every in-scope route has a seven-role result recorded.
- Header, RTL and section identity invariants are verified.
- No unresolved test assertion is waived merely to obtain green CI.
- `main` has not diverged in a way that invalidates the review; if it has, rebase/merge-main verification is required before approval.

# Scoring model

Each route receives 0–10 in each of the seven gates. A route is accepted only when:
- no gate is below 8/10,
- average is at least 8.5/10,
- QA / Regression is PASS,
- no P0/P1 defect remains.

# Status discipline

Allowed statuses only:
- `NOT STARTED`
- `IN REVIEW`
- `FIXED — AWAITING CI`
- `PASS`
- `BLOCKED`

`PASS 1`, `looks good`, or color-only completion are not final statuses.

# Current branch safety

- Repair branch: `design-system-repair-2026-09-07`.
- Integration PR: #166.
- `main` remains untouched by direct design-repair edits.
- PR remains Draft until Phase 8.
