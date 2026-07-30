# Firebase Setup

1. اربط مشروع Firebase بمشروع Google Cloud الإنتاجي المنفصل.
2. سجل تطبيقات Web وAndroid بالحزمة المعتمدة وبصمتي debug/release المنفصلتين.
3. ضع المعرفات في Secret Manager/GitHub Environment، لا في Git.
4. فعّل Auth وFCM وAnalytics وCrashlytics وStorage فقط بعد موافقة الخصوصية والإطلاق.
5. انشر `infra/firebase/storage.rules`؛ القاعدة الحالية deny-all مقصودة حتى اعتماد سياسة المسارات.
6. اختبر Auth وStorage بالمحاكيات. اختبر FCM بأجهزة اختبار دون بيانات عميل.

Analytics وCrashlytics يتطلبان consent واضحاً وسياسة احتفاظ. Authentication لا يفعّل موفر Google قبل إكمال OAuth. Cloud Storage لا يفتح أي مسار عاماً.


## Implemented SDK boundary

The approved existing-project integration is documented in [Firebase SDK Integration](firebase-sdk-integration.md). It supersedes any setup wording that could imply creating a project: this mission does not create or modify Firebase Console resources.
