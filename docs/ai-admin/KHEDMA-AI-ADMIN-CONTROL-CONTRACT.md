# Khedmah AI Admin control contract

Khedmah AI Admin is an internal, owner-controlled operations assistant. It is **disabled by default** and can be enabled or disabled only by an authenticated account with the `ai.manage` permission.

## Safety boundaries

- The AI never receives database credentials, API keys, service-account keys, passwords, or Secret Manager payloads.
- The AI has no direct database or cloud-console access. All reads and actions go through explicit backend tools protected by server-side RBAC.
- Production deploys, role changes, destructive account actions, pricing/policy changes, and other high-impact writes require explicit human approval.
- Turning the AI off is a server-side kill switch: AI execution endpoints must reject work while disabled.
- Every state change is auditable with actor ID and timestamp.

## Initial operating mode

The first release exposes only the control plane:

- owner-visible AI Admin page;
- persistent enable/disable state;
- monthly budget ceiling (default USD 50);
- supervised mode;
- declared analysis modes: `executive`, `expose`, `killcritic`, and `autopsy`;
- explicit list of capabilities and approval-required actions.

The OpenAI runtime/tool execution layer is added only after this control plane is tested in Preview/Staging. No production autonomy is authorized by this contract.
