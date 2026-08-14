# KDOS P1-03 — Canonical Locations and cityCode Closure

**Date:** 2026-08-14  
**Scope:** P1-03 only; canonical schema remains 016

## 1. Root cause

Active discovery pages used `cityCode` in backend requests but duplicated incomplete city arrays for selection and labels. Professional Search did not restore URL state. Global Search restored some parameters but did not consistently emit city changes or pagination into the URL. `/locations/[slug]` still linked with `location`. Profile creation defaulted silently to Damascus and exposed unrelated international country choices for Syria-first flows.

## 2. Full location usage matrix

| Surface | Current field/source before | Canonical source | Action | Risk addressed |
|---|---|---|---|---|
| Global/advanced Search | `cityCode`, local `CITIES` | Locations API, `countryCode=SY` | Shared hook, canonical URL synchronization | Duplicate taxonomy/invalid URL |
| Professional Search | local state and `CITIES`, no URL restore | Locations API + URL `cityCode` | URL restore/change/clear/page reset | Unshareable filter state |
| Business creation | Damascus default, local cities, international countries | Locations API Syrian cities | No default; fixed `SY`; truthful load/error | Fake authority/default |
| Professional creation | Damascus default, local cities, international countries | Locations API Syrian cities | Same convergence | Profile drift |
| Business/Professional detail labels | local label maps | Locations projection | Shared localized lookup | Display taxonomy drift |
| `/locations/[slug]` | route slug emitted as `location` | Canonical Syrian city codes | Emit `cityCode`; complete governed Syrian codes | Receiver mismatch |
| Map/Nearby request | `location` geo object, lat/lng/bounds | Geospatial request contract | Unchanged and documented distinct | city/coordinate conflation |
| Nearby saved city | No active saved preference UI in checkout | Reserved canonical `cityCode` | No new feature; document requirement | Scope expansion |
| Supplier discovery | No active Supplier UI in checkout | International coverage remains separate | No changes | Syrian/international conflation |
| Welcome/Syria map | Decorative province coordinates/routes | Route presentation, not selector authority | Leave active presentation intact | Unrelated legacy cleanup |

## 3. Canonical contract

Public discovery persists, queries, and emits only stable `cityCode`. Human labels come from the Locations projection. The backend validates Business, Professional, and unified Search city inputs against the same governed Syrian catalog. Empty filters are omitted rather than serialized as empty, `undefined`, or `null` values.

## 4. Locations API

`useSyrianCities` is the one frontend loading boundary over `api.locations.cities()`. Search, creation, and detail surfaces reuse it rather than issuing ad-hoc fetches. It exposes loading, error, and retry state and installs no static fallback.

## 5. Syrian filtering

The shared hook filters `countryCode === 'SY'`. Syria-first creation submits `countryCode: 'SY'` and no longer presents international consumer choices. The governed Locations projection was completed for all existing Syrian governorate route codes. Supplier international coverage was not changed.

## 6. Business

Global Business discovery uses canonical Locations options and `cityCode` requests. Business creation begins with no city selected, disables submission until a governed Syrian city is chosen, and reports Locations failures honestly. Business detail labels use the same Locations projection.

## 7. Advanced Search

Global Search reads `cityCode` and `page` from URL, validates city values against loaded Syrian records, and passes only the canonical code to Business, Professional, or unified search APIs. City change emits the URL and resets page to 1. Clear emits `/search` with no city pseudo-value.

## 8. Map and Nearby

Map `location` is an in-memory latitude/longitude object and its request uses coordinates/bounds; it is not a city taxonomy alias and was intentionally unchanged. No continuous GPS or new Nearby behavior was added.

## 9. Professional

Professional Search now uses the Locations API, restores supported direct `cityCode` URLs, safely removes unknown codes, emits canonical URLs, resets pagination, and displays localized API labels. Professional detail and creation use the same projection. P1-02 Contact remains unchanged.

