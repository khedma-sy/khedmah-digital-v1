'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type SmartAdminReport } from '../../../lib/api-client';

const eventLabel = (event: string) => ({ business_view: 'مشاهدات الأنشطة', search_action: 'عمليات البحث', contact_click: 'نقرات التواصل', inquiry_submitted: 'طلبات التواصل' }[event] ?? event);
const domainLabel: Record<string,string> = {identity:'الحسابات والهوية',teams:'الفرق المرتبطة بالحسابات',providers:'الأنشطة والمهنيون',catalog:'التصنيفات والخدمات',store:'متجر خدمة',promotions:'الخصومات والعروض',fulfillment:'الطعام والتوصيل',mobility:'التكسي والنقل',professional_services:'الخدمات المهنية',contact_and_trust:'التواصل والثقة',media:'الصور والوسائط',analytics:'البحث والتحليلات',operations:'التشغيل والحوادث'};
const actionCenter = [
  { permission: 'security.manage', href: '/admin/moderation', title: 'المراجعة والثقة', description: 'حسم الملفات والبلاغات والاستثناءات.' },
  { permission: 'users.manage', href: '/admin/users', title: 'المستخدمون', description: 'إدارة حالة الحسابات مع سبب مسجل.' },
  { permission: 'orders.monitor', href: '/admin/orders', title: 'الطلبات والرحلات', description: 'كشف التأخير وعدم الإسناد ومتابعة الحالة.' },
  { permission: 'catalog.manage', href: '/admin/catalog', title: 'التصنيفات', description: 'إدارة المصدر المعتمد وحماية التصنيفات المستخدمة.' },
  { permission: 'incidents.manage', href: '/admin/operations-product', title: 'الحوادث التشغيلية', description: 'فتح الحوادث ومتابعتها حتى التحقق والإغلاق.' },
] as const;

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

  const availableActions = actionCenter.filter((item) => report.access.permissions.includes(item.permission));

  return <main className="operations-shell" dir="rtl" aria-label="مركز قرارات الأدمن الذكي">
    <header className="operations-header"><div><p className="eyebrow">خدمة · مدير التشغيل الذكي</p><h1>مركز قرارات المنصة</h1><p>إدارة تشغيلية كاملة داخل المنتج خلال آخر {report.analytics.periodDays} يومًا: مراقبة، اعتماد وفق السياسة، توجيه الاستثناءات، وتنفيذ موثّق.</p></div><span className="status-badge">كل قرار قابل للتدقيق</span></header>
    <nav className="admin-navigation" aria-label="التنقل الإداري"><Link href="/admin">لوحة الإدارة</Link><Link href="/admin/moderation">المراجعة والبلاغات</Link><Link href="/admin/operations-product">التشغيل</Link></nav>
    <section className="operations-panel operations-panel-featured" aria-labelledby="smart-actions-title"><div className="panel-heading"><h2 id="smart-actions-title">مركز التنفيذ</h2><span>صلاحيات داخلية كاملة</span></div><p>الأدمن الذكي يفرز الحالات ويقود إلى شاشة التنفيذ المناسبة. القرارات الحساسة تتطلب سببًا وصلاحية معتمدة، ولا تُنفّذ أي عملية حذف نهائي.</p><div className="operations-action-grid">{availableActions.map((item)=><Link className="operations-action-card" href={item.href} key={item.href}><strong>{item.title}</strong><span>{item.description}</span></Link>)}</div></section>
    <section className="operations-summary" aria-label="ملخص سلوك المنصة"><article><strong>{report.analytics.totalEvents.toLocaleString('ar-SY-u-nu-latn')}</strong><span>أحداث مجمعة</span></article>{Object.entries(report.analytics.eventCounts).map(([event,count]) => <article key={event}><strong>{count.toLocaleString('ar-SY-u-nu-latn')}</strong><span>{eventLabel(event)}</span></article>)}</section>
    <section className="operations-summary" aria-label="ملخص مراجعة المنتجات والعروض"><article><strong>{report.productModeration.autoApproved.toLocaleString('ar-SY-u-nu-latn')}</strong><span>إعلانات قُبلت آليًا</span></article><article><strong>{report.productModeration.reviewRequired.toLocaleString('ar-SY-u-nu-latn')}</strong><span>إعلانات تحتاج مراجعة</span></article><article><strong>{report.promotionModeration.live.toLocaleString('ar-SY-u-nu-latn')}</strong><span>عروض حية</span></article><article><strong>{report.promotionModeration.pending.toLocaleString('ar-SY-u-nu-latn')}</strong><span>عروض تحتاج مراجعة</span></article></section>
    <section className="operations-panel" aria-labelledby="smart-coverage-title"><div className="panel-heading"><h2 id="smart-coverage-title">نطاق إدارة الأدمن الذكي</h2><span>{report.platformCoverage.length} قطاعًا</span></div><div className="moderation-list">{report.platformCoverage.map(domain=><article className="moderation-card" key={domain.id}><div><h3>{domainLabel[domain.id]??domain.id}</h3><p>{domain.total.toLocaleString('ar-SY-u-nu-latn')} سجلًا مجمعًا ضمن النطاق</p></div><span className="status-badge">{domain.state==='attention'?`${domain.attention.toLocaleString('ar-SY-u-nu-latn')} تحتاج متابعة`:'لا توجد حالات معلقة'}</span></article>)}</div></section>
    <section className="operations-grid" aria-label="تحليل الإدارة الذكية">
      <article className="operations-panel"><div className="panel-heading"><h2>أكثر ما يبحث عنه المستخدمون</h2><span>مجمّع</span></div>{report.analytics.topSearches.length ? <ol>{report.analytics.topSearches.map((item) => <li key={item.term}><b>{item.term}</b> — {item.count.toLocaleString('ar-SY-u-nu-latn')} عمليات</li>)}</ol> : <p>لا توجد عبارات بلغت حد الخصوصية الأدنى بعد.</p>}</article>
      <article className="operations-panel"><div className="panel-heading"><h2>احتياجات بلا نتائج</h2><span>فرص تطوير</span></div>{report.analytics.unmetSearches.length ? <ol>{report.analytics.unmetSearches.map((item) => <li key={item.term}><b>{item.term}</b> — {item.count.toLocaleString('ar-SY-u-nu-latn')} عمليات بلا نتائج</li>)}</ol> : <p>لا توجد فجوات متكررة مؤكدة ضمن الفترة.</p>}</article>
      <article className="operations-panel"><div className="panel-heading"><h2>قرارات التشغيل المقترحة</h2><span>جاهزة للتنفيذ</span></div>{report.recommendations.length === 0 ? <p>لا توجد إجراءات عاجلة ضمن البيانات المجمعة للفترة الحالية.</p> : report.recommendations.map((item) => <section key={item.title}><h3>{item.title}</h3><p>{item.reason}</p><p><strong>الإجراء:</strong> {item.action}</p></section>)}</article>
      <article className="operations-panel"><div className="panel-heading"><h2>الحماية وسجل القرار</h2><span>مفعّلان</span></div><p>لا تظهر العبارة إلا بعد تكرارها من مجموعة لا تقل عن {report.privacy.minimumSearchCohort} عمليات. لا يعرض المركز هوية المستخدم أو النصوص الفردية أو بيانات الاتصال.</p><p>يقبل الأدمن الذكي المنتج أو العرض آليًا عند تحقق أهلية النشاط والسياسة الموضوعية. الحالات الخطرة أو غير المكتملة تُوجّه للمراجعة ذات الصلاحية، ولا ينفذ حذفًا نهائيًا أو يكشف أسرار البنية التحتية.</p></article>
    </section>
  </main>;
}
