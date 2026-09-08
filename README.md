# Khedmah Digital V1

Khedmah Digital V1 is the official repository for the Khedmah Digital source of truth.

## ابدأ من هنا — الصفحات وملفات الإصلاح

[**أطلس خدمة: جميع الصفحات والتصميم ودور الإدارة وملفات التنفيذ**](docs/operations/SITE-ATLAS.md)

- كود صفحات الويب: `apps/frontend/app/`، والمنطق المشترك: `apps/frontend/lib/`.
- خادم التشغيل: `apps/backend/src/`. مجلد `backend/` يحتوي الأسس والعقود والترحيلات؛ ليس مستودعاً ثانياً.
- الخطة التنفيذية: [خارطة البدء](ROADMAP-EXECUTION-2026-09-08.md). وصف النطاق المعتمد أدناه يبقى حاكماً.
- التقارير المؤرخة وملفات التسليم أدلة لنسخ سابقة، وليست بديلاً عن ملفات التشغيل أو إثباتاً لجاهزية الإنتاج.
- [أداة الجرد للقراءة فقط](scripts/repository-inventory.mjs) تولد قائمة الصفحات وملفاتها من commit محدد دون نقل أو حذف الملفات.


### كيف تعرف أين يجري الإصلاح؟

العمل الحالي على **PR #166** في الفرع `design-system-repair-2026-09-07` داخل هذا المستودع. `main` هو فرع الأساس وليس فرع الإصلاح. رقم commit في كل تسليم يحدد النسخة، ونجاحه لا ينتقل تلقائياً إلى النسخة التالية.

| ما تراجعه | الملف أو المصدر المسؤول |
|---|---|
| الشريط العلوي والهوية العامة | [layout.tsx](apps/frontend/app/layout.tsx) و[auth-navigation.tsx](apps/frontend/app/auth-navigation.tsx) |
| الخطوط والألوان والزجاج | [design-tokens.css](apps/frontend/app/design-tokens.css)، [section-themes.css](apps/frontend/app/section-themes.css)، [shell-system.css](apps/frontend/app/shell-system.css) |
| مكونات الصفحات المشتركة | [ui-primitives.tsx](apps/frontend/app/components/ui-primitives.tsx) |
| دليل التصنيفات | [category-directory.tsx](apps/frontend/app/components/category-directory.tsx) |
| اكتشف / البحث | [search/page.tsx](apps/frontend/app/search/page.tsx) و[search-context.ts](apps/frontend/lib/search-context.ts) |
| بالقرب مني / الخريطة | [map/page.tsx](apps/frontend/app/map/page.tsx)؛ ربط السياق B1.2b لم يغلق بعد |
| النقل | [mobility/page.tsx](apps/frontend/app/mobility/page.tsx)؛ اكتشاف وتواصل، لا محرك رحلات مكتمل |
| المتجر ومدخل الإعلانات | [store/page.tsx](apps/frontend/app/store/page.tsx) و[classifieds/page.tsx](apps/frontend/app/classifieds/page.tsx)؛ الثاني يعيد استخدام الأول حالياً |
| لوحة المالك والمراجعة | [admin/page.tsx](apps/frontend/app/admin/page.tsx) و[moderation/page.tsx](apps/frontend/app/admin/moderation/page.tsx) |
| تشغيل الإدارة وحدود بياناته | [operations-product/page.tsx](apps/frontend/app/admin/operations-product/page.tsx) و[خدمة التشغيل](apps/backend/src/operations-product/operations-product.service.ts) |
| مساعد المستخدم | [smart-assistant.tsx](apps/frontend/app/components/smart-assistant.tsx)؛ توجيه بالكلمات، ليس مديراً آلياً |
| نماذج الاستفسار والبلاغات ومساحات المالك المشتركة | `apps/frontend/components/`؛ ملفات مستخدمة فعلياً لا نسخة زائدة |

**ثلاثة أشياء مختلفة:** الزجاج طبقة تصميم؛ الأدمن واجهات وأفعال محمية بالصلاحيات؛ مساعد المستخدم مسار توجيه. وجود أحدها لا يثبت اكتمال الآخرين. حالات الإعداد لا تمثل مراقبة حية، وطلبات التغيير المسجلة لا تعني تنفيذ نشر أو تراجع.

### قاعدة تنظيم المستودع والتسليم

نحدّث الأطلس والخطة القائمين بدلاً من إنشاء تقارير جذر جديدة لكل دفعة. الجرد الآلي يميز ملف العرض عن التحويل وإعادة تصدير صفحة أخرى، وتظل اللقطات حاملة لرقم النسخة. حزمة `review-source.tar` للمراجعة فقط وليست نسخة احتياطية كاملة؛ تتضمن المكونات المشتركة والخطة النشطة، وتستبعد البيئة والمفاتيح والصور والخطوط. لا تُحذف التحويلات أو الترحيلات أو ملفات القفل أو التقارير المرتبطة قبل فحص تبعياتها واختبار التراجع.


The repository defines the approved foundation and bounded MVP baseline for an Arabic-first business growth platform. It contains governance, product scope, architecture principles, domain contracts, operational expectations, strategic vision, and the currently authorized MVP implementation foundations.

## Repository Purpose

The documentation foundation remains the prerequisite and source of truth. The current implementation boundary is governed by the [Khedmah Digital MVP Definition](docs/product/KHEDMAH-DIGITAL-MVP-DEFINITION.md); no capability outside that document is authorized.

## Source of Truth

- [Platform Constitution](docs/governance/PLATFORM-CONSTITUTION.md)
- [Project Charter](docs/governance/PROJECT-CHARTER.md)
- [V1 Scope](docs/product/V1-SCOPE.md)
- [Khedmah Digital MVP Definition](docs/product/KHEDMAH-DIGITAL-MVP-DEFINITION.md)
- [Reserved Modules](docs/product/RESERVED-MODULES.md)
- [Strategic Blueprint](docs/vision/STRATEGIC-BLUEPRINT.md)
- [System Architecture Overview](docs/architecture/SYSTEM-ARCHITECTURE-OVERVIEW.md)
- [Domain Contracts](docs/contracts/DOMAIN-CONTRACTS.md)
- [Definition of Done](docs/operations/DEFINITION-OF-DONE.md)

## Current Boundary

Runnable backend and frontend foundations exist under `apps/`, alongside canonical contracts and foundations under `backend/`. Their presence does not imply production readiness. Alpha remains blocked until the acceptance criteria and release gates in the MVP definition pass. Reserved and post-MVP modules remain documentation-only.


## Firebase SDK integration

Web and Android use the existing Firebase production project through centralized, environment-only configuration. See the [Firebase SDK integration guide](docs/google/firebase-sdk-integration.md) and [integration report](docs/reports/firebase-sdk-integration-report.md). No Firebase or Google Cloud resource is created by this integration.
