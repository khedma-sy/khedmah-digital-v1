# V2 Governance Framework

**الحالة:** إطار تطور مقترح يطبق على كل مراحل V2 بعد اعتماده؛ لا يغير سلطة قائمة بذاته.

## 1. مبادئ الحوكمة

1. repository canonical evidence؛ الوثيقة قبل التنفيذ؛ الأحدث لا يلغي الأقدم دون `supersedes` صريح.
2. لا يجمع شخص واحد اقتراح القرار واعتماده وإثباته في التغييرات الحرجة.
3. unknown يظل unknown؛ لا يتحول إلى pass بسبب غياب الدليل.
4. الدليل يثبت claim محدداً وبيئة/وقتاً محددين، لا «الجاهزية» عموماً.
5. الاستثناء محدد النطاق، له مالك وانتهاء وخطة إغلاق، ولا يتجاوز الحظر الدستوري.

## 2. Authority Escalation Matrix

| القرار/التغير | يقترح | يراجع | يعتمد | التصعيد/الفيتو |
|---|---|---|---|---|
| تفسير دليل أو تحديث وثائقي بلا scope | Document Owner | Governance + affected owners | Governance Authority | Executive Sponsor عند تضارب canonical |
| عقد/ADR داخل scope معتمد | Product/Architecture Owner | Security/Data/Ops بحسب الأثر | Architecture Council | Council إن غير reversible أو cross-domain |
| V2 scope/capability/funding/KPI target | Product Executive | Architecture, Security, Finance/Legal | Executive Council | Council وحده يرفع reserved إلى approved |
| بيانات شخصية/retention/AI eligibility | Data Owner | Security + Privacy/Legal | Privacy/Data Authority | Council للتعارض مع الدستور/risk appetite |
| trust/moderation policy | Trust Owner | Security/Legal/Product | Executive Trust Authority | لا تفويض لقرار آلي نهائي |
| Migration/schema/lineage | Data Engineering | Domain/Data/Security/Ops | Database Authority | STOP عند applied-state أو rollback مجهول |
| Alpha/Production release | Release Owner | independent QA/Security/Ops/Product | Executive Release Authority | أي gate owner يوقف؛ Council فقط يقبل residual risk ضمن صلاحياته |
| Incident حرج | Incident Commander | Security/Ops/Data | Duty Executive | إخطار Council وpost-incident audit |

عند التعارض: Constitution → Council Decision → Charter/Directive → approved ADR/contract → roadmap/plan → implementation evidence → historical report. يعتمد الترتيب النهائي في G0 بعد إدخال Authority Model وMission-071.

## 3. Evidence Weight Model

درجة الدليل ليست بديلاً عن المراجعة:

`Weight = Authority (0–4) + Directness (0–3) + Reproducibility (0–3) + Freshness (0–2) + Integrity (0–3) − Conflict (0–4)`

| العامل | أعلى قيمة عندما |
|---|---|
| Authority | قرار canonical موقع ضمن صلاحية صاحبه |
| Directness | artifact يثبت claim مباشرة لا تقريراً عنه |
| Reproducibility | command/input/environment موثقة ويمكن إعادة النتيجة |
| Freshness | بعد آخر تغيير يؤثر في claim |
| Integrity | hash/commit/custody مكتملة |
| Conflict | يخصم عند تعارض أحدث أو scope/بيئة مختلفة |

التفسير: 13–15 قوي؛ 9–12 كافٍ مشروطاً؛ 5–8 ضعيف؛ ≤4 غير كافٍ. لا يغلق release claim بدليل واحد؛ يلزم استقلال نسبي بين evidence producer وgate reviewer. قرار المجلس يثبت **الإذن** ولا يثبت أن الاختبار نجح؛ الاختبار يثبت النتيجة ولا يمنح الإذن.

## 4. Confidence Levels

| المستوى | التعريف | الاستخدام |
|---|---|---|
| C0 Unknown | لا دليل أو تعارض غير محلول | STOP للقرار الحرج |
| C1 Indicated | دليل غير مباشر/قديم/غير قابل للإعادة | discovery فقط |
| C2 Supported | دليل مباشر واحد قابل للإعادة | تصميم أو قبول منخفض الخطورة مشروط |
| C3 Corroborated | أدلة مستقلة متسقة + review | gate فني غير إنتاجي |
| C4 Assured | C3 + custody + independent acceptance + residual risk approval | Alpha/Production claim المحدد |

يسجل confidence لكل claim (`build passes`, `migration reversible`, `journey accepted`) لا للمشروع كله.

## 5. Chain of Custody

