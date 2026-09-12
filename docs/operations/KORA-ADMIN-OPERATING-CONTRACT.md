# KORA Admin — Supervised Operations Contract

KORA is the existing operational administration layer for Khedmah. KORA is separate from the optional Khedmah AI Admin control plane. KORA remains available when AI Admin is disabled.

## First operational tools

### `read_metrics`

KORA may read only metrics backed by an explicit source. The first slice exposes the canonical user count, 24-hour `search_action` count, current-process incident count, and current-process pending-change count. Metrics without a trustworthy source are returned as `not_instrumented`; they are never silently reported as zero.

Planned metric families include zero-result searches, orders, cancellations, Taxi, Food, Delivery, Store, and Ads. They become available only after a canonical privacy-safe source is wired and tested.

### `detect_ui_failures`

KORA owns a governed UI check registry for Taxi map embedding/navigation, Store navigation, Food routing, brand identity, dead actions, missing pages, and wrong-route destinations. Runtime status remains `not_observed` until structured browser or CI evidence is supplied. KORA must not invent live browser evidence.

### `review_operational_anomalies`

The first slice evaluates confirmed high/critical Operations Product incidents from the current backend process. Cancellation rates, abnormal user activity, duplicate-ad aggregates, driver/restaurant issue rates, API failure rates, and error-rate baselines remain explicit coverage gaps until their sources exist.

### `draft_admin_tasks`

KORA converts one confirmed finding into an advisory task with priority, resource, evidence, suggested action, and approval boundary. First-slice drafts are always `autoExecutable=false`.

## Operating modes

- **Executive** — summarizes connected evidence, confirmed problems, risk, recommendations, and whether an owner decision is required.
- **Expose** — surfaces unobserved UI checks and telemetry gaps without pretending they are failures.
- **KillCritic** — critiques a proposed action before execution. Production or high/critical impact always requires human approval. It never executes the action.
- **Autopsy** — structures incident evidence and the next evidence required. Root cause remains `undetermined` until evidence establishes it.

## Safety boundary

KORA does not receive passwords, API keys, Secret Manager payloads, database credentials, service-account keys, or direct Cloud Console access. KORA has no generic/raw SQL interface: its repository contains fixed aggregate SELECT queries only.

KORA cannot autonomously deploy to Production, change administrator roles or permissions, perform destructive account actions, change prices or platform policies, or execute another high-impact action. Those actions remain outside these tools and require the existing authorized human workflow.

The first slice is **Supervised** and read/advisory oriented. Existing moderation, verification, Classifieds Smart Admin assessment, Operations Product, incidents, change requests, and audit boundaries remain unchanged.
