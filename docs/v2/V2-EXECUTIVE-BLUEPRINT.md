# V2-001 — المرجع التنفيذي للإصدار الثاني

**الحالة:** مسودة استراتيجية P0 لاتخاذ القرار، وليست إذن تنفيذ  
**التاريخ المرجعي:** 2026-07-28  
**النطاق:** تصميم V2 قبل البرمجة؛ لا Features أو APIs أو شاشات أو نماذج بيانات أو Migrations أو بنية إنتاجية

## 1. السلطة وحدود الدليل

هذا المرجع يطبق [دستور المنصة](../governance/PLATFORM-CONSTITUTION.md)، و[ميثاق المشروع](../governance/PROJECT-CHARTER.md)، و[التوجيه الهندسي التنفيذي](../governance/EXECUTIVE-ENGINEERING-DIRECTIVE.md)، ويستخدم [Mission-070](../audits/MISSION-070-REPOSITORY-EVIDENCE-RECONCILIATION.md) كجرد الأدلة القابل لإعادة الفحص. ويظل تعريف MVP المعتمد جزءاً من الـCanonical Repository لاكتشاف الحد الفاصل بين V1 وV2.

لم يعثر الجرد المثبت في Mission-070 أو الشجرة الحالية على ملفين مستقلين باسم `CANONICAL-AUTHORITY-MODEL.md` و`Mission-071`. لذلك لا ينسب هذا المرجع إليهما أي قرار، ولا يختلق محتواهما. إدخالهما في سجل الحيازة واعتمادهما بوابة **G0** إلزامية قبل تحويل هذه المسودة إلى baseline معتمد. «غير موجود» هنا حالة دليل، لا حكم على وجودهما خارج النسخة القابلة للفحص.

### قاموس الحالة

- **مثبت:** دليل مباشر في المرجع الرسمي.
- **استنتاج:** نتيجة من أكثر من دليل وموسومة صراحة.
- **مقترح مشروط:** خيار V2 ينتظر قراراً تنفيذياً.
- **محجوز:** اتجاه معروف لا يخول التنفيذ.

## 2. Executive Autopsy of V1

### 2.1 ما نجح ولماذا يجب الحفاظ عليه

| النجاح المثبت | لماذا نجح | ما يجب الحفاظ عليه في V2 |
|---|---|---|
| اتجاه عربي أول وRTL وهوية منصة نمو أعمال | ثُبّت دستورياً وفي ميثاق المشروع، فصار قيد قرار لا تفضيلاً تصميمياً | العربية هي لغة الرحلة الأساسية؛ قياس التكافؤ الوظيفي وإتاحة الوصول قبل كل بوابة قبول |
| Monorepo TypeScript مع فصل frontend/backend وحدود domain | خفّض تعدد اللغات وأبقى الوثائق والعقود والاختبارات معاً | monorepo معياري، حدود واضحة، واستخراج الخدمات فقط عند دليل قياس حقيقي |
| توثيق وعقود واختبارات تأسيسية واسعة | جعل الافتراضات قابلة للمراجعة وكشف الانحرافات قبل الإنتاج | contract-first، traceability من القرار إلى الدليل، واختبارات سلبية للأمن والخصوصية |
| حصر MVP ومنع marketplace/payments/ranking/AI غير المعتمد | قاوم scope creep وحمى فلسفة نمو الأعمال من التحول إلى منصة معاملات أو مراقبة | لا تنتقل قدرة محجوزة إلى roadmap ممول إلا بقرار نطاق وخصوصية واقتصاد واضح |
| اختيار مصدر runtime/domain/migrations رسمي | خفّض غموض السلطة: `apps/backend` مضيف، و`backend/modules` domain، و`backend/migrations` سلسلة مستقبلية | سجل سلطة واحد، adapters باتجاه واحد، ومنع أي lineage موازٍ |
| إصلاح بوابة الاختبار وإثبات buildable local foundation | حوّل نجاحاً جزئياً مضللاً إلى بوابة شاملة | لا مساواة بين نجاح محلي وجاهزية Alpha/Production؛ كل ادعاء يحمل بيئته ودليله |

### 2.2 التحديات: التكلفة والتأخير والمخاطرة

