# OAuth Integration

أنشئ OAuth consent screen إنتاجية بنطاقات الهوية الدنيا (`openid`, `email`, `profile`) وروابط السياسات المعتمدة. أنشئ client منفصلاً للويب وAndroid وbackend، وسجل redirect origins الفعلية في Console دون وضع client secret في الواجهة. Android مرتبط بالحزمة وSHA-1 المعتمدين.

الطبقة الحالية **لا تفعّل تسجيل الدخول**. عند موافقة الإطلاق، يرسل العميل ID token عبر قناة TLS إلى backend؛ يتحقق backend بالتنفيذ المحقون من التوقيع، issuer، expiry، nonce عند استخدامه، ومن أن `aud` ضمن `GOOGLE_OAUTH_ALLOWED_AUDIENCES`. لا يثق backend في profile من العميل ولا يسجل token. فشل التحقق مغلق ولا يغيّر API العام قبل اعتماد تعاقده.
