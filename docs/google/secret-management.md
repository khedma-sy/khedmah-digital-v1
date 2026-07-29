# Secret Management

## المصدر

أنشئ secrets بأسماء `infra/secrets/required-secrets.yaml` وأضف النسخ من قناة تشغيل موثوقة. امنح runtime وصول `secretAccessor` إلى الأسرار اللازمة فقط، لا على المشروع إن أمكن تضييقه لكل secret. استخدم Application Default Credentials وWorkload Identity Federation؛ يمنع إنشاء مفاتيح service account طويلة العمر.

## محلياً وCI

ينسخ المطور `.env.example` إلى ملف ignored. لا تستخدم قيماً إنتاجية محلياً. GitHub Environment يحمي الإنتاج بالمراجعين ويحقن secrets، بينما تخزن identifiers غير الحساسة كـ variables. شغّل `npm run validate:google` للملفات، و`node scripts/validate-google-config.mjs --production` بعد الحقن. دوّر القيمة بإضافة version، اختبرها، انقل traffic، ثم عطّل النسخة السابقة. لا تحذفها قبل انتهاء نافذة الرجوع.