| البعد | السبب الأكبر | الأثر | الدليل/الاستجابة في V2 |
|---|---|---|---|
| التكلفة | تكرار القرار بين runtime وcanonical domain وبين سلسلتي SQL | إعادة مصالحة واختبارات وتصحيح عقود | Authority Registry وArchitecture Conformance Gate قبل التنفيذ |
| التأخير | توثيق يقول foundation-only بينما توجد runtimes، مع traceability ناقصة للمهمات | إعادة تدقيق بدل التقدم المتسلسل | baseline مؤرخ، decision IDs، وربط Mission→Decision→PR→Commit→Evidence |
| المخاطرة | غياب دليل production persistence/deployment/observability واعتماد أمني | خطر إعلان جاهزية لا تدعمها الأدلة | فصل بوابات build وintegration وAlpha وproduction ومنع الترقية التلقائية |
| الخصوصية | مرونة معرفات analytics وmetadata القديمة | قابلية الانجراف نحو tracking | allowlist، minimization، retention/deletion، ومنع profiling/ranking |
| البيانات | اختلاف identifiers وownership/lifecycle وغياب applied-state مثبت | فساد lineage أو عدم توافق البيانات | Database Authority Decision وخطة rehearsal/rollback قبل أي SQL |
| الحوكمة | غياب remote/default branch/rules/reviews كدليل قابل للفحص | لا يمكن اعتماد canonical hosted state | Repository Control Evidence Pack عند كل إصدار |

### 2.3 سجل الديون التنفيذي

| ID | النوع | الدين | الخطورة | شرط الإغلاق |
|---|---|---|---|---|
| TD-01 | برمجي | انفصال Nest runtime عن canonical modules واعتماد repositories داخل الذاكرة | حرج | adapter slice مثبت، parity tests، ثم persistence معتمد |
| TD-02 | برمجي | بعض skeletons وتغطية semantic consistency غير مكتملة | متوسط | owners وcontract tests ومعايير إزالة placeholder |
| TD-03 | بيانات | lineages متوازية واختلاف الهوية والـapplied state | حرج | قرار authority، quarantine مثبت، rehearsal نظيف وrollback |
| OD-01 | تشغيلي | لا deployment authority أو بيئة production مثبتة | عالٍ | runbooks، SLOs، monitoring، secrets، DR، release evidence |
| OD-02 | تشغيلي | Alpha/security/privacy gates غير مغلقة | عالٍ | تقارير مستقلة وتوقيع أصحاب السلطة |
| AD-01 | إداري | Missions بلا mapping فردي وبيانات PR المستضافة غير مثبتة | عالٍ | سجل قرارات وآثار آلي غير قابل للفصل عن التغيير |
| GD-01 | حوكمة | مستندات حالة تاريخية تتعارض زمنياً | عالٍ | precedence metadata، supersedes links، ومراجعة اتساق دورية |
| GD-02 | حوكمة | المدخلان Authority Model وMission-071 غير متاحين في baseline الحالي | حرج | استرداد نسخ canonical والتحقق من hash/authority واعتماد G0 |

## 3. تعريف رؤية V2

### Vision

أن تصبح خدمة المنصة العربية الموثوقة لنمو الأعمال: حضور رقمي منظم، اكتشاف عادل، تواصل مضبوط، وقرارات تشغيلية قائمة على أدلة تحترم الخصوصية.

### Mission

تمكين الأعمال والمستخدمين من إدارة الهوية والحضور والخدمات والعلاقات التشغيلية بأمان ووضوح، مع بنية قابلة للتوسع وحوكمة تمنع القرارات الآلية أو التجارية غير المعتمدة.

### الأهداف

| الفئة | أهداف V2 القابلة للقياس |
|---|---|
| استراتيجية | تثبيت العربية أولاً؛ تحويل `أنا مع خدمة` إلى تعبير ثقة/مجتمع مستقبلي فقط حتى قرار مستقل؛ عدم تحول المنصة إلى سوق معاملات بلا اعتماد |
| أعمال | رفع نسبة اكتمال ملفات الأعمال المؤهلة، نجاح الاكتشاف→التواصل، وعودة الأعمال لإدارة حضورها؛ دون paid ranking أو بيع بيانات |
| تقنية | سلطة domain واحدة؛ lineage واحدة؛ عقود versioned؛ SLOs قابلة للقياس؛ فصل modular يسمح بالاستخراج بالدليل |
| تشغيلية | release قابل للإعادة، MTTR وchange-failure-rate مقاسان، rollback مجرب، وحيازة دليل كاملة |
| أمن وخصوصية | least privilege، minimization، retention/deletion، audit tamper evidence، واختبارات إساءة قبل الإطلاق |

