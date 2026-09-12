# Khedmah AI Admin control contract

Khedmah AI Admin is the supervised intelligence/control capability attached to **Kora Admin**, the existing internal operations administrator. Kora remains the permission-gated operational executor; the AI layer does not replace Kora and does not create a privileged path around backend RBAC, audit, or human approvals.

The control plane is **disabled by default** and can be enabled or disabled only by an authenticated account with the `ai.manage` permission.

**Web owner:** [`apps/frontend/app/admin/ai/page.tsx`](../../apps/frontend/app/admin/ai/page.tsx).

## Safety boundaries

- The AI never receives database credentials, API keys, service-account keys, passwords, or Secret Manager payloads.
- The AI has no direct database, SQL, or cloud-console access. All reads and actions go through explicit backend tools protected by server-side RBAC.
- Production deploys, admin role/permission changes, destructive account actions, pricing/policy changes, and other high-impact writes require explicit human approval.
- Production autonomy is forbidden. Initial runtime tool wiring must be proven in Preview/Staging before any production consideration.
- Turning the AI off is a server-side kill switch: AI execution endpoints must reject work while disabled.
- Every state change and every executable tool action must be auditable with actor identity, timestamp, tool/action name, target, decision, and outcome.
- Low-risk automatic actions, when implemented, must be allowlisted explicitly and must still pass backend authorization and audit controls.

## Initial operating mode

The control plane starts in `supervised` mode with:

- owner-visible AI Admin page;
- persistent enable/disable state;
- monthly budget ceiling (default USD 50);
- declared analysis modes: `executive`, `expose`, `killcritic`, and `autopsy`;
- explicit tool capabilities and approval-required actions;
- no direct Production access.

The OpenAI runtime/tool execution layer is added only after this control plane is green and tested in Preview/Staging. Declaring a tool here does **not** claim that its runtime implementation is already available.

## Kora Admin supervised tool contract

The first four real tools to be wired on Staging are:

### `read_metrics`

Read operational indicators through approved backend data sources, without direct SQL or secret access:

- user and order counts;
- searches and zero-result searches;
- cancellations;
- operational problems;
- Taxi, Food, Delivery, Store, and Ads indicators as those domains expose authoritative metrics.

### `detect_ui_failures`

Detect and report reproducible UI/navigation failures with evidence:

- dead buttons;
- missing pages and 404 routes;
- links pointing to the wrong route;
- Taxi routing to categories instead of the intended map/flow;
- Store hidden from navigation;
- Food missing from navigation;
- identity, typography, and section-color inconsistencies.

This tool may inspect and report. Any code-changing action must use an explicitly approved, audited execution tool and may not bypass the repository workflow.

### `review_operational_anomalies`

Review abnormal operating patterns and produce evidence-backed findings:

- elevated cancellations;
- abnormal user or activity behavior;
- suspected duplicate ads;
- drivers or restaurants with unusually high problem ratios;
- API failures;
- abnormal error rates.

A finding is not itself a punitive decision. Destructive or high-impact account actions still require explicit human approval.

### `draft_admin_tasks`

Convert verified findings into actionable Kora Admin work items:

- describe the problem and supporting evidence;
- assign risk/severity and priority;
- identify the affected product/domain;
- recommend the safest fix order;
- identify whether execution is low-risk/allowlisted or requires owner approval.

## Official analysis modes

### `executive`

Produce the executive report in this order:

> what happened today → problem → risk level → recommended action → what needs the owner's decision.

### `expose`

Search for hidden, missing, or non-functional behavior:

> missing pages, dead buttons, API errors, hidden services, UX contradictions, abnormal data, and navigation/product visibility failures.

### `killcritic`

Critique a proposed action before execution:

> Is the decision sound? What can it break? Is there a safer/better method? Could it affect Production or users?

### `autopsy`

Investigate an incident after failure:

> what happened → when it started → root cause → impact → corrective action → prevention of recurrence.

## Approval boundary

Kora Admin and its AI capability may prepare evidence, recommendations, tasks, and low-risk allowlisted actions. The following always require explicit owner approval:

- deployment to Production;
- changes to administrator roles or permissions;
- destructive account deletion or disablement;
- pricing or platform-policy changes;
- any operation classified as high risk.

Kora Admin and the AI layer must not be given raw passwords, API keys, Secret Manager payloads, database credentials, service-account keys, direct Cloud Console access, or direct SQL access.

## Target owner dashboard state

The intended supervised dashboard may summarize verified data in a form such as:

> **Khedmah AI Admin — مفعّل**
>
> مستوى التشغيل: Supervised
>
> اليوم: نتائج تشغيلية ومشاكل مثبتة
>
> نفذت تلقائيًا: مهام منخفضة الخطورة المسموح بها
>
> تنتظر موافقتك: إجراءات حساسة
>
> Autopsy مفتوحة: عدد التحقيقات الحالية
>
> تنبيهات حرجة: عدد التنبيهات الحرجة

Counts shown in this surface must come from real tool results; placeholders or inferred numbers must not be presented as live platform evidence.
