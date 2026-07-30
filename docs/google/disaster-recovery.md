# Disaster Recovery

## الاستجابة

1. أعلن الحادث وحدد النطاق دون نسخ بيانات حساسة إلى التذكرة.
2. عند تسرب مفتاح: قيده/عطله فوراً، أنشئ بديلاً مقيداً، حدّث Secret Manager ثم أعد النشر وراجع audit logs.
3. عند خلل OAuth: عطّل موفر Google/الربط الجديد، لا تتجاوز verification، واستعد client configuration المعروفة.
4. عند إساءة Maps/FCM: اخفض quota أو عطّل المفتاح/الإرسال مع إبقاء التطبيق في degraded-safe mode.
5. عند خطأ Storage: أعد deny-all rules أولاً ثم استعد objects وفق سياسة النسخ المعتمدة.

## الاستعادة والتحقق

Terraform وملفات الإعداد تعيدان control plane؛ لا يحتوي Git بيانات أو أسراراً. احتفظ بإصدارات secrets ضمن نافذة الرجوع وبنسخ Storage وفق RPO/RTO تعتمدها الحوكمة قبل الإطلاق. تحقق من IAM/API restrictions، build، smoke tests، metrics الآمنة، ثم أعد الخدمة تدريجياً. وثّق timeline والسبب والإجراءات، دوّر كل material المتأثر واختبر runbook دورياً.
