# Operations Product Division

## السلطة والنطاق

Operations Product قسم منصة من الدرجة الأولى ومالك تشغيلي للبنية التحتية وعمليات الإنتاج. التفويض الوارد من مجلس الإدارة لا يغير صلاحيات المجلس أو السلطة التنفيذية أو Codex. جميع عمليات التغيير تتطلب هوية مصادقاً عليها، دوراً مخصصاً، سبباً، واعتماداً خارج التنفيذ؛ لا تنفذ واجهة الطلب تغييراً مباشراً.

## القدرات

تجمع الوحدة inventory لخدمات Google Cloud وFirebase وGoogle APIs، ومسارات CI/CD، وحالة الإنتاج، والمراقبة، والأمن، والإصدارات، والنشر، والأسرار، وIAM، والسجلات، والتنبيهات، والحوادث والسجلين التشغيليين. API تحت `/api/v1/admin/operations-product` ولا يعدل أي API قائم.

## RBAC

الأدوار المعتمدة: Operations Product Director، Infrastructure Manager، Cloud Administrator، DevOps Engineer، Production Engineer، Release Manager، Security Operations Engineer، وSite Reliability Engineer. خريطة الصلاحيات deny-by-default في `operations-product.types.ts`. تربط الحسابات عبر `OPERATIONS_PRODUCT_ROLE_BINDINGS` بصيغة JSON من runtime configuration، مثال غير إنتاجي: `{"operator@example.invalid":["site_reliability_engineer"]}`. لا تمنح الوحدة أو تغير Board/Executive roles.

## التدقيق والتغيير

كل طلب تغيير أو تراجع أو حادث يسجل actor/action/resource/request/correlation دون payload حساس. ينتقل طلب البنية إلى `pending_approval` ولا يتصل مباشرة بمزود سحابي. يربط نظام الإنتاج المعتمد هذه السجلات بـDecision Register وGovernance Register وChange/Release Management. لا تعرض inventory قيم الأسرار.

## التشغيل

1. أكمل [قائمة Google الإنتاجية](../google/production-checklist.md).
2. اربط الحسابات بأقل دور مطلوب من Secret Manager/runtime configuration.
3. تحقق من endpoints بحسابات allowlisted ومن رفض الحسابات الأخرى.
4. اربط provider adapters بعد مراجعة security/release؛ أبق حركة الإنتاج وtelemetry مغلقتين قبل الموافقة.
5. نفذ مراجعات الوصول الدورية واختبارات rollback وincident runbook.


## Production certification

See the [final readiness report](../reports/operations-product-production-readiness/production-readiness-report.md). `npm run validate:operations` validates repository controls; the protected production environment must run `npm run validate:operations:production` before deployment.


## Live certification execution

Board decision `BOD-EXEC-2026-005` is implemented by the [live certification package](../reports/operations-product-live-certification/README.md). The collector is read-only; the orchestrator requires `OPERATIONS_APPROVED_PRODUCTION=true`, captures prior revisions, deploys, rolls back, redeploys, and stores restricted evidence outside Git. Only the Board can issue the final certification decision.