## 4. المبادئ والحدود غير القابلة للتفاوض

1. V2 **اقتراح حوكمي** حتى يقر المجلس scope وfunding وrisk appetite.
2. القدرات المحجوزة ليست backlog تنفيذياً. Marketplace وAI وAutomation لا تعبر Gate G2 دون business case وحقوق بيانات وضوابط بشرية.
3. يمنع paid ranking، المراقبة، بيع البيانات، trust/credit scores الآلية، أو AI يقرر الأهلية أو الثقة.
4. منصة نمو الأعمال لا تعني تلقائياً orders/payments/commissions أو شبكة اجتماعية.
5. كل KPI يملك تعريفاً ومالكاً ومصدراً ونافذة قياس؛ ولا تستخدم analytics لتكوين ملفات شخصية.
6. لا يغير هذا المستند صلاحيات V1 ولا يأذن بأي تنفيذ.

## 5. Capability Map التنفيذي

الأولوية: P0 تأسيس/سلامة، P1 قيمة V2 الأساسية، P2 خيار بعد إثبات، R محجوز. الاعتماديات تشير إلى القدرات أو البوابات في [الرؤية المعمارية](V2-ARCHITECTURE-VISION.md).

| ID / الفئة / القدرة المقترحة | القيمة التجارية | الأولوية | الاعتماديات | الخطر الرئيسي | سبب الإدراج والحالة |
|---|---|---:|---|---|---|
| CP-01 Core — Authority & Identity Core | هوية موحدة وثقة بالوصول | P0 | G0، IAM contracts | استيلاء/ازدواج هوية | يعالج انقسام V1؛ مقترح مشروط |
| CP-02 Core — Profile/Organization Core | حضور أعمال قابل للإدارة | P1 | CP-01، DB-01 | ownership drift | امتداد للهدف المعتمد لا feature جديد تلقائياً |
| CP-03 Core — Taxonomy/Location Core | اكتشاف متسق عربياً | P1 | data governance | تحيز/رداءة تصنيف | أصل موثق في V1؛ مقترح مشروط |
| BP-01 Business — Presence Workspace | رفع اكتمال وجاهزية العمل | P1 | CP-02/03، UX gate | اتساع النطاق | يحقق فلسفة النمو؛ يتطلب product contract |
| BP-02 Business — Controlled Inquiry | تحويل الاكتشاف إلى نية تواصل | P1 | Trust، abuse controls | spam/privacy | تطور مضبوط لقدرة V1 |
| BP-03 Business — Trust/Verification Ops | مصداقية ووضوح | P1 | audit، human review | قرارات ظالمة | موثق كاتجاه؛ لا score آلي |
| MP-01 Marketplace — Capability Boundary | يحسم نموذج القيمة قبل الاستثمار | P0 | G2 business/economic/legal decision | تحول غير معتمد لمعاملات | **حوكمة فقط**؛ لا سوق في baseline |
| MP-02 Marketplace — Listings/Transactions | قيمة محتملة لاحقة | R | MP-01 وموافقة مجلس مستقلة | مدفوعات/نزاعات/عمولات | محجوز ولا يدخل roadmap التنفيذي الحالي |
| AI-01 AI — Readiness & Data Governance | يتيح تقييماً آمناً لاحقاً | P1 | privacy catalog، quality | تسرب/تحيز | readiness فقط، بلا نموذج إنتاجي |
| AI-02 AI — Arabic Assistive Drafting | إنتاجية محتملة مع مراجعة بشرية | R | AI-01، evaluation، consent | hallucination/IP | فرضية محجوزة؛ لا توصية أو قرار آلي |
| AI-03 AI — Ranking/Trust Decisions | لا قيمة مقبولة ضمن الحدود | ممنوع | — | تمييز ومراقبة | مستبعد صراحة ما لم يغير قرار دستوري مستقل الحدود |
| AU-01 Automation — Governed Jobs | موثوقية الأعمال المتكررة | P1 | idempotency، audit، observability | تكرار/فقد | بنية تشغيل لا workflow منتج تلقائياً |
| AU-02 Automation — Human Approval Queue | سرعة مع مساءلة | P1 | BP-03، RBAC | rubber-stamping | يبقي القرار الحساس بشرياً |
| OP-01 Operations — CI/CD Evidence | إطلاق أسرع قابل للإثبات | P0 | repo governance | supply-chain | يغلق فجوة V1 |
| OP-02 Operations — SLO/Observability | تقليل الأعطال وMTTR | P0 | telemetry privacy | جمع زائد | يغلق فجوة production evidence |
| OP-03 Operations — Backup/DR | استمرارية الأعمال | P0 | DB-01 | استعادة غير مجربة | شرط production |
| SE-01 Security — IAM/Least Privilege | حماية الحسابات والإدارة | P0 | CP-01 | privilege escalation | شرط كل رحلة |
| SE-02 Security — Abuse/Threat Controls | حماية التواصل والاكتشاف | P0 | BP-02، OP-02 | حجب مشروع/تحايل | مثبت الحاجة في V1 |
| SE-03 Security — Privacy Lifecycle | ثقة وامتثال | P0 | data catalog | احتفاظ غير منضبط | consent/minimization/retention/deletion |
| AN-01 Analytics — Operational Metrics | تحسين الاعتمادية والرحلات | P1 | consent، allowlist | tracking drift | aggregate decision support فقط |
| AN-02 Analytics — Business Insights | قيمة نمو للأعمال | R | AN-01، privacy review | competitor ranking/profiling | محجوز حتى تعريف aggregates العادلة |
| AD-01 Administration — Governed Console | تشغيل مضبوط | P1 | SE-01، audit | صلاحية مفرطة | واجهة داخلية منفصلة؛ تخضع لمهمة تنفيذ مستقلة |
| AD-02 Administration — Evidence Register | خفض تكلفة التدقيق | P0 | repo governance | evidence tampering | يعالج traceability مباشرة |
| IN-01 Integrations — Integration Gateway | عزل الموردين والعقود | P2 | egress/secrets policy | vendor lock-in/data leak | readiness؛ لا مزود معتمد هنا |
| IN-02 Integrations — Webhooks/Partner APIs | توسع منظومة محتمل | R | IN-01، partner governance | replay/abuse | محجوز؛ لا API يُنشأ بهذه الوثيقة |

