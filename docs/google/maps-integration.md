# Maps Integration

## فصل المفاتيح

- **Web:** مفتاح Browser مقيد بقائمة HTTPS HTTP referrers المعتمدة وبـ Maps JavaScript وPlaces فقط.
- **Android:** مفتاح مستقل مقيد باسم الحزمة وSHA-1 (release) وبـ Maps SDK for Android فقط؛ تسجل بصمة debug في مشروع غير إنتاجي.
- **Backend:** مفتاح مستقل مقيد بعناوين egress الثابتة وبـ Geocoding وDirections وPlaces اللازمة فقط.

لا يعاد استخدام مفتاح بين الأسطح. طبقة `GoogleMapsService` تستقبل transport قابلاً للاستبدال في الاختبار، ولا تخزن المفتاح أو تضيفه للسجل. تحقق من المدخلات، استخدم quotas وحدود الإنفاق، واجعل responses المؤقتة ضمن شروط Google وسياسة الخصوصية. راقب الرفض والـquota دون تسجيل العنوان أو الإحداثيات. تدوير المفتاح يتم بإنشاء مفتاح مقيد ثان، اختباره، تبديل secret، ثم إبطال القديم.
