'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type AdminPlatformMetrics, type OperationsProductOverview, type PublicUserProfile } from '../../lib/api-client';

const roleLabel = (role: string) => role === 'operations_product_director'
  ? 'مدير تشغيل المنصة'
  : role === 'security_operations_engineer'
    ? 'إدارة الأمن والمراجعة'
    : role.replaceAll('_', ' ');

const domainLabel: Record<string,string> = {
  identity:'الحسابات والهوية',teams:'الفرق المرتبطة بالحسابات',providers:'الأنشطة والمهنيون',catalog:'التصنيفات والخدمات',store:'متجر خدمة',promotions:'الخصومات والعروض',fulfillment:'الطعام والتوصيل',mobility:'التكسي والنقل',professional_services:'الخدمات المهنية',contact_and_trust:'التواصل والثقة',media:'الصور والوسائط',analytics:'البحث والتحليلات',operations:'التشغيل والحوادث'
};
const managementLabel = (value:string) => value==='managed'?'إدارة محمية':value==='governed'?'سياسة ومراجعة':'مراقبة تشغيلية';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [overview, setOverview] = useState<OperationsProductOverview | null>(null);
  const [metrics,setMetrics]=useState<AdminPlatformMetrics|null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.auth.session(), api.operationsProduct.overview(),api.operationsProduct.platformMetrics()])
      .then(([session, result,metricResult]) => {
        if (!active) return;
        setUser(session.user);
        setOverview(result.operationsProduct);
        setMetrics(metricResult.platformMetrics);
      })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) {
          router.replace('/auth/login?next=%2Fadmin');
          return;
        }
        setError(status === 403
          ? 'هذا الحساب لا يملك صلاحية إدارة منصة خدمة.'
          : cause instanceof Error ? cause.message : 'تعذر التحقق من صلاحية الإدارة.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [router]);

  if (isLoading) {
    return <main id="foundation-content" className="operations-shell" aria-label="لوحة الإدارة" aria-busy="true"><section className="operations-panel"><p>جاري التحقق من صلاحية الإدارة…</p></section></main>;
  }

  if (error || !user || !overview || !metrics) {
    return <main id="foundation-content" className="operations-shell" aria-label="الوصول إلى الإدارة"><section className="operations-panel"><h1>لوحة الإدارة غير متاحة</h1><p className="form-error" role="alert">{error || 'تعذر فتح لوحة الإدارة.'}</p><Link href="/" className="foundation-action">العودة إلى الرئيسية</Link></section></main>;
  }

  const canManageModeration = overview.permissions.includes('security.manage');
  const canManageUsers = overview.permissions.includes('users.manage');
  const canMonitorOrders = overview.permissions.includes('orders.monitor');
  const canManageCatalog = overview.permissions.includes('catalog.manage');
  const attentionTotal = metrics.domains.reduce((total,domain)=>total+domain.attention,0);

  return <main id="foundation-content" className="operations-shell" aria-label="لوحة إدارة منصة خدمة">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · الإدارة الداخلية</p><h1>مركز إدارة المنصة</h1><p>تشغيل ومراجعة ومتابعة كل قطاعات المنتج من لوحة واحدة، مع تسجيل كل قرار.</p></div>
      <span className="status-badge">{overview.roles.map(roleLabel).join(' · ')}</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/">الرئيسية</Link>
      <Link href="/admin/smart-report">تقرير الإدارة الذكية</Link>
      {canManageModeration ? <Link href="/admin/moderation">المراجعة والبلاغات</Link> : null}
      {canManageUsers ? <Link href="/admin/users">المستخدمون</Link> : null}
      {canMonitorOrders ? <Link href="/admin/orders">مراقبة الطلبات</Link> : null}
      {canManageCatalog?<Link href="/admin/catalog">إدارة التصنيفات</Link>:<Link href="/categories">التصنيفات</Link>}
      <Link href="/admin/operations-product">التشغيل والبنية التحتية</Link>
    </nav>

    <section className="operations-summary" aria-label="ملخص الإدارة">
      <article><strong>{metrics.users.active}</strong><span>مستخدمون نشطون من {metrics.users.total}</span></article>
      <article><strong>{metrics.businesses.live}</strong><span>أنشطة حية من {metrics.businesses.total}</span></article>
      <article><strong>{metrics.orders.active}</strong><span>طلبات توصيل نشطة</span></article>
      <article><strong>{attentionTotal}</strong><span>حالات تحتاج انتباهًا عبر المنصة</span></article>
    </section>

    <section className="operations-panel" aria-labelledby="admin-coverage-title">
      <div className="panel-heading"><h2 id="admin-coverage-title">تغطية الأدمن على كامل الموقع</h2><span>{metrics.domains.length} قطاعًا من المصدر الحي</span></div>
      <div className="moderation-list">{metrics.domains.map(domain=><article className="moderation-card" key={domain.id}><div><h3>{domainLabel[domain.id]??domain.id}</h3><p>{managementLabel(domain.management)} · {domain.total.toLocaleString('ar-SY-u-nu-latn')} سجلًا مجمعًا</p></div><span className="status-badge">{domain.state==='attention'?`${domain.attention.toLocaleString('ar-SY-u-nu-latn')} تحتاج متابعة`:'لا توجد حالات معلقة'}</span></article>)}</div>
    </section>

    <section className="operations-grid" aria-label="مؤشرات قطاعات المنصة الحية">
      <article className="operations-panel"><div className="panel-heading"><h2>المستخدمون</h2><span>{metrics.users.suspended} معلّق</span></div><p>{metrics.users.active} حسابًا نشطًا من أصل {metrics.users.total}.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>الفرق المرتبطة بالحسابات</h2><span>{metrics.teams.total} فريق</span></div><p>{metrics.teams.activeMembers} عضوًا نشطًا ضمن البيانات القائمة، دون إعادة إحياء المسار المتقاعد.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>الأنشطة والمهنيون</h2><span>{metrics.businesses.pending+metrics.professionals.pending+metrics.verifications.pending} قيد المراجعة</span></div><p>{metrics.businesses.live} نشاطًا و{metrics.professionals.live} مهنيًا ظاهرون حاليًا.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>التصنيفات والخدمات</h2><span>{metrics.categories.active} تصنيفًا حيًا</span></div><p>{metrics.services.live} خدمة حية ضمن {metrics.locations.active} موقعًا معتمدًا.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>متجر خدمة</h2><span>{metrics.products.pending} للمراجعة</span></div><p>{metrics.products.live} منتجًا حيًا من أصل {metrics.products.total}.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>خصومات وعروض خدمة</h2><span>{metrics.promotions.pending} للمراجعة</span></div><p>{metrics.promotions.live} عرضًا حيًا و{metrics.promotions.redeemed} عملية استفادة مكتملة.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>الطعام والتوصيل</h2><span>{metrics.orders.stale+metrics.orders.unassigned} للمتابعة</span></div><p>{metrics.orders.delivered} طلبًا مكتمل التسليم من أصل {metrics.orders.total}.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>التكسي والتنقل</h2><span>{metrics.mobility.stale} للمتابعة</span></div><p>{metrics.mobility.active} رحلة نشطة من أصل {metrics.mobility.total}.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>الخدمات المهنية</h2><span>{metrics.professionalJobs.attention+metrics.professionalJobs.revisitRequested} للمتابعة</span></div><p>{metrics.professionalJobs.active} طلبًا نشطًا، منها {metrics.professionalJobs.disputed} متنازع عليها.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>التواصل والثقة</h2><span>{metrics.contactInquiries.overdue+metrics.reports.open} للمتابعة</span></div><p>{metrics.contactInquiries.open} استفسارًا مفتوحًا و{metrics.reports.open} بلاغًا قيد المعالجة.</p></article>
      <article className="operations-panel"><div className="panel-heading"><h2>الوسائط والتحليلات</h2><span>{metrics.analytics.last30Days} حدثًا</span></div><p>{metrics.media.public} ملفًا عامًا من أصل {metrics.media.total} خلال دورة إدارة الوسائط.</p></article>
    </section>

    <section className="operations-grid" aria-label="أقسام الإدارة">
      <article className="operations-panel operations-panel-featured"><div className="panel-heading"><h2>الأدمن الذكي</h2><span>مدير تشغيل تنفيذي</span></div><p>يراقب قطاعات المنصة، يعتمد المحتوى المطابق للسياسة، يوجّه الاستثناءات، ويقودك مباشرة إلى الإجراء المطلوب مع سجل تدقيق كامل.</p><Link href="/admin/smart-report">فتح مركز قرارات الأدمن</Link></article>
      {canManageModeration ? <article className="operations-panel"><div className="panel-heading"><h2>المراجعة والبلاغات</h2><span>مقيد</span></div><p>مراجعة ملفات الأعمال والمهنيين والبلاغات قبل النشر أو اتخاذ الإجراء.</p><Link href="/admin/moderation">فتح المراجعة</Link></article> : null}
      {canManageUsers ? <article className="operations-panel"><div className="panel-heading"><h2>إدارة المستخدمين</h2><span>مسجل</span></div><p>البحث عن الحسابات وتعليقها أو إعادة تفعيلها مع إبطال الجلسات وسجل تدقيق دائم.</p><Link href="/admin/users">فتح إدارة المستخدمين</Link></article> : null}
      {canMonitorOrders ? <article className="operations-panel"><div className="panel-heading"><h2>مراقبة الطلبات والتوصيل</h2><span>قراءة آمنة</span></div><p>اكتشاف الطلبات المتأخرة أو غير المسندة ومتابعة حالتها دون كشف عنوان العميل أو هاتفه.</p><Link href="/admin/orders">فتح شاشة المراقبة</Link></article> : null}
      <article className="operations-panel"><div className="panel-heading"><h2>التصنيفات والأنشطة</h2><span>{canManageCatalog?'إدارة محمية':'قراءة'}</span></div><p>مصدر التصنيفات المعتمد مع قياس الأنشطة والخدمات والمنتجات المرتبطة وحماية التصنيف المستخدم.</p><Link href={canManageCatalog?'/admin/catalog':'/categories'}>{canManageCatalog?'فتح إدارة التصنيفات':'عرض التصنيفات الحية'}</Link></article>
      <article className="operations-panel"><div className="panel-heading"><h2>التشغيل</h2><span>{overview.health.status === 'ready' ? 'جاهز' : overview.health.status}</span></div><p>حالة الخدمات والتغييرات والحوادث دون عرض أي أسرار.</p><Link href="/admin/operations-product">فتح مركز التشغيل</Link></article>
    </section>
  </main>;
}
