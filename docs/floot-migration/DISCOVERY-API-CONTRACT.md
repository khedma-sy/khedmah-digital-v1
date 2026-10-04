# Khedmah to Floot — category and public discovery contract

Status: source-backed migration input, NOT a live or certified Floot integration.
Reviewed source: `khedma-sy/khedmah-digital-v1` at `5a961be5035dce1197ba2d0c65519e86f65ca4c6`.
Date: 2026-10-04. No application logic or deployed configuration is changed by this document.

## 1. Scope and source owners

| Source path | Reviewed behavior |
| --- | --- |
| `apps/backend/src/categories/category.controller.ts` | Public category list and detail controller routes. |
| `apps/backend/src/categories/category.service.ts` | Active-category lookup; distinction between non-root write categories and discovery filters. |
| `apps/backend/src/categories/category.repository.ts` | Database-backed category projection and active list ordering. |
| `apps/backend/src/categories/category.validation.ts` | Category code syntax. |
| `apps/backend/src/search/search.controller.ts` | Unified search query names. |
| `apps/backend/src/search/search.validation.ts` | Unified search parsing and its current limits. |
| `apps/backend/src/search/search.service.ts` | Collections, limit/offset, map mode and response shape. |
| `apps/backend/src/search/provider-ranking.ts` | Ranking of the already fetched business subset. |
| `apps/backend/src/locations/locations.service.ts` | Supported Syrian city-code predicate used by unified search. |
| `apps/backend/src/business-profiles/business-profile.repository.ts`, lines 207–275 | Public business retrieval/count and ordering before ranking; not a full repository audit. |
| `apps/backend/src/business-profiles/business-profiles.controller.ts` | Business search route and four query fields. |
| `apps/backend/src/service-catalog/service-catalog.controller.ts` | Service search route and four query fields. |
| `apps/backend/src/professional-profiles/professional-profiles.controller.ts` | Separate professional search route; no business-category query. |
| `apps/frontend/app/search/page.tsx`, request/navigation section | Tab routing, applied URL, metadata validation and stale-response suppression. |
| `apps/frontend/lib/use-categories.ts` | Category load/retry without a replacement local catalog. |
| `apps/frontend/lib/discovery-context.ts` | Canonical URL fields and strict frontend page parser. |
| `apps/frontend/lib/search-context.ts` | Search URL generation and collection-aware pagination. |

The shared `/api/v1` prefix is established by the already reviewed backend `app.ts`; see [AUTH-API-CONTRACT.md](AUTH-API-CONTRACT.md). This review does not certify live database contents, all repository eligibility predicates, HTTP execution, or every specialized search service.

## 2. Keep one category authority

`GET /api/v1/categories` returns `{ categories }` from the active database catalog. The list is flat, with parent relationships represented by `parentCode`; ordering is `sort_order`, `name_ar`, then `code`.

The projected category fields are `code`, `nameAr`, optional `nameEn`, optional `parentCode`, `visualKey`, `isFeatured`, `status`, and `sortOrder`. Do not invent a second Floot category table, rename governed codes, replace parent relationships with translated labels, or use a cached design mock as authoritative data.

`GET /api/v1/categories/:code` trims and validates a string against `^[a-z][a-z0-9_]{1,49}$` (2–50 characters). Malformed input is rejected; a valid code with no active category raises not-found.

`CategoryService.assertActiveCategory` requires an active category with a parent. It does NOT check that the category has no children, so this is a non-root check rather than proof of a strict leaf-only taxonomy. `assertActiveCategoryFilter` accepts an active root as a discovery filter. These helper behaviors do not prove that every search route invokes them.

The existing category hook requests the API, exposes load/error/retry states, and ignores superseded responses. The search screen waits to verify selected category/city metadata and keeps a failed or invalid selection visible instead of silently turning it into an unfiltered search.

## 3. Search routes are not interchangeable

| Browser tab / purpose | GET endpoint | Query fields visible in its controller | Existing browser collection |
| --- | --- | --- | --- |
| All activities and services | `/api/v1/search` | Unified fields in section 4; UI sends `type=all` | `businesses`, `services`, `total` |
| Business | `/api/v1/businesses/search` | `q`, `categoryCode`, `cityCode`, `page` | `businesses`, `total` |
| Service listings | `/api/v1/services/search` | `q`, `categoryCode`, `cityCode`, `page` | `services`, `total` |
| Professionals | `/api/v1/professionals/search` | `q`, `cityCode`, `availability`, `page` | `professionals`; search UI does not receive/use a total |

The unified API recognizes only `all`, `business`, and `service`. The frontend's `professional` tab deliberately calls a different endpoint and clears business-category filtering. Do not send `type=professional` to the unified API.

Unified `all` means business profiles plus service listings in the inspected code, NOT professionals, products, classifieds, orders or active taxi trips. Other modules need their own contracts. The current search page supplies no `availability` filter to professional search even though that endpoint exposes it.

## 4. Unified search input — observed parsing, not an idealized schema

| Field | Current source behavior |
| --- | --- |
| `q` | Optional trimmed string, maximum 200 characters; null/undefined/empty become absent. |
| `categoryCode` | Optional trimmed string, maximum 50 characters. This parser does not invoke the canonical category validator or perform an active-category lookup. |
| `cityCode` | Optional trimmed string, maximum 50 characters, checked against `isSyrianCityCode`. Use returned governed codes, not city display names. |
| `page` | Missing defaults to 1. A number is checked for integer and >= 1; a string first goes through `Number.parseInt(value, 10)`. See the parity finding below. |
| `type` | Missing defaults to `all`; only exact `all`, `business`, `service` are accepted. |
| `map` | True only for the string `true` or boolean true; other values are not rejected here but evaluate false. |
| `latitude`, `longitude` | Individually optional, converted with `Number`; finite and within latitude +/-90, longitude +/-180. Pair completeness is not enforced here. Location ranking is supplied only when both are present. |
| `south`, `west`, `north`, `east` | If any is present, all are converted and must form a complete finite increasing box within geographic limits; this form takes precedence over `boundaries`. |
| `boundaries` | Legacy comma-separated or hyphen-separated four-number box; used only when no individual bounds were supplied. Requires south < north and west < east. |