كل Evidence Record يحتوي: `evidence_id`, claim, mission/decision IDs, producer/reviewer, UTC timestamp, repository/branch/commit, paths, exact command/config (مع redaction)، environment class، result، hash، dependencies/tool versions، retention، confidence، conflicts، وsuperseded-by.

التدفق: **Acquire → Validate → Hash → Register → Review → Link to Gate → Preserve → Supersede (never silently overwrite)**. الصور/logs الخارجية تحفظ في مخزن أدلة معتمد ويخزن في المستودع manifest بلا أسرار أو production URLs. إعادة تشغيل بعد تغيير مؤثر تنشئ record جديداً.

## 6. Repository Governance

- default branch وremote وCODEOWNERS/branch protection/review/check evidence تتحقق دورياً؛ وجود YAML لا يثبت تطبيق hosted rule.
- PR template يلزم Mission/Decision، scope/non-scope، risk/data/security، tests، evidence، rollback، docs، وreserved-capability declaration.
- protected branch: مراجعة مستقلة، required checks، منع force-push/deletion، signed/verified provenance وفق السياسة المعتمدة.
- commits صغيرة ومعرّفة؛ generated artifacts لا تتتبع إلا بقرار؛ secrets scanning إلزامي.
- directories الرسمية موثقة؛ يمنع إنشاء source authority موازٍ.
- merge لا يساوي gate release، وPR number في subject لا يثبت hosted review.

## 7. Audit Framework

| نوع التدقيق | التواتر/المحفز | المخرجات |
|---|---|---|
| Authority/traceability | كل gate وربع سنوي | completeness، conflicts، orphan decisions |
| Architecture conformance | كل تغير boundary ومرحلياً | dependency/ownership/drift findings |
| Data/privacy | dataset/schema/analytics/AI change | classification، minimization، retention/deletion |
| Security/supply chain | كل release وincident | threats، vulnerabilities، SBOM، waivers |
| Operations/resilience | قبل Alpha/Production وربع سنوي | SLO، rollback، restore، incident readiness |
| Product/scope | كل roadmap review | capability state، Arabic parity، reserved leakage |
| Benefits/fairness | بعد إطلاق increments | KPI quality، guardrails، unintended harm |

تصنيف findings: Critical (وقف فوري)، High (لا gate بلا إصلاح أو waiver مخول)، Medium (خطة مؤرخة)، Low (backlog حوكمي). Closure يحتاج evidence جديداً ومراجعاً غير المؤلف حيث يلزم.

## 8. Executive KPI Framework

| البعد | KPI family | Guardrail | المالك |
|---|---|---|---|
| Business value | eligible profile completion، qualified inquiry conversion، active business return | spam/complaints/no paid ranking | Product/Business |
| Arabic experience | Arabic task success، error، accessibility conformance | feature parity | Product/Design |
| Delivery | lead time، change failure، rollback success | traceability completeness | Engineering/Ops |
| Reliability | availability/latency/error، MTTR، restore success | privacy-safe telemetry | Ops |
| Security/Privacy | open risk age، access violations، deletion/retention compliance | no secret/private payload in evidence | Security/Privacy |
| Governance | decision latency، evidence completeness، expired waivers، drift findings | no unknown reported as pass | Governance |
| Trust/Fairness | review SLA، appeal/overturn، consistency samples | no automated trust/ranking | Trust Authority |

كل KPI يحتاج formula، cohort، exclusions، data owner، source، cadence، baseline، target، confidence، privacy class، anti-gaming rule. لا يعتمد target رقمي قبل baseline. لا يستخدم KPI فردي للعقوبة أو profiling.

## 9. Gate Record and Waivers

نتائج gate: `PASS`, `PASS WITH CONDITIONS`, `REPAIR`, `STOP`, `DEFER`. يسجل القرار والـclaims والأدلة والثقة والمخاطر والمالك والتاريخ. الـwaiver يذكر control، السبب، النطاق، compensating controls، residual risk، approver، expiry، وclosure evidence؛ لا waiver دائم ولا waiver لقدرة صريحة الحظر بلا تغيير سلطة أعلى.

## 10. تطبيق الإطار الآن

حالة V2-001 الحالية **C2 Supported للتصميم، C0 لاعتماد baseline الكامل** لأن مدخلي `CANONICAL-AUTHORITY-MODEL.md` وMission-071 غير موجودين في الشجرة المفحوصة. القرار الصحيح: تسجيل الفجوة، إتمام G0، ثم مراجعة هذه الحزمة؛ وليس بدء التنفيذ.
