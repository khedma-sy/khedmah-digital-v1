'use client';

import Link from 'next/link';
import { AiAdminControl } from '../components/ai-admin-control';

export default function AiAdminPage() {
  return <main id="foundation-content" className="operations-shell" aria-label="مركز المدير الذكي">
    <header className="operations-header">
      <div>
        <p className="eyebrow">خدمة · Khedmah AI Admin</p>
        <h1>مركز المدير الذكي</h1>
        <p>مفتاح تشغيل خادمي، سقف تكلفة، وصلاحيات fail-closed. الإيقاف يمنع طبقة التنفيذ من قبول مهام AI عند ربطها.</p>
      </div>
      <Link href="/admin">العودة إلى لوحة الإدارة</Link>
    </header>

    <AiAdminControl />

    <section className="operations-grid" aria-label="سياسة المدير الذكي">
      <article className="operations-panel">
        <div className="panel-heading"><h2>المهام المسموحة</h2><span>قراءة وتحليل</span></div>
        <p>تحليل مؤشرات المنصة، كشف أخطاء الواجهة والتشغيل، مراجعة الأنماط غير الطبيعية، وصياغة مهام وتقارير للإدارة.</p>
      </article>
      <article className="operations-panel">
        <div className="panel-heading"><h2>موافقة المالك</h2><span>إلزامية</span></div>
        <p>النشر إلى Production، تغيير الأدوار والصلاحيات، الإجراءات المدمرة على الحسابات، وتعديل الأسعار أو السياسات لا تُنفذ تلقائياً.</p>
      </article>
      <article className="operations-panel">
        <div className="panel-heading"><h2>الأسرار</h2><span>ممنوعة</span></div>
        <p>لا تُرسل كلمات المرور أو مفاتيح API أو Secret Manager payloads أو بيانات اعتماد السحابة إلى النموذج.</p>
      </article>
      <article className="operations-panel">
        <div className="panel-heading"><h2>أنماط المراجعة</h2><span>مقيدة</span></div>
        <p>Executive للملخص التنفيذي، Expose لكشف العيوب، KillCritic لنقد المقترحات قبل التنفيذ، وAutopsy لتحليل السبب الجذري بعد العطل.</p>
      </article>
    </section>
  </main>;
}