The city predicate currently includes 14 Syrian codes. A country appearing in the separate country list is not proof that unified search accepts cities from that country.

### Open findings to preserve, not silently fix during migration

- **DISCOVERY-01 — page-parser parity:** frontend `discoveryPage` accepts only positive decimal strings with safe integer/offset arithmetic. Backend unified search uses `parseInt`, so inspection shows a string such as `2junk` can be parsed as page 2 instead of rejected. The frontend normalizes that value to page 1. Record and test any future strict backend change explicitly; this document does not change behavior.
- **DISCOVERY-02 — category validation parity:** category detail validates canonical syntax and active status, but the unified search parser checks only optional string length. The frontend separately validates selected catalog metadata. Do not claim these paths have identical rejection semantics or infer that unknown search categories always return 404.
- **DISCOVERY-03 — map scope:** map limits and bounding boxes apply to businesses in the unified service, not to service listings. Do not label the complete `all` response as geographically clipped.

These are source-derived observations. The local tests below do not exercise backend parsing, database eligibility or live requests.

## 5. Result shape, ranking and pagination

The unified service returns `{ businesses, services, total }`; it does not return `page`, `pageSize`, `totalPages`, or a cursor. Do not manufacture those fields as server evidence.

For ordinary unified search, each selected collection uses limit 20 and offset `(page - 1) * 20`. With `type=all`, a response can contain up to 20 businesses AND 20 services; `total` is the sum of their independently counted matches, not the size of one combined 20-item page.

For businesses in `map=true` mode, the limit is 200 and offset is zero regardless of the requested page. Service listings retain their normal limit/offset and receive no map bounding box from this service. A map response must not imply that every matching business has been loaded when the count exceeds the returned subset.

Public business retrieval orders by featured status then creation time. Unified search calls `rankProviders` only after retrieving this bounded subset. Its service-match, proximity, availability, rating, response and trust calculation therefore does not prove a globally nearest/best ranking across the entire database. Floot must preserve the backend result order unless a separately reviewed contract changes it.

The existing frontend pagination intentionally differs by tab:
- Business/service tabs: `ceil(total / 20)` numbered pages.
- Combined tab: no invented total page count. Next depends on returned collection lengths and a lower bound for independently traversed collections; it does not divide the sum by 20.
- Professional tab: no invented total. A full 20-item page can offer Next; a shorter page ends that known stream. A full page alone does not prove that another nonempty page exists.

## 6. URL and interaction behavior to retain

The applied URL owns the active query. Draft form edits do not alter the filters associated with displayed results. Submit/tab changes reset to page 1; pagination uses applied fields, not unsubmitted drafts.

Canonical `categoryCode` takes precedence over legacy `category`, including an explicitly empty canonical value. Generated links remove the legacy spelling, preserve unrelated URL context, use a fixed local `/search` or `/categories` path, and encode user text as query data. First-page links omit `page`.

An untouched `/search` landing is distinct from an explicit unfiltered `type=all` submission. The professional tab removes business-category data. Sequence/request-key checks suppress stale responses after navigation, retries, or unmount; metadata failures remain errors rather than empty successful results.

## 7. Bounded local evidence

Two complete frontend source files were copied from the pinned connector reads. Git blob hashes were independently recomputed and matched:

| File | Verified Git blob SHA |
| --- | --- |
| `discovery-context.ts` | `772e1bd5f4dc1133ba7efe60ab4fd8f2a33c1b57` |
| `search-context.ts` | `0b87ad933ae827f614c453557fafb1a705c5968d` |

Runtime: Node.js v22.16.0. Transpilation: installed TypeScript 5.8.3, ES2022/CommonJS, without changing the copied TypeScript. No dependency installation was performed. A direct source-download attempt failed DNS resolution; the validated connector copies, not an alleged successful clone, were used.

**24 local tests passed, zero failed**, covering default/trimmed URL fields, canonical-versus-legacy precedence, malformed/unsafe page normalization, context-preserving fixed local links, encoded user text, untouched versus submitted search, professional category removal, request identity, and all three pagination strategies.

These results test the two pure frontend helpers only. They are not repository-wide type checking, React interaction tests, backend/API/SQL tests, Google configuration verification, Floot acceptance, or a Production readiness certificate. No network/cloud/database call occurs in the test harness.

## 8. Acceptance gates before frontend cutover — not completed here

1. The new frontend reads the existing category catalog and preserves codes/parents/order/visual keys and error/retry behavior.
2. Every search tab calls its correct endpoint and preserves its actual response and pagination model; `all` is not expanded to unrelated modules.
3. Back/forward, reload, legacy links, draft edits, tab switches and stale requests preserve the same applied search.
4. Live API tests resolve the documented parser differences explicitly; do not silently broaden or narrow the contract.
5. Map tests prove bounds, limits, counts and actual mobile behavior without representing a partial subset as all matches.
6. Existing eligibility, identity, authorization, privacy and rollout gates remain server-owned. A public result screen is not proof that orders, payments or taxi trips are enabled.
7. Floot routing/auth transport and real browser journeys pass independently; existing Next.js CI/Preview success is not Floot evidence.

Next bounded source mapping: restaurant/product discovery and the separate quote/cart/order lifecycle. Do not implement that as a mutation of the generic service-listing search contract.
