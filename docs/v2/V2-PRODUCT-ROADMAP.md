# V2 Product Roadmap

**الحالة:** خارطة قرار قابلة للتنفيذ، لا backlog Features ولا إذن برمجة.  
**قاعدة الترتيب:** لا تاريخ تقويمي بلا فريق/ميزانية/baseline؛ تستخدم الخارطة مراحل متسلسلة وtimeboxes يثبتها المجلس في G1.

## 1. Outcomes

1. baseline سلطوي وأدلة V1 موثوقان.
2. V2 scope يحقق نمو الأعمال العربي دون marketplace/AI/ranking غير معتمد.
3. target architecture وdata/security/operations قابلة للاختبار قبل التنفيذ.
4. كل increment صغير، reversible، ومربوط بـKPI وقرار توقف.

## 2. المراحل والمعالم والبوابات

| المرحلة | المعالم | Decision Gate | Acceptance Gate | Risk Gate | المراجعة التنفيذية |
|---|---|---|---|---|---|
| 0 — Authority Recovery | استرداد Authority Model وMission-071؛ inventory/hash؛ precedence register | **G0:** هل المدخلات كاملة وأصلية؟ | 100% من المراجع لها owner/version/location | لا unknown حرج مخفياً | Council baseline review |
| 1 — V1 Closure & Measurement | إغلاق runtime/domain وDB lineage plan؛ KPI baseline؛ debt owners | **G1:** قبول autopsy وrisk appetite والتمويل | evidence map، baseline قابل للتكرار، no false production claim | TD-01/03 وGD-02 بخطط مقبولة | Executive scope review |
| 2 — V2 Scope & Architecture Freeze | capability selection؛ context map؛ NFRs؛ UX research عربي؛ data/privacy models | **G2:** approve/reject/defer لكل capability | contracts، Arabic/accessibility criteria، ADRs، cost model | architecture/security/privacy reviews بلا critical unknown | Product/Architecture Council |
| 3 — Foundation Authorization | implementation mission packets لـP0 فقط؛ CI/CD/SLO/DR design | **G3:** إذن تنفيذ محدود منفصل | DoR كامل وrollback/test/evidence plans | threat model، supply-chain، migration rehearsal plans | Engineering authorization review |
| 4 — Controlled Increments | vertical slices المعتمدة فقط؛ staging evidence؛ user validation | **G4 لكل increment:** continue/repair/stop | functional+contract+Arabic+a11y+security+data acceptance | no open critical/high بلا waiver مؤقت | Monthly evidence review |
| 5 — Alpha | end-to-end journeys، persistence، abuse، audit، observability، support rehearsal | **G5:** Alpha Go/No-Go | independent acceptance، browser tests، restore/rollback، support readiness | pen/privacy/load findings ضمن appetite | Alpha Council |
| 6 — Production Readiness | release candidate، operational ownership، legal/commercial readiness | **G6:** Production Go/No-Go | SLO measurement، DR، incident/on-call، change controls | residual risk signed by accountable authority | Executive release review |
| 7 — Scale & Options | KPI learning؛ optimize/hold؛ reconsider reserved candidates | **G7:** invest/iterate/retire | benefits evidence and guardrails | no scope expansion by metric pressure | Quarterly portfolio review |

## 3. Workstreams

| Workstream | 0–2 (تصميم) | 3–5 (بعد إذن مستقل) | Owner accountable |
|---|---|---|---|
| Product/Arabic UX | outcomes، journeys، research، accessibility acceptance | validate increments | Product Executive |
| Architecture | authority/context/ADRs/NFRs | conformance evidence | Chief Architect |
| Data/Analytics | catalog، KPI semantics، privacy/retention | quality and aggregate metrics | Data Owner + Privacy |
| Security/Trust | threat/abuse/access models | independent testing and incident rehearsal | Security Authority |
| Operations | SLO/runbook/release/DR design | staging/restore/rollback evidence | Operations Authority |
| Governance | decisions/evidence/waivers/audits | gate administration | Governance Secretary |
| Business | value hypothesis/cost/funding | benefits realization | Executive Sponsor |

## 4. Definition of Ready قبل أي مهمة تنفيذ

- capability معتمدة بالمعرف والحالة والـoutcome؛ وليست reserved.
- عقد نطاق يذكر inclusions/exclusions وعدم الأهداف.
- source authority وowners وdependencies واضحة.
- acceptance بالعربية وRTL وaccessibility وsecurity/privacy/NFRs.
- data classification/retention/deletion وmigration/rollback إن لزم.
- test/evidence plan وKPI baseline وtelemetry minimization.
- risk register وstop conditions وbudget/team/timebox.
- قرار مكتوب يصرح تحديداً بنوع التنفيذ؛ غياب القرار = ممنوع.

## 5. Acceptance Pyramid

1. **Document:** اكتمال السلطة والاتساق والروابط.
2. **Contract:** invariants/API/data/error/audit دون runtime افتراضي.
3. **Component:** unit/static/build evidence.
4. **Integration:** PostgreSQL/contracts/security boundaries.
5. **Journey:** browser Arabic/RTL/a11y and abuse cases.
6. **Operational:** load/observability/rollback/restore/incident.
7. **Executive:** benefit، residual risk، funding، accountable sign-off.

النجاح في طبقة لا يتجاوز الطبقة التالية، وScope approval لا يساوي release approval.

## 6. Risk and Stop Rules

| Trigger | الاستجابة الإلزامية |
|---|---|
| تضارب authority أو دليل مفقود حرج | STOP؛ إعادة G0 |
| lineage غير مؤكدة أو rollback يفشل | STOP DATA CHANGE؛ لا Migration |
| high security/privacy بلا owner/date | STOP RELEASE؛ إصلاح أو waiver من السلطة المختصة فقط |
| KPI يتحسن عبر tracking/ranking غير معتمد | أوقف القياس/القدرة وابدأ privacy/governance review |
| capability reserved تظهر في code/schema/API/UI | رفض التغيير وإجراء scope audit |
| SLO غير قابل للقياس | لا production gate |
| انحراف العربية أو الإتاحة عن التكافؤ | لا acceptance للرحلة |

## 7. سياسة القدرات المحجوزة

Marketplace وAI assistance وadvanced analytics وpartner APIs و`أنا مع خدمة` كتنفيذ مجتمعي تبقى في **Option Portfolio** فقط. نقل أي منها يتطلب Concept Note → business/legal/privacy/security review → Council scope decision → تحديث blueprint/capability map → ADR/contracts → implementation authorization. لا يكفي ضغط السوق أو وجود skeleton أو اسم في roadmap.

## 8. Executive Review Pack

كل مراجعة تعرض صفحة قرار واحدة: القرار المطلوب، تغير outcome/KPI، evidence links/hashes، scope delta، burn/cost، top risks، waivers، architecture/data/security status، Arabic UX evidence، options (Go/Repair/Stop/Defer)، واسم accountable approver. تحفظ النتيجة في Decision Register وترتبط بالـcommit/PR دون أسرار أو روابط إنتاج.
