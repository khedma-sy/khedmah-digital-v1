'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type OperationsProductOverview, type PublicUserProfile } from '../../lib/api-client';

const roleLabel = (role: string) => role === 'operations_product_director'
  ? 'مالك المنصة'
  : role === 'smart_admin_approver'
    ? 'معتمد المراجعة'
    : role === 'security_operations_engineer'
      ? 'إدارة الأمن والمراجعة'
      : role.replaceAll('_', ' ');

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [overview, setOverview] = useState<OperationsProductOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api.auth.session(), api.operationsProduct.overview()])
      .then(([session, result]) => {
        if (!active) return;
        setUser(session.user);
        setOverview(result.operationsProduct);
      })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) { router.replace('/auth/login?next=%2Fadmin'); return; }
        setError(status === 403 ? 'هذا الحساب لا يملك صلاحية إدارة منصة خدمة.' : cause instanceof Error ? cause.message : 'تعذر التحقق من صلاحية الإدارة.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [router]);

  if (isLoading) return <main id="foundation-content" className="operations-shell" aria-label="لوحة الإدارة" aria-busy="true"><section className="operations-panel"><p>جاري التحقق من صلاحية الإدارة…</p></section></main>;
  if (error || !user || !overview) return <main id="foundation-content" className="operations-shell" aria-label="الوصول إلى الإدارة"><section className="operations-panel"><h1>لوحة الإدارة غير متاحة</h1><p className="form-error" role="alert">{error || 'تعذر فتح لوحة الإدارة.'}</p><Link href="/" className="foundation-action">العودة إلى الرئيسية</Link></section></main>;

  const hasSecurityAuthority = overview.permissions.includes('security.manage');
  const hasBroadAdminSurface = overview.permissions.includes('operations.read');
  const canReviewContent = hasSecurityAuthority || overview.permissions.includes('content.approvals.approve');
  const canReviewTrust = hasSecurityAuthority || overview.permissions.includes('trust.approvals.approve');
  const canReviewMobility = hasSecurityAuthority || overview.permissions.includes('mobility.approvals.approve');
  return <main id="foundation-content" className="operations-shell" aria-label="لوحة إدارة منصة خدمة">
    <header className="operations-header"><div><p className="eyebrow">{hasBroadAdminSurface ? 'خدمة · Executive Admin OS' : 'خدمة · المراجعة البشرية'}</p><h1>{hasBroadAdminSurface ? 'لوحة مالك المنصة' : 'لوحة المراجعة والاعتماد'}</h1><p>{hasBroadAdminSurface ? 'مركز قيادة موحّد يربط KORA بالمراجعة والتشغيل والمطاعم والتصنيفات ووحدات Product V2 الجديدة.' : 'مسارات بشرية محددة لمراجعة الأدلة وتسجيل قرارات الاعتماد المصرح بها.'}</p></div><span className="status-badge">{overview.roles.map(roleLabel).join(' · ')}</span></header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/">الرئيسية</Link>
      {hasBroadAdminSurface ? <Link href="/admin/kora">KORA Executive</Link> : null}
      {canReviewContent ? <Link href="/admin/moderation">{hasSecurityAuthority ? 'المراجعة والبلاغات' : 'مراجعة المحتوى'}</Link> : null}
      {canReviewTrust ? <Link href="/admin/verification">التحقق</Link> : null}
      {canReviewMobility ? <Link href="/admin/driver-documents">وثائق السائقين والمندوبين</Link> : null}
      {canReviewMobility ? <Link href="/admin/taxi-drivers">سائقو التكسي</Link> : null}
      {hasBroadAdminSurface ? <><Link href="/admin/billing">مراجعة السداد</Link><Link href="/admin/taxi-pricing">تسعيرة التكسي</Link><Link href="/categories">دليل التصنيفات</Link><Link href="/admin/categories">إدارة التصنيفات</Link><Link href="/orders/merchant">مساحة منشأتي</Link><Link href="/admin/operations-product">التشغيل والبنية التحتية</Link></> : null}
    </nav>

    <section className="operations-summary" aria-label="ملخص الإدارة"><article><strong>{user.profile.displayName}</strong><span>الحساب الإداري</span></article><article><strong>{overview.roles.length}</strong><span>الأدوار المعتمدة</span></article>{hasBroadAdminSurface ? <><article><strong>{overview.openIncidents}</strong><span>حوادث في العملية الحالية</span></article><article><strong>{overview.pendingChanges}</strong><span>تغييرات في العملية الحالية</span></article></> : null}</section>

    {hasBroadAdminSurface ? <section className="operations-panel" aria-label="حدود بيانات التشغيل"><h2>حدود الحقيقة التشغيلية</h2><p>هذا مركز تحكم إداري وليس فحصاً حياً لجاهزية الخدمات أو حركة الإنتاج. سجلات الحوادث والتغييرات المعروضة مؤقتة في ذاكرة عملية الخادم ولا تمثل سجلاً دائماً عبر كل النسخ. KORA لا تنفذ تغييراً تلقائياً، وكل وحدة فرعية تتحقق من صلاحيتها الخاصة على الخادم.</p></section> : <section className="operations-panel" aria-label="حدود صلاحية المراجعة"><h2>حدود صلاحية الاعتماد</h2><p>هذه الصلاحية تتيح قراءة طوابير المراجعة والأدلة اللازمة ثم تسجيل القبول فقط. الرفض والتعليق والإلغاء والبلاغات ليست متاحة لهذا الدور.</p></section>}

    <section className="operations-grid" aria-label="أقسام الإدارة">
      {hasBroadAdminSurface ? <><article className="operations-panel"><div className="panel-heading"><h2>KORA Executive</h2><span>Supervised</span></div><p>Executive، Expose، KillCritic، Autopsy، المقاييس، الشذوذ ومسودات المهام في مركز واحد.</p><Link href="/admin/kora">فتح مركز KORA</Link></article><article className="operations-panel"><div className="panel-heading"><h2>مساحة منشأتي</h2><span>Live Ops</span></div><p>الطلبات الحية، القائمة، ساعات العمل، الرنة، المندوب ومؤشرات الأداء الفعلية.</p><Link href="/orders/merchant">فتح مركز أوامر منشأتي</Link></article><article className="operations-panel"><div className="panel-heading"><h2>إدارة التصنيفات</h2><span>Product V2</span></div><p>إدارة الشجرة الهرمية، الترتيب، الإبراز والتفعيل دون حذف المراجع التاريخية.</p><Link href="/admin/categories">فتح لوحة التصنيفات</Link></article></> : null}
      {canReviewContent ? <article className="operations-panel"><div className="panel-heading"><h2>{hasSecurityAuthority ? 'المراجعة والبلاغات' : 'مراجعة المحتوى'}</h2><span>مقيد</span></div><p>مراجعة ملفات الأعمال والمهنيين والمنتجات والإعلانات قبل اتخاذ قرار بشري صريح.</p><Link href="/admin/moderation">فتح المراجعة</Link></article> : null}
      {canReviewTrust ? <article className="operations-panel"><div className="panel-heading"><h2>التحقق</h2><span>بشري</span></div><p>مراجعة طلبات التحقق التجارية والمهنية وتسجيل ملاحظات المراجع.</p><Link href="/admin/verification">فتح التحقق</Link></article> : null}
      {canReviewMobility ? <article className="operations-panel"><div className="panel-heading"><h2>وثائق السائقين والمندوبين</h2><span>خاص</span></div><p>فتح أحدث وثائق الهوية والقيادة والمركبة الخاصة ومراجعتها قبل الاعتماد.</p><Link href="/admin/driver-documents">فتح مراجعة الوثائق</Link></article> : null}
      {canReviewMobility ? <article className="operations-panel"><div className="panel-heading"><h2>Taxi Driver Ops</h2><span>Governed</span></div><p>مراجعة أحدث وثائق السائق والمركبة ثم اعتماد السائق والمركبة والمنطقة. هذا لا يفتح الرحلات تلقائيًا.</p><Link href="/admin/taxi-drivers">فتح إدارة سائقي التكسي</Link></article> : null}
      {hasBroadAdminSurface ? <><article className="operations-panel"><div className="panel-heading"><h2>تسعيرة التكسي</h2><span>سجل ومحاكاة</span></div><p>مراجعة تسعيرة المنطقة، محاكاة الأجرة، واعتماد إصدار موثق مع حماية من الكتابة فوق تعديل أحدث.</p><Link href="/admin/taxi-pricing">فتح إدارة التسعيرة</Link></article><article className="operations-panel"><div className="panel-heading"><h2>الباقات والسداد والنقاط</h2><span>مراجعة يدوية</span></div><p>طلبات الاشتراك والخصم وسجل السداد متاحة للمستخدم. يراجع مسؤول الفوترة المبلغ ومرجعه قبل تفعيل الاشتراك ومنح النقاط.</p><Link href="/admin/billing">مراجعة طلبات السداد</Link></article><article className="operations-panel"><div className="panel-heading"><h2>التشغيل</h2><span>ملخص إعداد</span></div><p>إعدادات الخدمات وسجلات التغييرات والحوادث الحالية.</p><Link href="/admin/operations-product">فتح مركز التشغيل</Link></article></> : null}
    </section>
  </main>;
}
