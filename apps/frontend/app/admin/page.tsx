'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type OperationsProductOverview, type PublicUserProfile } from '../../lib/api-client';
import { AiAdminControl } from './components/ai-admin-control';

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
  const canManageAi = overview.permissions.includes('ai.manage');

  return <main id="foundation-content" className="operations-shell" aria-label="لوحة إدارة منصة خدمة">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · إدارة المنصة</p><h1>لوحة مالك المنصة</h1><p>مراجعة المحتوى والتحقق والبلاغات، والتحكم بالمدير الذكي، وعرض ملخص إعداد التشغيل حسب صلاحيات الحساب.</p></div>
      <span className="status-badge">{overview.roles.map(roleLabel).join(' · ')}</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/">الرئيسية</Link>
      {canManageAi ? <Link href="/admin/ai">المدير الذكي</Link> : null}
      {canManageModeration ? <Link href="/admin/moderation">المراجعة والبلاغات</Link> : null}
      {canManageModeration ? <Link href="/admin/verification">التحقق</Link> : null}
      <Link href="/categories">التصنيفات</Link>
      <Link href="/admin/operations-product">التشغيل والبنية التحتية</Link>
    </nav>

    <section className="operations-summary" aria-label="ملخص الإدارة">
      <article><strong>{user.profile.displayName}</strong><span>الحساب الإداري</span></article>
      <article><strong>{overview.roles.length}</strong><span>الأدوار المعتمدة</span></article>
      <article><strong>{overview.openIncidents}</strong><span>حوادث في العملية الحالية</span></article>
      <article><strong>{overview.pendingChanges}</strong><span>تغييرات في العملية الحالية</span></article>
    </section>

    {canManageAi ? <AiAdminControl /> : null}

    <section className="operations-panel" aria-label="حدود بيانات التشغيل"><h2>ما الذي تثبته هذه اللوحة؟</h2><p>هذا ملخص إعداد معلن من الخادم، وليس فحصاً حياً لجاهزية الخدمات أو حركة الإنتاج.</p><p>سجلات الحوادث والتغييرات المعروضة مؤقتة في ذاكرة عملية الخادم؛ قد تفقد عند إعادة تشغيله، ولا تمثل سجل تشغيل دائماً.</p></section>

    <section className="operations-grid" aria-label="أقسام الإدارة">
      {canManageAi ? <article className="operations-panel"><div className="panel-heading"><h2>المدير الذكي</h2><span>مالك المنصة</span></div><p>إدارة حالة Khedmah AI Admin، السقف الشهري، أنماط التحليل، وحدود الموافقات البشرية.</p><Link href="/admin/ai">فتح مركز المدير الذكي</Link></article> : null}
      {canManageModeration ? <article className="operations-panel"><div className="panel-heading"><h2>المراجعة والبلاغات</h2><span>مقيد</span></div><p>مراجعة محتوى ملفات الأعمال والمهنيين والمنتجات والإعلانات والبلاغات قبل النشر أو اتخاذ الإجراء.</p><Link href="/admin/moderation">فتح المراجعة</Link></article> : null}
      {canManageModeration ? <article className="operations-panel"><div className="panel-heading"><h2>التحقق</h2><span>بشري</span></div><p>مراجعة طلبات التحقق التجارية والمهنية بعقد مرتبط بالطلب ونسخة الملف، منفصل عن اعتماد المحتوى.</p><Link href="/admin/verification">فتح مراجعة التحقق</Link></article> : null}
      <article className="operations-panel"><div className="panel-heading"><h2>التصنيفات</h2><span>قيد إعادة البناء</span></div><p>مصدر التصنيفات المعتمد الذي يغذي البحث والملفات والخريطة.</p><Link href="/categories">عرض التصنيفات الحية</Link></article>
      <article className="operations-panel"><div className="panel-heading"><h2>التشغيل</h2><span>ملخص إعداد</span></div><p>إعدادات الخدمات المعلنة وسجلات التغييرات والحوادث الحالية، دون ادعاء مراقبة حية.</p><Link href="/admin/operations-product">فتح مركز التشغيل</Link></article>
    </section>
  </main>;
}
