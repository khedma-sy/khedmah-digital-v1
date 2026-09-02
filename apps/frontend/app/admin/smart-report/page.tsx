'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type SmartAdminReport } from '../../../lib/api-client';

const eventLabel = (event: string) => ({ business_view: 'مشاهدات الأنشطة', search_action: 'عمليات البحث', contact_click: 'نقرات التواصل', inquiry_submitted: 'طلبات التواصل' }[event] ?? event);

export default function SmartAdminReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<SmartAdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.operationsProduct.smartAdminReport().then(({ smartAdminReport }) => { if (active) setReport(smartAdminReport); }).catch((cause) => {
      if (!active) return;
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) return router.replace('/auth/login?next=%2Fadmin%2Fsmart-report');
      setError(status === 403 ? 'هذا الحساب لا يملك صلاحية الاطلاع على التقرير الإداري.' : cause instanceof Error ? cause.message : 'تعذر إنشاء التقرير الإداري.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  if (loading) return <main className="operations-shell" aria-busy="true"><section className="operations-panel"><p>جاري تحليل المؤشرات المجمعة…</p></section></main>;
  if (error || !report) return <main className="operations-shell"><section className="operations-panel"><h1>التقرير غير متاح</h1><p className="form-error" role="alert">{error || 'تعذر تحميل التقرير.'}</p><Link href="/admin">العودة إلى لوحة الإدارة</Link></section></main>;

  return <main className="operations-shell" dir="rtl" aria-label="تقرير الموظف الإداري الذكي">
    <header className="operations-header"><div><p className="eyebrow">خدمة · مساعد إداري</p><h1>تقرير تطوير المنصة</h1><p>تحليل مجمع لآخر {report.analytics.periodDays} يومًا، مع اعتماد آلي محدود للإعلانات المطابقة للسياسة.</p></div><span className="status-badge">الاستثناءات تُراجع بشريًا</span></header>
    <nav className="admin-navigation" aria-label="التنقل الإداري"><Link href="/admin">لوحة الإدارة</Link><Link href="/admin/moderation">المراجعة والبلاغات</Link><Link href="/admin/operations-product">التشغيل</Link></nav>
    <section className="operations-summary" aria-label="ملخص سلوك المنصة"><article><strong>{report.analytics.totalEvents.toLocaleString('ar-SY')}</strong><span>أحداث مجمعة</span></article>{Object.entries(report.analytics.eventCounts).map(([event,count]) => <article key={event}><strong>{count.toLocaleString('ar-SY')}</strong><span>{eventLabel(event)}</span></article>)}</section>
    <section className="operations-summary" aria-label="ملخص مراجعة الإعلانات"><article><strong>{report.productModeration.autoApproved.toLocaleString('ar-SY')}</strong><span>إعلانات قُبلت آليًا</span></article><article><strong>{report.productModeration.reviewRequired.toLocaleString('ar-SY')}</strong><span>إعلانات تحتاج مراجعة</span></article></section>
    <section className="operations-grid" aria-label="تحليل الإدارة الذكية">
      <article className="operations-panel"><div className="panel-heading"><h2>أكثر ما يبحث عنه المستخدمون</h2><span>مجمّع</span></div>{report.analytics.topSearches.length ? <ol>{report.analytics.topSearches.map((item) => <li key={item.term}><b>{item.term}</b> — {item.count.toLocaleString('ar-SY')} عمليات</li>)}</ol> : <p>لا توجد عبارات بلغت حد الخصوصية الأدنى بعد.</p>}</article>
      <article className="operations-panel"><div className="panel-heading"><h2>احتياجات بلا نتائج</h2><span>فرص تطوير</span></div>{report.analytics.unmetSearches.length ? <ol>{report.analytics.unmetSearches.map((item) => <li key={item.term}><b>{item.term}</b> — {item.count.toLocaleString('ar-SY')} عمليات بلا نتائج</li>)}</ol> : <p>لا توجد فجوات متكررة مؤكدة ضمن الفترة.</p>}</article>
      <article className="operations-panel"><div className="panel-heading"><h2>توصيات الموظف الإداري</h2><span>تحتاج موافقة</span></div>{report.recommendations.length === 0 ? <p>لا توجد توصيات عاجلة ضمن البيانات المجمعة للفترة الحالية.</p> : report.recommendations.map((item) => <section key={item.title}><h3>{item.title}</h3><p>{item.reason}</p><p><strong>الإجراء المقترح:</strong> {item.action}</p></section>)}</article>
      <article className="operations-panel"><div className="panel-heading"><h2>حماية المستخدم</h2><span>مفعّلة</span></div><p>لا تظهر العبارة إلا بعد تكرارها من مجموعة لا تقل عن {report.privacy.minimumSearchCohort} عمليات. لا يعرض التقرير هوية المستخدم أو النصوص الفردية أو بيانات الاتصال.</p><p>يقبل المساعد إعلان المنتج آليًا فقط عند تحقق أهلية النشاط والتصنيف والصورة وجودة المحتوى. الحالات الخطرة أو غير المكتملة تبقى معلّقة للمراجعة، ولا ينفذ حذفًا أو حظرًا أو رفضًا آليًا.</p></article>
    </section>
  </main>;
}
