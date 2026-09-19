'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type OperationsProductOverview } from '../../../lib/api-client';

const statusLabel = (status: string) => ({
  configured: 'إعداد مسجّل',
  enabled: 'علم تفعيل مسجّل',
  configuration_required: 'يتطلب إعدادًا',
  disabled_pre_launch: 'علم التفعيل غير مسجّل'
}[status] ?? status);

export default function OperationsProductPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OperationsProductOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.operationsProduct.overview()
      .then(({ operationsProduct }) => { if (active) setOverview(operationsProduct); })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) {
          router.replace('/auth/login?next=%2Fadmin%2Foperations-product');
          return;
        }
        setError(status === 403
          ? 'هذا الحساب لا يملك صلاحية الاطلاع على تشغيل المنصة.'
          : cause instanceof Error ? cause.message : 'تعذر تحميل حالة تشغيل المنصة.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  if (loading) {
    return <main id="foundation-content" className="operations-shell" aria-busy="true"><section className="operations-panel"><p>جاري التحقق من صلاحية التشغيل…</p></section></main>;
  }

  if (error || !overview) {
    return <main id="foundation-content" className="operations-shell"><section className="operations-panel"><h1>مركز التشغيل غير متاح</h1><p className="form-error" role="alert">{error || 'تعذر فتح مركز التشغيل.'}</p><Link href="/admin">العودة إلى لوحة الإدارة</Link></section></main>;
  }

  const canManageModeration = overview.permissions.includes('security.manage');

  return <main id="foundation-content" className="operations-shell" dir="rtl">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · إدارة المنصة</p><h1>مركز التشغيل</h1><p>إعدادات يعلنها الخادم للحساب الإداري المصرح له؛ هذا الملخص ليس فحصاً حياً للخدمات.</p></div>
      <span className="status-badge">حالة الإنتاج غير متحققة حيّاً</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/admin">لوحة الإدارة</Link>
      {canManageModeration ? <Link href="/admin/moderation">المراجعة والبلاغات</Link> : null}
      <Link href="/categories">التصنيفات الحية</Link>
    </nav>

    <section className="operations-summary" aria-label="ملخص التشغيل">
      <article><strong>{overview.services.length}</strong><span>خدمات مدرجة في الإعداد</span></article>
      <article><strong>{overview.openIncidents}</strong><span>حوادث في العملية الحالية</span></article>
      <article><strong>{overview.pendingChanges}</strong><span>تغييرات في العملية الحالية</span></article>
      <article><strong>{overview.roles.length}</strong><span>أدوار هذا الحساب</span></article>
    </section>

    <section className="operations-panel" aria-label="حدود أدلة التشغيل"><h2>حدود البيانات المعروضة</h2><p>وجود إعداد أو علم تفعيل لا يثبت اتصالاً فعلياً بمزود الخدمة، ولا نجاح آخر بناء أو نشر، ولا حالة حركة الإنتاج.</p><p>سجلات الحوادث والتغييرات المعروضة مؤقتة في ذاكرة عملية الخادم؛ قد تفقد عند إعادة تشغيله. طلب التغيير أو التراجع المسجل لا يعني تنفيذ العملية.</p></section>

    <section className="operations-grid" aria-label="إعداد الخدمات المعلن">
      {overview.services.map((service) => <article className="operations-panel" key={service.id}>
        <div className="panel-heading"><h2>{service.label}</h2><span>{statusLabel(service.status)}</span></div>
        <p>المعرّف التشغيلي: <bdi>{service.id}</bdi></p>
      </article>)}
    </section>
  </main>;
}