## 6. فرضيات الاستثمار ومؤشرات النجاح

| الفرضية | المؤشر التنفيذي | Guardrail | قرار الاستمرار |
|---|---|---|---|
| حضور أوضح يزيد التواصل المؤهل | profile completion وeligible inquiry conversion | spam/privacy complaint rate | تحسن متكرر مع عدم خرق guardrail |
| الثقة البشرية المضبوطة تقلل التفاعل غير المؤهل | review SLA وappeal overturn rate | لا automated trust score | جودة وعدالة مثبتتان |
| العربية الأولى تقلل فشل الرحلة | task success وerror rate بالعربية | parity/accessibility failures | لا إطلاق إن كانت العربية أقل جودة |
| governance-as-evidence يقلل rework | lead time للقرار وtraceability completeness | exceptions/waivers | ≥95% آثار كاملة قبل التنفيذ الموسع |

القيم المستهدفة الرقمية لا تُختلق هنا؛ يحددها المجلس عند G1 بعد baseline قياس موثوق.

## 7. القرار المطلوب

اعتماد هذه الوثائق **كحزمة تصميم للمراجعة** فقط، ثم: (1) استعادة مدخلي السلطة المفقودين؛ (2) قبول/رفض نتائج autopsy؛ (3) اختيار قدرات P0/P1؛ (4) تثبيت KPI baselines؛ (5) إصدار Authorization منفصل لأي تنفيذ. لا يعني اعتماد blueprint اعتماد Marketplace أو AI أو Automation أو Production.
