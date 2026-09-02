'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, type OperationsIncident, type OperationsProductOverview } from '../../../lib/api-client';

const statusLabel = (status: string) => ({
  configured: 'مُعدّ',
  enabled: 'مفعّل',
  configuration_required: 'يتطلب إعدادًا',
  disabled_pre_launch: 'غير مفعّل قبل الإطلاق'
}[status] ?? status);

export default function OperationsProductPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<OperationsProductOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [incidents,setIncidents]=useState<OperationsIncident[]>([]);
  const [title,setTitle]=useState('');const [summary,setSummary]=useState('');const [category,setCategory]=useState('technical');const [severity,setSeverity]=useState('medium');const [saving,setSaving]=useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([api.operationsProduct.overview(),api.operationsProduct.history()])
      .then(([{ operationsProduct },history]) => { if (active){setOverview(operationsProduct);setIncidents(history.incidents);} })
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
  const canManageIncidents=overview.permissions.includes('incidents.manage');
  const reload=async()=>{const history=await api.operationsProduct.history();setIncidents(history.incidents);};
  const create=async(event:FormEvent)=>{event.preventDefault();setSaving(true);try{await api.operationsProduct.createIncident({title,summary,category,severity});setTitle('');setSummary('');await reload();}catch(cause){alert(cause instanceof Error?cause.message:'تعذر إنشاء المشكلة.');}finally{setSaving(false);}};
  const transition=async(incident:OperationsIncident)=>{const next=incident.status==='open'?'in_progress':incident.status==='in_progress'?'verification':incident.status==='verification'?'resolved':'open';const note=prompt(next==='resolved'?'اكتب نتيجة التحقق والإصلاح:':'اكتب ملاحظة الإجراء:');if(!note||note.trim().length<5)return;let assigneeUserId=incident.assigneeUserId;if(next==='in_progress'&&!assigneeUserId){assigneeUserId=prompt('معرّف الموظف المسؤول:')?.trim();if(!assigneeUserId)return;}try{await api.operationsProduct.transitionIncident(incident.id,{status:next,note:note.trim(),assigneeUserId});await reload();}catch(cause){alert(cause instanceof Error?cause.message:'تعذر تحديث المشكلة.');}};

  return <main id="foundation-content" className="operations-shell" dir="rtl">
    <header className="operations-header">
      <div><p className="eyebrow">خدمة · إدارة المنصة</p><h1>مركز التشغيل</h1><p>حالة الخدمات الفعلية التي يعرضها الخادم للحساب الإداري المصرح له.</p></div>
      <span className="status-badge">{overview.health.productionTrafficEnabled ? 'حركة الإنتاج مفعّلة' : 'حركة الإنتاج مقفلة'}</span>
    </header>

    <nav className="admin-navigation" aria-label="التنقل الإداري">
      <Link href="/admin">لوحة الإدارة</Link>
      {canManageModeration ? <Link href="/admin/moderation">المراجعة والبلاغات</Link> : null}
      <Link href="/categories">التصنيفات الحية</Link>
    </nav>

    <section className="operations-summary" aria-label="ملخص التشغيل">
      <article><strong>{overview.services.length}</strong><span>خدمات مراقبة</span></article>
      <article><strong>{overview.openIncidents}</strong><span>حوادث مفتوحة</span></article>
      <article><strong>{overview.pendingChanges}</strong><span>تغييرات معلقة</span></article>
      <article><strong>{overview.roles.length}</strong><span>أدوار هذا الحساب</span></article>
    </section>

    <section className="operations-grid" aria-label="حالة الخدمات">
      {overview.services.map((service) => <article className="operations-panel" key={service.id}>
        <div className="panel-heading"><h2>{service.label}</h2><span>{statusLabel(service.status)}</span></div>
        <p>المعرّف التشغيلي: <bdi>{service.id}</bdi></p>
      </article>)}
    </section>
    <section className="operations-panel" aria-labelledby="issues-title">
      <div className="panel-heading"><h2 id="issues-title">مركز المشاكل والإصلاحات</h2><span>{incidents.filter(item=>item.status!=='resolved').length} مفتوحة</span></div>
      {canManageIncidents?<form className="filter-bar" onSubmit={create}><label>عنوان المشكلة<input required minLength={3} maxLength={120} value={title} onChange={event=>setTitle(event.target.value)}/></label><label>التصنيف<select value={category} onChange={event=>setCategory(event.target.value)}><option value="technical">تقنية</option><option value="user_support">مساعدة مستخدم</option><option value="content">محتوى</option><option value="delivery">توصيل</option><option value="payments">دفع</option><option value="security">أمان</option><option value="other">أخرى</option></select></label><label>الأولوية<select value={severity} onChange={event=>setSeverity(event.target.value)}><option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option><option value="critical">حرجة</option></select></label><label>الوصف<textarea required minLength={10} maxLength={2000} value={summary} onChange={event=>setSummary(event.target.value)}/></label><button disabled={saving} type="submit">{saving?'جارٍ التسجيل…':'سجّل المشكلة'}</button></form>:null}
      {incidents.length===0?<p>لا توجد مشاكل تشغيلية مسجلة.</p>:<div className="moderation-list">{incidents.map(incident=><article className="moderation-card" key={incident.id}><div><h3>{incident.title}</h3><p>{incident.summary}</p><small>{incident.category} · {incident.severity} · {incident.status}{incident.assigneeUserId?` · المسؤول ${incident.assigneeUserId}`:''}</small></div>{canManageIncidents?<button onClick={()=>void transition(incident)}>{incident.status==='open'?'بدء العمل':incident.status==='in_progress'?'إرسال للتحقق':incident.status==='verification'?'اعتماد الإغلاق':'إعادة الفتح'}</button>:null}</article>)}</div>}
    </section>
  </main>;
}
