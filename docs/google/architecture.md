# Google Architecture

## الحدود

يبقى التطبيق منفصلاً عن موفري Google عبر حدود قابلة للحقن في `infra/google/services`. تقرأ طبقة `config/google` البيئة فقط وتفشل مبكراً عند غياب قيمة. لا تبدأ أي SDK عند الاستيراد. خدمات V1 المحجوزة هي OAuth، Maps/Places/Geocoding/Directions، وFirebase Auth/FCM/Analytics/Crashlytics/Storage. لا توجد قاعدة بيانات أو AI.

## التدفق

1. ينشئ Terraform APIs وهوية runtime محدودة.
2. يخزن المسؤول القيم في Secret Manager.
3. تستخدم CI هوية اتحادية وتتحقق من العقد قبل أي نشر.
4. يحقن runtime الأسرار دون ملفات مفاتيح.
5. تبقى telemetry معطلة افتراضياً حتى موافقة الإطلاق.

البيئات الإنتاجية منفصلة بمشروع Google/Firebase مستقل، مع ميزانية وتنبيهات وتدقيق IAM. لا يُرسل OAuth token أو FCM token أو موقع مستخدم أو secret إلى السجل.
