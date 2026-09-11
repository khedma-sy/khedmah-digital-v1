import type { Metadata } from 'next';
import { ActionLink, PageHeader, PageShell, Surface } from '../components/ui-primitives';

export const metadata: Metadata = {
  title: 'حذف حساب خدمة',
  description: 'المورد العام لطلب حذف حساب خدمة والبيانات المرتبطة به.'
};

const deletionMail = 'mailto:support@khedmah.uk?subject=%D8%B7%D9%84%D8%A8%20%D8%AD%D8%B0%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8%20%D8%AE%D8%AF%D9%85%D8%A9&body=%D8%A3%D8%B1%D8%AC%D9%88%20%D8%AD%D8%B0%D9%81%20%D8%AD%D8%B3%D8%A7%D8%A8%D9%8A%20%D9%88%D8%A7%D9%84%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA%20%D8%A7%D9%84%D9%85%D8%B1%D8%AA%D8%A8%D8%B7%D8%A9%20%D8%A8%D9%87.%0A%D8%A7%D9%84%D8%A8%D8%B1%D9%8A%D8%AF%20%D8%A7%D9%84%D9%85%D8%B3%D8%AC%D9%84%3A%20';

export default function DeleteAccountPage() {
  return <PageShell label="حذف الحساب">
    <PageHeader title="طلب حذف حساب خدمة" description="هذه الصفحة متاحة من داخل التطبيق ومن الويب لبدء طلب حذف الحساب والبيانات المرتبطة به." />
    <div className="khedma-legal-grid">
      <Surface>
        <h2>كيفية إرسال الطلب</h2>
        <ol>
          <li>أرسل الطلب من البريد نفسه المسجل في حساب خدمة متى كان ذلك ممكنًا.</li>
          <li>اكتب بوضوح أنك تطلب حذف الحساب والبيانات المرتبطة به.</li>
          <li>قد نطلب خطوة تحقق معقولة للتأكد من ملكية الحساب. لن نطلب كلمة المرور أو رمز جلسة أو مفتاحًا سريًا.</li>
        </ol>
        <a className="ui-action" href={deletionMail}>إرسال طلب الحذف إلى الدعم</a>
      </Surface>
      <Surface>
        <h2>ماذا يشمل الطلب؟</h2>
        <p>يشمل طلب الحذف حساب التطبيق وبياناته الشخصية المرتبطة، ويشمل إزالة أو إخفاء البيانات العامة المرتبطة بالحساب عندما لا توجد حاجة مشروعة للاحتفاظ بها. قد تبقى سجلات محدودة فقط إذا كانت مطلوبة قانونيًا أو ضرورية للأمن ومنع الاحتيال، مع تقييد استخدامها.</p>
        <p>تعليق الحساب أو تسجيل الخروج لا يعدان تنفيذًا لطلب الحذف.</p>
      </Surface>
      <Surface>
        <h2>قبل الإرسال</h2>
        <p>إذا كان لديك نشاط أو إعلان أو محتوى منشور، اذكر في الطلب أي معلومات تساعد على تحديده. لا ترسل وثائق هوية عبر بريد غير مطلوب؛ إذا احتجنا تحققًا إضافيًا سنوضح قناة آمنة مناسبة.</p>
        <div className="ui-page-actions"><ActionLink href="/privacy">سياسة الخصوصية</ActionLink><ActionLink href="/users/me" variant="secondary">العودة إلى حسابي</ActionLink></div>
      </Surface>
    </div>
  </PageShell>;
}
