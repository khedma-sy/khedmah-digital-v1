# KDOS P1-02 — Professional Contact Journey Closure

**Date:** 2026-08-14  
**Scope:** P1-02 only; canonical schema remains 016

## 1. Root cause

The backend exposed the canonical Professional Contact submission route added in P1-01, but `/professional-profiles/[id]` had no eligible inquiry CTA and the frontend API offered submission only beneath its Business namespace. The existing Business form was also a single-stage component located inside the Business route, so Professional could not reuse a proven REF-011 → REF-012 → REF-013 journey.

## 2. Current Business vs Professional matrix

| Layer | Business journey | Professional journey before | Shared? | Gap | Action |
|---|---|---|---|---|---|
| Public detail | Eligible CTA | No CTA | No | Journey unavailable | Mount shared component after canonical eligibility |
| Request details | Business-local form | None | No | REF-011 absent | Move one form to `components` and add details stage |
| Contact data | Name/email/message together | None | No | REF-012 absent | Shared minimal name/email final stage |
| API | Business helper | Backend route only | Partly | Client could not select canonical target | One `api.contact.submitInquiry(target, …)` |
| Idempotency | Shared guard in Business path | Backend only | No | No Professional client key | Move and reuse the same guard |
| Receipt | Inline Business receipt | None | No | Professional target fields absent | Shared REF-013 with target-aware receipt |
| Owner read | Authorized Business inbox | No Professional read contract | Same domain | Risk of Business inbox leakage | Add owner-scoped Professional query and endpoint |

## 3. Shared-component decision

There is exactly one `ContactInquiryForm`, one stylesheet, and one `InquirySubmissionGuard` under `apps/frontend/components`. It accepts a discriminated canonical target (`business` or `professional`) and provider public name. Both detail pages mount that component; validation, stages, errors, retry locking, and receipt rendering are not duplicated.

## 4. Professional eligibility

The Professional detail response optionally includes canonical `contactEligibility`, read from `professional_profiles`: `visibility`, `moderation_status`, and `lifecycle_status`. `eligible` is true only for `public` + `approved` + `active`. The CTA is rendered only then. On submission, Contact independently repeats those catalog checks; frontend state is never the authority.

## 5. CTA

Eligible Professional detail renders the existing Arabic `اطلب الخدمة` inquiry action within the established header actions. It makes no booking, hiring, guarantee, or instant-response promise.

## 6. REF-011

The first shared stage accepts request details only. It trims before advancing, enforces 10–2000 characters, focuses the invalid textarea, performs no API call, preserves details when returning from REF-012, and supports cancel/Escape with focus returned to the opener.

## 7. REF-012

The second shared stage accepts only name and reply email. Final submission sends exactly normalized name, email, and the preserved message. No phone, address, coordinates, SMS, or call preference was added.

## 8. Idempotency

Business and Professional use the same `InquirySubmissionGuard` and `api.contact.submitInquiry`. The synchronous latch prevents double click before React rerender; a failed attempt retains its key; only explicit new-journey reset creates a new key.

## 9. Receipt

The same REF-013 renders the canonical UUID, `targetType`, the matching Business or Professional identifier, `createdAt`, and `trackingStatus`. The backend receipt derives target type from the exactly-one-target inquiry and never emits a fake Business identifier for Professional.

## 10. Return context

Return links are constructed internally from the discriminated target, producing only `/business-profiles/{id}` or `/professional-profiles/{id}`. Professional Search → Detail remains available through the detail navigation. No caller-supplied URL, external redirect, protocol-relative host, or backslash path is accepted.

## 11. Error and retry

The shared journey handles initial detail loading/unavailability at the detail page and validation, authentication, eligibility/access, rate limit, idempotency conflict, network failure, and retry in the form. Failed final submissions focus the first Contact input and leave the P1-01 key intact.

## 12. Rate limit and abuse

The Professional controller delegates to the same `ContactService.submitInquiry`. The shared path executes Contact validation, idempotency lookup, canonical eligibility, rate limiting, abuse checks, transactional persistence, audit correlation, and the common receipt projection. There is no Professional bypass.

## 13. Owner inbox boundary

No inbox UI was redesigned. A Professional owner read endpoint was added to the existing Contact controller/service/repository. It compares the authenticated actor to canonical `professional_profiles.user_identifier` and selects only `contact_inquiries.professional_profile_id`; Business inbox queries remain restricted to `business_profile_id`.

## 14. Accessibility

The shared flow retains explicit labels, HTML required/min/max validation, `aria-invalid`, `aria-busy`, `role=alert`, `role=status`, focus on the current/invalid first field, Escape cancellation, opener focus return, visible focus rules, Arabic copy, and inherited RTL layout.

## 15. Responsive

The shared panel uses fluid width, `overflow-wrap`, clamp-based padding, wrapping host actions, and a mobile media rule that stacks final/receipt actions below 34rem. At 390px there is no fixed content width or horizontal overflow requirement. This is source evidence only; browser proof remains outside this mission.

## 16. Data Truth

The Professional detail’s uncontracted price/hourly presentation and availability promise badge were removed in this journey repair. The CTA and receipt explicitly describe an inquiry, not booking or guaranteed fulfillment. Existing verification display remains backed by the verification API response rather than a fabricated claim.

## 17. Business regression

Business detail now configures the same target-aware component with `type: business`. Existing Business eligibility checks remain unchanged. Its Contact journey tests pass with the new shared stages, common idempotency, and common receipt.

## 18. PostgreSQL environment status

PostgreSQL remains unavailable at `127.0.0.1:5432`. No installation retry was attempted. Existing P0 and P1-01 PostgreSQL runtime evidence gates remain external; P1-02 does not claim database runtime evidence.

## 19. Tests

Focused frontend tests prove eligible CTA exposure, one component, exact Professional target selection, REF-011/012 minimal fields, shared idempotency, target-aware REF-013, safe return construction, forbidden-field exclusions, accessibility, and Business reuse. Root source contracts prove the Professional controller uses the same Contact service and that the owner inbox is canonically scoped.

## 20. Files

- `apps/frontend/components/contact-inquiry-form.tsx`
- `apps/frontend/components/contact-inquiry-form.module.css`
- `apps/frontend/components/inquiry-idempotency.ts`
- `apps/frontend/app/business-profiles/[id]/page.tsx`
- `apps/frontend/app/professional-profiles/[id]/page.tsx`
- `apps/frontend/lib/api-client.ts`
- `apps/frontend/tests/contact-inquiry-experience.test.ts`
- `apps/frontend/tests/inquiry-idempotency.test.ts`
- `apps/frontend/tests/professional-contact-journey.test.ts`
- `apps/backend/src/contact/*`
- `apps/backend/src/professional-profiles/*`
- `tests/professional-contact-journey-contract.test.mjs`

## 21. Commit

The implementation, tests, and report are committed together. The delivery record supplies the final object ID because a commit cannot embed its own final hash.

## 22. Remaining P1 count

P1-02 closes one of the seven remaining P1 items source-side. P1-03 was not started.

---

P1-02 =  
PASS (source-side)

P1 REMAINING =  
6

P0 EXTERNAL GATE =  
PostgreSQL Runtime Verification

NEXT LEGAL MISSION =  
PostgreSQL runtime verification when an approved environment is available; otherwise stop pending governed selection of P1-03.
