'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ModerationProviderReport, ProductListing, PublicBusinessProfile, PublicProfessionalProfile } from '../../../lib/api-client';

type DialogAction =
  | { kind: 'approve-profile'; type: 'business' | 'professional'; id: string; title: string }
  | { kind: 'reject-profile'; type: 'business' | 'professional'; id: string; title: string }
  | { kind: 'review-product'; status: 'approved' | 'rejected'; id: string; title: string; revision: string }
  | { kind: 'review-report'; status: 'in_review' | 'resolved' | 'dismissed'; id: string; title: string };

const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;
const needsNote = (action: DialogAction | null) => action?.kind === 'reject-profile' || (action?.kind === 'review-product' && action.status === 'rejected') || action?.kind === 'review-report';

export default function ModerationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessionalProfile[]>([]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [reports, setReports] = useState<ModerationProviderReport[]>([]);
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogNote, setDialogNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const dialogCancelRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const [{ businesses, professionals }, { products }, { reports }] = await Promise.all([
        api.moderation.listPending(),
        api.adminProducts.pending(),
        api.moderation.listReports()
      ]);
      setBusinesses(businesses);
      setProfessionals(professionals);
      setProducts(products);
      setReports(reports);
      setError(null);
    } catch (err: unknown) {
      setError(messageFor(err, 'حدث خطأ أثناء تحميل قائمة المراجعة'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadQueue(); }, []);
  useEffect(() => {
    if (!dialogAction) return;
    if (!needsNote(dialogAction)) dialogCancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || actionLoading) return;
      event.preventDefault();
      setDialogAction(null);
      setDialogNote('');
      window.requestAnimationFrame(() => dialogReturnFocusRef.current?.focus());
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialogAction, actionLoading]);

  function openDialog(action: DialogAction) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialogNote('');
    setFeedback(null);
    setDialogAction(action);
  }

  function closeDialog() {
    if (actionLoading) return;
    setDialogAction(null);
    setDialogNote('');
    window.requestAnimationFrame(() => dialogReturnFocusRef.current?.focus());
  }

  async function executeDialogAction() {
    if (!dialogAction) return;
    if (needsNote(dialogAction) && dialogNote.trim().length < 5) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      if (dialogAction.kind === 'approve-profile') {
        if (dialogAction.type === 'business') await api.businesses.approveModeration(dialogAction.id);
        else await api.professionals.approveModeration(dialogAction.id);
        setFeedback({ tone: 'success', text: 'تمت الموافقة على الملف بنجاح.' });
      } else if (dialogAction.kind === 'reject-profile') {
        if (dialogAction.type === 'business') await api.businesses.rejectModeration(dialogAction.id, dialogNote.trim());
        else await api.professionals.rejectModeration(dialogAction.id, dialogNote.trim());
        setFeedback({ tone: 'success', text: 'تم رفض الملف وتسجيل السبب.' });
      } else if (dialogAction.kind === 'review-product') {
        await api.adminProducts.review(dialogAction.id, dialogAction.status, dialogAction.revision, dialogAction.status === 'rejected' ? dialogNote.trim() : undefined);
        setFeedback({ tone: 'success', text: dialogAction.status === 'approved' ? 'تم نشر المنتج.' : 'تم رفض المنتج وتسجيل السبب.' });
      } else {
        await api.moderation.reviewReport(dialogAction.id, dialogAction.status, dialogNote.trim());
        setFeedback({ tone: 'success', text: dialogAction.status === 'resolved' ? 'تم تسجيل معالجة البلاغ.' : dialogAction.status === 'dismissed' ? 'تم استبعاد البلاغ مع تسجيل السبب.' : 'تم بدء مراجعة البلاغ.' });
      }
      setDialogAction(null);
      setDialogNote('');
      window.requestAnimationFrame(() => dialogReturnFocusRef.current?.focus());
      await loadQueue();
    } catch (err: unknown) {
      const status = err && typeof err === 'object' && 'statusCode' in err ? err.statusCode : undefined;
      if (dialogAction.kind === 'review-product' && status === 409) {
        setDialogAction(null); setDialogNote('');
        setFeedback({ tone: 'error', text: 'تغير المنتج أو صوره. تم تحديث القائمة؛ راجع البيانات والصور الجديدة قبل اتخاذ قرار آخر.' });
        await loadQueue();
      } else setFeedback({ tone: 'error', text: messageFor(err, 'تعذر تنفيذ إجراء المراجعة.') });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <main id="foundation-content" className="operations-shell moderation-state" aria-busy="true">جاري تحميل قائمة المراجعة...</main>;
  if (error) return <main id="foundation-content" className="operations-shell moderation-state form-error" role="alert">{error}<button type="button" onClick={() => void loadQueue()}>إعادة المحاولة</button></main>;

  return <main id="foundation-content" className="operations-shell moderation-page" dir="rtl">
    <header className="operations-header"><div><p className="eyebrow">خدمة · الإشراف</p><h1>إدارة المراجعة</h1><p>مراجعة ملفات الأعمال والمهنيين والمنتجات والبلاغات قبل اتخاذ الإجراء.</p></div><span className="status-badge">{businesses.length + professionals.length + products.length} بانتظار المراجعة</span></header>
    {feedback && <p className={`moderation-feedback ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}

    <section className="operations-panel moderation-section" aria-labelledby="products-title">
      <div className="panel-heading"><h2 id="products-title">منتجات متجر خدمة</h2><span>{products.length}</span></div>
      {products.length === 0 ? <p className="moderation-empty">لا توجد منتجات بانتظار المراجعة.</p> : <div className="moderation-list">{products.map((product) => <article key={product.id} className="moderation-card"><div><h3>{product.titleAr}</h3><p>{product.businessName ?? 'نشاط على خدمة'} · {product.price.toLocaleString('ar-SY')} {product.currency} · {product.categoryCode}</p>{product.descriptionAr && <p>{product.descriptionAr}</p>}<p>{product.availability === 'in_stock' ? 'متوفر' : product.availability === 'out_of_stock' ? 'غير متوفر' : 'حسب الطلب'}</p>{(product.imageUrls ?? (product.imageUrl ? [product.imageUrl] : [])).map((url, index) => <p key={url}><a href={url} target="_blank" rel="noreferrer">فتح صورة المنتج {index + 1}</a></p>)}</div><div className="moderation-actions"><button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-product', status: 'approved', id: product.id, title: product.titleAr, revision: product.revision })} className="moderation-approve">نشر</button><button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-product', status: 'rejected', id: product.id, title: product.titleAr, revision: product.revision })} className="moderation-reject">رفض</button></div></article>)}</div>}
    </section>

    <section className="operations-panel moderation-section"><div className="panel-heading"><h2>الأعمال المعلقة</h2><span>{businesses.length}</span></div>{businesses.length === 0 ? <p className="moderation-empty">لا توجد أعمال بانتظار المراجعة.</p> : <div className="moderation-list">{businesses.map((business) => <article key={business.id} className="moderation-card"><div><h3>{business.name}</h3><p>{business.categoryCode} · {business.cityCode}</p></div><div className="moderation-actions"><button onClick={() => openDialog({ kind: 'approve-profile', type: 'business', id: business.id, title: business.name })} disabled={actionLoading} className="moderation-approve">موافقة</button><button onClick={() => openDialog({ kind: 'reject-profile', type: 'business', id: business.id, title: business.name })} disabled={actionLoading} className="moderation-reject">رفض</button></div></article>)}</div>}</section>

    <section className="operations-panel moderation-section" aria-labelledby="reports-title"><div className="panel-heading"><h2 id="reports-title">بلاغات المستخدمين</h2><span>{reports.filter((report) => report.status === 'submitted' || report.status === 'in_review').length}</span></div>{reports.length === 0 ? <p className="moderation-empty">لا توجد بلاغات مسجلة.</p> : <div className="moderation-list">{reports.map((report) => <article key={report.id} className="moderation-card"><div><h3>{report.targetType === 'business' ? 'نشاط تجاري' : 'ملف مهني'} · {report.reasonCode}</h3><p>{report.details}</p><small><bdi>{report.targetId}</bdi> · {report.status}</small></div>{(report.status === 'submitted' || report.status === 'in_review') && <div className="moderation-actions">{report.status === 'submitted' && <button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-report', status: 'in_review', id: report.id, title: 'بدء مراجعة البلاغ' })}>بدء المراجعة</button>}<button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-report', status: 'resolved', id: report.id, title: 'معالجة البلاغ' })} className="moderation-approve">تمت المعالجة</button><button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-report', status: 'dismissed', id: report.id, title: 'استبعاد البلاغ' })} className="moderation-reject">استبعاد</button></div>}</article>)}</div>}</section>

    <section className="operations-panel moderation-section"><div className="panel-heading"><h2>المهنيون المعلقون</h2><span>{professionals.length}</span></div>{professionals.length === 0 ? <p className="moderation-empty">لا يوجد مهنيون بانتظار المراجعة.</p> : <div className="moderation-list">{professionals.map((professional) => <article key={professional.id} className="moderation-card"><div><h3>{professional.headlineAr}</h3><p>{professional.cityCode} · {professional.skills.join('، ')}</p></div><div className="moderation-actions"><button onClick={() => openDialog({ kind: 'approve-profile', type: 'professional', id: professional.id, title: professional.headlineAr })} disabled={actionLoading} className="moderation-approve">موافقة</button><button onClick={() => openDialog({ kind: 'reject-profile', type: 'professional', id: professional.id, title: professional.headlineAr })} disabled={actionLoading} className="moderation-reject">رفض</button></div></article>)}</div>}</section>

    {dialogAction && <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}><section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="moderation-dialog-title" aria-describedby="moderation-dialog-description" dir="rtl"><h3 id="moderation-dialog-title">{dialogAction.title}</h3><p id="moderation-dialog-description">{dialogAction.kind === 'approve-profile' ? 'تأكد من اكتمال البيانات قبل اعتماد الملف ونشره.' : dialogAction.kind === 'review-product' && dialogAction.status === 'approved' ? 'سيصبح المنتج متاحًا في متجر خدمة بعد التأكيد.' : dialogAction.kind === 'review-report' ? 'اكتب ملاحظة إدارية واضحة تحفظ مع سجل البلاغ.' : 'اكتب سببًا واضحًا يمكن الرجوع إليه أثناء المراجعة.'}</p>{needsNote(dialogAction) && <textarea className="moderation-reason" rows={4} value={dialogNote} onChange={(event) => setDialogNote(event.target.value)} placeholder="اكتب الملاحظة أو سبب القرار (5 أحرف على الأقل)…" autoFocus/>}<div className="moderation-actions"><button ref={dialogCancelRef} type="button" onClick={closeDialog} disabled={actionLoading}>إلغاء</button><button type="button" onClick={() => void executeDialogAction()} disabled={actionLoading || (needsNote(dialogAction) && dialogNote.trim().length < 5)} className={dialogAction.kind === 'reject-profile' || (dialogAction.kind === 'review-product' && dialogAction.status === 'rejected') || (dialogAction.kind === 'review-report' && dialogAction.status === 'dismissed') ? 'moderation-reject' : 'moderation-approve'}>{actionLoading ? 'جارٍ التنفيذ…' : 'تأكيد القرار'}</button></div></section></div>}
  </main>;
}
