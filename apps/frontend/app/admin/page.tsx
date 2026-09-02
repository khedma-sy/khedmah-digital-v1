'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type OperationsProductOverview, type PublicUserProfile } from '../../lib/api-client';

const roleLabel = (role: string) => role === 'operations_product_director'
  ? 'مالك المنصة'
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

  if (error || !user || !overview) {
    return <main id="foundation-content" className="operations-shell" aria-label="الوصول إلى الإدارة"><section className="operations-panel"><h1>لوحة الإدارة غير متاحة</h1><p className="form-error" role="alert">{error || 'تعذر فتح لوحة الإدارة.'}</p><Link href="/" className="foundation-action">العودة إلى الرئيسية</Link></section></main>;
  }

  const canManageModeration = overview.permissions.includes('security.manage');
  const canManageUsers = overview.permissions.includes('users.manage');
  const canMonitorOrders = overview.permissions.includes('orders.monitor');

  return <main id="foundation-content" className="operations-shell" aria-label="لوحة إدارة منصة خدمة">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · إدارة المنصة</p><h1>لوحة مالك المنصة</h1><p>إدارة المراجعة والتصنيفات والتشغيل بصلاحيات مقيدة ومسجلة.</p></div>
      <span className="status-badge">{overview.roles.map(roleLabel).join(' · ')}</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/">الرئيسية</Link>
      <Link href="/admin/smart-report">تقرير الإدارة الذكية</Link>
      {canManageModeration ? <Link href="/admin/moderation">المراجعة والبلاغات</Link> : null}
      {canManageUsers ? <Link href="/admin/users">المستخدمون</Link> : null}
      {canMonitorOrders ? <Link href="/admin/orders">مراقبة الطلبات</Link> : null}
      <Link href="/categories">التصنيفات</Link>
      <Link href="/admin/operations-product">التشغيل والبنية التحتية</Link>
    </nav>

    <section className="operations-summary" aria-label="ملخص الإدارة">
      <article><strong>{user.profile.displayName}</strong><span>الحساب الإداري</span></article>
      <article><strong>{overview.roles.length}</strong><span>الأدوار المعتمدة</span></article>
      <article><strong>{overview.openIncidents}</strong><span>حوادث مفتوحة</span></article>
      <article><strong>{overview.pendingChanges}</strong><span>تغييرات معلقة</span></article>
    </section>

    <section className="operations-grid" aria-label="أقسام الإدارة">
      <article className="operations-panel"><div className="panel-heading"><h2>الموظف الإداري الذكي</h2><span>مساعد فقط</span></div><p>تحليل مجمع لما يبحث عنه المستخدمون وفجوات النتائج ومشكلات التحويل، مع توصيات تحتاج قرارًا بشريًا.</p><Link href="/admin/smart-report">فتح تقرير التطوير</Link></article>
      {canManageModeration ? <article className="operations-panel"><div className="panel-heading"><h2>المراجعة والبلاغات</h2><span>مقيد</span></div><p>مراجعة ملفات الأعمال والمهنيين والبلاغات قبل النشر أو اتخاذ الإجراء.</p><Link href="/admin/moderation">فتح المراجعة</Link></article> : null}
      {canManageUsers ? <article className="operations-panel"><div className="panel-heading"><h2>إدارة المستخدمين</h2><span>مسجل</span></div><p>البحث عن الحسابات وتعليقها أو إعادة تفعيلها مع إبطال الجلسات وسجل تدقيق دائم.</p><Link href="/admin/users">فتح إدارة المستخدمين</Link></article> : null}
      {canMonitorOrders ? <article className="operations-panel"><div className="panel-heading"><h2>مراقبة الطلبات والتوصيل</h2><span>قراءة آمنة</span></div><p>اكتشاف الطلبات المتأخرة أو غير المسندة ومتابعة حالتها دون كشف عنوان العميل أو هاتفه.</p><Link href="/admin/orders">فتح شاشة المراقبة</Link></article> : null}
      <article className="operations-panel"><div className="panel-heading"><h2>التصنيفات</h2><span>قيد إعادة البناء</span></div><p>مصدر التصنيفات المعتمد الذي يغذي البحث والملفات والخريطة.</p><Link href="/categories">عرض التصنيفات الحية</Link></article>
      <article className="operations-panel"><div className="panel-heading"><h2>التشغيل</h2><span>{overview.health.status === 'ready' ? 'جاهز' : overview.health.status}</span></div><p>حالة الخدمات والتغييرات والحوادث دون عرض أي أسرار.</p><Link href="/admin/operations-product">فتح مركز التشغيل</Link></article>
    </section>
  </main>;
}
