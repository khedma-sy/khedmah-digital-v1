# Khedmah AI Admin — Salvaged Requirements from PR #172

## Source
Legacy draft PR #172: `feat(ai-admin): add owner-controlled activation plane`.

The implementation branch is heavily diverged from current main and must not be merged or rebased wholesale. The following product and safety requirements are retained as design input for the current Production/Floot plan.

## Retained control-plane requirements
- Disabled by default.
- Owner-only / highest-trust permission for AI control (historically `ai.manage`).
- Server-side kill switch; disabling AI must prevent execution, not merely hide UI.
- Persistent activation state.
- Audited enable/disable transitions.
- Explicit monthly budget ceiling; historical draft default was USD 50/month.
- Dedicated owner/admin control surface.
- AI execution availability reported truthfully; control-plane readiness must not imply runtime readiness.

## Retained analysis modes
- `executive`: executive summary and decision framing.
- `expose`: surface hidden failures, missing behavior, contradictions, and operational risk.
- `killcritic`: pre-execution critique and safer alternatives.
- `autopsy`: post-incident root-cause and prevention analysis.

Names are product labels only. They do not bypass authorization, approval, or safety policy.

## First supervised tool concepts to preserve
1. `read_metrics`
   - read approved operational metrics through backend services;
   - never direct SQL or secret access.
2. `detect_ui_failures`
   - identify dead buttons, missing routes, navigation/UX defects, and reproducible UI failures.
3. `review_operational_anomalies`
   - analyze unusual cancellations, error rates, duplicate-content signals, and operational problems.
4. `draft_admin_tasks`
   - turn verified findings into prioritized, evidence-backed work items.

## Human-approval boundary
The AI may analyze, draft, and recommend. The following remain explicitly human-approved:
- Production deployments.
- Administrator role/permission changes.
- Destructive or disabling account actions.
- Pricing or platform-policy changes.
- Database/Cloud infrastructure mutations.
- Secret/IAM changes.
- Any action classified high-risk.

## Secret/data boundary
The AI must never receive raw:
- passwords;
- database credentials;
- API keys;
- Secret Manager payloads;
- service-account private keys;
- Terraform state credentials;
- direct Cloud Console or unrestricted SQL access.

All executable actions must go through explicit backend tools with server-side RBAC, audit, and least privilege.

## What is NOT salvaged as code
Do not reuse the old migration number `026_ai_admin_control_plane`: current production schema sequencing already uses later canonical meanings for 026–034.

Do not copy the old controller/repository/frontend files directly. Re-implement against current main/Floot contracts after Production is stabilized.

Do not restore old `develop` branch assumptions.

## Target implementation timing
Rebuild this control plane only after:
1. Production database role cutover is stable.
2. Migrations 025–034 are complete.
3. Production hardening and release gates are green.
4. Floot auth/RBAC bridge is proven.
5. AI provider credentials are provisioned through secure resources.
6. Preview/Staging behavior is tested before any Production execution capability.

## Floot target
The final Floot owner/admin experience should surface:
- AI enabled/disabled state;
- supervised mode;
- monthly budget ceiling and usage;
- approved analysis modes;
- pending owner approvals;
- recent audited AI actions/findings;
- provider/runtime health;
- hard kill switch.

No count, alert, status, or metric may be presented as live unless it comes from an authoritative backend/tool result.
