# Khedmah AI Admin control-plane status

Implemented in this branch:

- persistent, disabled-by-default activation state;
- owner-only `ai.manage` permission;
- server-side GET status and POST state endpoints;
- audit events for actual enable/disable transitions;
- USD 50 default monthly budget ceiling stored in the control plane;
- Admin Dashboard enable/disable control plus a dedicated `/admin/ai` page;
- declared Executive, Expose, KillCritic, and Autopsy analysis modes;
- explicit approval boundaries for high-impact actions.

Not yet activated:

- OpenAI request execution;
- tool/function execution against Khedmah services;
- automated reports or scheduled monitoring;
- any Production autonomy.

The execution layer must remain unavailable until the control plane passes CI plus Preview/Staging verification and the OpenAI API credential is provided through Secret Manager rather than frontend code.