## 10. Supplier separation

No active Supplier discovery UI is present in this checkout. International supplier coverage metadata was not converted into Syrian consumer `cityCode`, and no Supplier fields or behavior were introduced.

## 11. Nearby preferences

No active DESIGN-006 saved-city preference surface is present in this checkout. The reserved contract remains: any future saved city must store a canonical Locations code, never its display label. This mission did not implement the reserved feature.

## 12. URL synchronization

Global and Professional Search use URL `cityCode` as the restorable public state. Browser navigation changes the search parameters observed by the pages. Unsupported URL text is never inserted as an option and is normalized away. No `location` query alias remains on repaired discovery surfaces.

## 13. Pagination and reset

Selecting or clearing a city sets page 1. Pages greater than 1 are emitted only as `page`; clearing filters removes the parameter. Direct supported URLs restore their page and city before querying.

## 14. Return context

Existing browser Back behavior from Business/Professional Detail returns to the canonical URL-bearing search entry, so `cityCode` remains available without resurrecting `location`. Authentication/open-redirect handling was not modified.

## 15. Error handling

While Locations loads, selectors are disabled. On failure, the pages show a truthful status with retry and leave non-location discovery usable where applicable. No static list, fake default city, or arbitrary URL option is substituted.

## 16. Accessibility

All selectors retain associated labels and native keyboard behavior. Disabled loading/error states prevent misleading interaction. Errors use status semantics, retry controls are buttons, existing visible focus and RTL foundations remain intact.

## 17. Data Truth

Silent Damascus defaults and active duplicated selector lists were removed. Detail labels are API-derived, while an unavailable label degrades to its stable code rather than an invented Arabic name. Decorative Welcome map data remains presentation-only and is recorded as outside authority/cleanup scope.

## 18. Compatibility aliases

No compatibility alias was justified. `/locations/[slug]` now emits `cityCode` directly; repaired pages neither accept nor emit `location` as search taxonomy. The geospatial map variable named `location` is not a URL compatibility alias.

## 19. PostgreSQL external status

PostgreSQL remains an external runtime gate. No installation retry occurred. P1-03 adds no migration and makes no runtime database evidence claim.

## 20. Tests

Focused tests cover Locations API sourcing, Syrian filtering, valid/invalid code normalization, URL restoration, city/page reset, clear behavior, no static selector arrays, no legacy query alias, governorate links, and geo separation. Business, Professional, Contact, root, build, audit, and diff checks are recorded in delivery evidence.

## 21. Files

- `apps/frontend/lib/use-syrian-cities.ts`
- `apps/frontend/app/search/page.tsx`
- `apps/frontend/app/professional-profiles/search/page.tsx`
- `apps/frontend/app/business-profiles/new/page.tsx`
- `apps/frontend/app/professional-profiles/new/page.tsx`
- `apps/frontend/app/business-profiles/[id]/page.tsx`
- `apps/frontend/app/professional-profiles/[id]/page.tsx`
- `apps/frontend/app/locations/[slug]/page.tsx`
- `apps/backend/src/locations/locations.service.ts`
- `apps/backend/src/business-profiles/business-profile.validation.ts`
- `apps/backend/src/professional-profiles/professional-profile.validation.ts`
- `apps/backend/src/search/search.validation.ts`
- `apps/frontend/tests/canonical-citycode-convergence.test.ts`
- `tests/canonical-citycode-convergence-contract.test.mjs`

## 22. Commit

The implementation, tests, and report are committed together. The delivery record supplies the final object ID.

## 23. Remaining P1 count

P1-03 closes one of six remaining P1 items source-side. P1-04 was not started.

---

P1-03 =  
PASS (source-side)

P1 REMAINING =  
5

P0 EXTERNAL GATE =  
PostgreSQL Runtime Verification

NEXT LEGAL MISSION =  
PostgreSQL runtime verification when an approved environment exists; otherwise stop pending governed selection of P1-04.
