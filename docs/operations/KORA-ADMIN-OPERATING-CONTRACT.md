# KORA Admin — Supervised Operations Contract

KORA is the existing operational administration layer for Khedmah. KORA is separate from the optional Khedmah AI Admin control plane. KORA remains available when AI Admin is disabled.

## First operational tools

### `read_metrics`

KORA may read only metrics backed by an explicit source. The first slice exposes the canonical user count, 24-hour `search_action` count, current-process incident count, and current-process pending-change count. Metrics without a trustworthy source are returned as `not_instrumented`; they are never silently reported as zero.

The 2026-09-15 extension connects fixed aggregate reads for fulfillment orders created in the last 24 hours, the Food subset, cancellations within that created-order cohort, current confirmed orders waiting for courier assignment, the subset waiting more than 15 minutes, pending subscription purchase orders, and subscriptions whose payment was confirmed in the last 24 hours.

The 2026-09-20 Smart Admin extension adds fixed read-only aggregates for Classifieds, Store listings, Taxi driver approvals, contact inquiries and provider reports. It reports active and pending-review ads, review backlog older than 24 hours, expired ads that still carry the Active state, active/approved Store products, pending and overdue Store moderation, out-of-stock Store products, currently approved Taxi drivers, restricted driver approvals, approved driver records expiring within seven days, new/open contact inquiries, submitted inquiries older than 24 hours, and open/provider-report backlog counts.

These values come directly from `ad_listings`, `product_listings`, `khedmah_taxi.driver_approvals`, `contact_inquiries`, `provider_reports`, `business_profiles`, `professional_profiles`, `verification_requests`, and `mobility_document_reviews`; KORA receives no generic SQL capability. Metrics use aggregate counts only and do not expose inquiry messages, report details, reporter identities, target identities, verification notes, document images, document contents, or identity evidence.

The review-queue slice reports pending and over-24-hour counts for business moderation, professional moderation, verification requests, and mobility-document review. These counts are operational workload signals only. KORA cannot approve/reject a profile, approve/reject verification, inspect private document evidence, or approve a driver from these metrics.

Counts do not combine currencies or claim revenue, delivery duration, restaurant quality, Taxi trip volume, Store conversion, duplicate-ad detection, or cross-product coverage. Database read failures remain failures, never fabricated zeroes.

Zero-result searches remain uninstrumented because the current `search_action` contract does not require a result-count field. Cross-product counts, Taxi trip lifecycle metrics, Food preparation time, Delivery travel time, Store conversion, duplicate-ad detection, driver/restaurant issue rates and API/error-rate baselines also remain uninstrumented.

### `detect_ui_failures`

KORA owns a governed UI check registry for Taxi map embedding/navigation, Store navigation, Food routing, brand identity, dead actions, missing pages, and wrong-route destinations. Runtime status remains `not_observed` until structured browser or CI evidence is supplied. KORA must not invent live browser evidence.

### `review_operational_anomalies`

The anomaly review evaluates confirmed high/critical Operations Product incidents from the current backend process and canonical fulfillment orders waiting for courier assignment for more than 15 minutes. It also surfaces Classifieds and Store moderation records waiting more than 24 hours, expired Classifieds records that remain in the Active state, approved Taxi driver records that expire within seven days, contact inquiries still in `submitted` state after 24 hours, and provider reports that remain open after 24 hours.

Open provider reports with reason code `impersonation` or `inappropriate_content` may be surfaced as priority-review findings, but KORA must state that these are user allegations until a human moderator reviews the evidence.

KORA may also surface business/professional moderation, verification-request, and mobility-document queues that remain pending for more than 24 hours. These findings identify workload backlog only; they must not imply that a pending profile is valid, that verification should be granted, or that a driver document is authentic.

The 15-minute, 24-hour and seven-day thresholds are operational review signals, not customer-facing SLAs. Findings can produce advisory tasks; they cannot assign a courier, approve/reject content, renew a driver, confirm payment, modify a tariff, or perform another write. Cancellation rates, abnormal user activity, duplicate-ad detection, driver/restaurant issue rates, Taxi trip lifecycle, API failure rates, and error-rate baselines remain explicit coverage gaps until their sources exist.

### `draft_admin_tasks`

KORA converts one confirmed finding into an advisory task with priority, resource, evidence, suggested action, and approval boundary. First-slice drafts are always `autoExecutable=false`.

## Operating modes

- **Executive** — summarizes connected evidence, confirmed problems, risk, recommendations, and whether an owner decision is required.
- **Expose** — surfaces unobserved UI checks and telemetry gaps without pretending they are failures.
- **KillCritic** — critiques a proposed action before execution. Production or high/critical impact always requires human approval. It never executes the action.
- **Autopsy** — structures incident evidence and the next evidence required. Root cause remains `undetermined` until evidence establishes it.

## Actor-bound audit contract

Every externally callable KORA administrative tool records a supervised audit event tied to the authenticated actor and the active request/correlation context. This includes direct reads of metrics, the UI checklist, and anomaly reviews as well as UI-evidence evaluation, task drafting, Executive, Expose, KillCritic, and Autopsy.

Composite modes use private internal read helpers and record the composite event once. Callers cannot opt out of audit by passing a flag to a public KORA service method. KORA audit recording does not grant execution authority and does not weaken the human-approval boundary.

## Safety boundary

KORA does not receive passwords, API keys, Secret Manager payloads, database credentials, service-account keys, or direct Cloud Console access. KORA has no generic/raw SQL interface: its repository contains fixed aggregate SELECT queries only.

KORA cannot autonomously deploy to Production, change administrator roles or permissions, perform destructive account actions, change prices or platform policies, or execute another high-impact action. Those actions remain outside these tools and require the existing authorized human workflow.

The first slice is **Supervised** and read/advisory oriented. Existing moderation, verification, Classifieds Smart Admin assessment, Operations Product, incidents, and change-request boundaries remain unchanged; KORA adds actor-bound audit coverage for its own administrative surface.
