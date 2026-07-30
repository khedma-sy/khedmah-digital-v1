# Production Checklist

- [ ] مشروع إنتاجي مستقل، billing/budget alerts ومالكو طوارئ موثقون.
- [ ] APIs المطلوبة فقط مفعلة وIAM بمبدأ أقل صلاحية مع مراجعة دورية.
- [ ] CI يستخدم Workload Identity Federation وGitHub Environment بمراجعين.
- [ ] كل الأسرار في Secret Manager، rotation مجرب، ولا credential في Git/history/artifacts/logs.
- [ ] مفاتيح Web/Android/Backend منفصلة ومقيدة بالنطاق/الحزمة وSHA-1/IP وبـAPI allowlist.
- [ ] OAuth consent، clients، audiences وredirect origins مراجعة؛ login يبقى مغلقاً حتى الاعتماد.
- [ ] قواعد Storage deny-by-default مختبرة؛ FCM وAnalytics وCrashlytics موافق عليها خصوصياً.
- [ ] Logging/Error Reporting/Monitoring ما زالت false حتى اعتماد الإطلاق والتنقيح والاحتفاظ.
- [ ] `npm run validate:google` وbuild/tests وTerraform validate ناجحة.
- [ ] quotas، dashboards، alerts، runbooks، نسخ/استعادة وrollback مجربة في non-production.
- [ ] موافقة أمن/خصوصية/منتج موثقة قبل تفعيل أي خدمة.
