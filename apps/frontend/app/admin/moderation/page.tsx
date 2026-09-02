'use client';

import React, { useEffect, useState } from 'react';
import { api, KhedmahPromotion, ModerationProviderReport, ProductListing, PublicBusinessProfile, PublicProfessionalProfile } from '../../../lib/api-client';

export default function ModerationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessionalProfile[]>([]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [promotions, setPromotions] = useState<KhedmahPromotion[]>([]);
  const [reports, setReports] = useState<ModerationProviderReport[]>([]);
  const [rejectingEntity, setRejectingEntity] = useState<{ type: 'business' | 'professional'; id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;

  const loadQueue = async () => {
    setLoading(true);
    try {
      const [{ businesses, professionals }, { products }, { reports }, { promotions }] = await Promise.all([
        api.moderation.listPending(),
        api.adminProducts.pending(),
        api.moderation.listReports(),
        api.adminPromotions.pending()
      ]);
      setBusinesses(businesses);
      setProfessionals(professionals);
      setProducts(products);
      setReports(reports);
      setPromotions(promotions);
      setError(null);
    } catch (err: unknown) {
      setError(messageFor(err, 'حدث خطأ أثناء تحميل قائمة المراجعة'));
    } finally {
      setLoading(false);
    }
  };

  const reviewReport = async (id: string, status: 'in_review' | 'resolved' | 'dismissed') => {
    const note = prompt(status === 'dismissed' ? 'اكتب سبب استبعاد البلاغ:' : status === 'resolved' ? 'اكتب إجراء المعالجة:' : 'اكتب ملاحظة بدء المراجعة:');
    if (!note || note.trim().length < 5) return;
    setActionLoading(true);
    try { await api.moderation.reviewReport(id, status, note.trim()); await loadQueue(); }
    catch (err: unknown) { alert(messageFor(err, 'تعذر تحديث البلاغ')); }
    finally { setActionLoading(false); }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleApprove = async (type: 'business' | 'professional', id: string) => {
    if (!confirm('هل أنت متأكد من الموافقة على هذا الملف؟')) return;
    setActionLoading(true);
    try {
      if (type === 'business') {
        await api.businesses.approveModeration(id);
      } else {
        await api.professionals.approveModeration(id);
      }
      await loadQueue();
    } catch (err: unknown) {
      alert(messageFor(err, 'حدث خطأ أثناء الموافقة'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingEntity || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      if (rejectingEntity.type === 'business') {
        await api.businesses.rejectModeration(rejectingEntity.id, rejectReason);
      } else {
        await api.professionals.rejectModeration(rejectingEntity.id, rejectReason);
      }
      setRejectingEntity(null);
      setRejectReason('');
      await loadQueue();
    } catch (err: unknown) {
      alert(messageFor(err, 'حدث خطأ أثناء الرفض'));
    } finally {
      setActionLoading(false);
    }
  };

  const reviewProduct = async (id: string, status: 'approved' | 'rejected') => {
    let reason: string | undefined;
    if (status === 'rejected') {
      const entered = prompt('اكتب سبب رفض المنتج (5 أحرف على الأقل):');
      if (!entered || entered.trim().length < 5) return;
      reason = entered.trim();
    } else if (!confirm('هل تريد نشر هذا المنتج في متجر خدمة؟')) {
      return;
    }
    setActionLoading(true);
    try {
      await api.adminProducts.review(id, status, reason);
      await loadQueue();
    } catch (err: unknown) {
      alert(messageFor(err, 'تعذر تحديث مراجعة المنتج'));
    } finally {
      setActionLoading(false);
    }
  };

  const reviewPromotion = async (id:string,status:'approved'|'rejected')=>{let reason: string|undefined;if(status==='rejected'){const entered=prompt('اكتب سبب رفض العرض:');if(!entered||entered.trim().length<5)return;reason=entered.trim()}else if(!confirm('اعتماد العرض وإظهاره فورًا في الصفحة الحية؟'))return;setActionLoading(true);try{await api.adminPromotions.review(id,status,reason);await loadQueue()}catch(err){alert(messageFor(err,'تعذر تحديث العرض'))}finally{setActionLoading(false)}};

  if (loading) return <main id="foundation-content" className="operations-shell moderation-state" aria-busy="true">جاري تحميل قائمة المراجعة...</main>;
  if (error) return <main id="foundation-content" className="operations-shell moderation-state form-error" role="alert">{error}</main>;

  return (
    <main id="foundation-content" className="operations-shell moderation-page" dir="rtl">
      <header className="operations-header"><div><p className="eyebrow">خدمة · الإشراف</p><h1>إدارة المراجعة</h1><p>مراجعة ملفات الأعمال والمهنيين والمنتجات والعروض قبل إتاحتها للمستخدمين.</p></div><span className="status-badge">{businesses.length + professionals.length + products.length + promotions.length} بانتظار المراجعة</span></header>

      <section className="operations-panel moderation-section" aria-labelledby="promotions-title"><div className="panel-heading"><h2 id="promotions-title">خصومات وعروض خدمة</h2><span>{promotions.length}</span></div>{promotions.length===0?<p className="moderation-empty">لا توجد عروض تحتاج مراجعة؛ العروض منخفضة المخاطر تُعتمد آليًا.</p>:<div className="moderation-list">{promotions.map(p=><article key={p.id} className="moderation-card"><div><h3>{p.titleAr}</h3><p>{p.businessName} · السعر {p.originalPrice.toLocaleString('ar-SY')} · الخصم {p.discountValue.toLocaleString('ar-SY')} {p.discountType==='percentage'?'٪':p.currency}</p><small>من {new Date(p.startsAt).toLocaleString('ar-SY')} إلى {new Date(p.endsAt).toLocaleString('ar-SY')}</small></div><div className="moderation-actions"><button disabled={actionLoading} onClick={()=>void reviewPromotion(p.id,'approved')} className="moderation-approve">اعتماد ونشر حي</button><button disabled={actionLoading} onClick={()=>void reviewPromotion(p.id,'rejected')} className="moderation-reject">رفض</button></div></article>)}</div>}</section>

      <section className="operations-panel moderation-section" aria-labelledby="products-title">
        <div className="panel-heading"><h2 id="products-title">منتجات متجر خدمة</h2><span>{products.length}</span></div>
        {products.length === 0 ? <p className="moderation-empty">لا توجد منتجات بانتظار المراجعة.</p> : <div className="moderation-list">
          {products.map((product) => <article key={product.id} className="moderation-card">
            <div>
              <h3>{product.titleAr}</h3>
              <p>{product.businessName ?? 'نشاط على خدمة'} · {product.price.toLocaleString('ar-SY')} {product.currency} · {product.categoryCode}</p>
              {product.imageUrl && <a href={product.imageUrl} target="_blank" rel="noreferrer">فتح صورة المنتج</a>}
            </div>
            <div className="moderation-actions">
              <button disabled={actionLoading} onClick={() => void reviewProduct(product.id, 'approved')} className="moderation-approve">نشر</button>
              <button disabled={actionLoading} onClick={() => void reviewProduct(product.id, 'rejected')} className="moderation-reject">رفض</button>
            </div>
          </article>)}
        </div>}
      </section>

      <section className="operations-panel moderation-section">
        <div className="panel-heading"><h2>الأعمال المعلقة</h2><span>{businesses.length}</span></div>
        {businesses.length === 0 ? (
          <p className="moderation-empty">لا توجد أعمال بانتظار المراجعة.</p>
        ) : (
          <div className="moderation-list">
            {businesses.map((b) => (
              <article key={b.id} className="moderation-card">
                <div>
                  <h3>{b.name}</h3>
                  <p>{b.categoryCode} · {b.cityCode}</p>
                </div>
                <div className="moderation-actions">
                  <button
                    onClick={() => handleApprove('business', b.id)}
                    disabled={actionLoading}
                    className="moderation-approve"
                  >
                    موافقة
                  </button>
                  <button
                    onClick={() => setRejectingEntity({ type: 'business', id: b.id })}
                    disabled={actionLoading}
                    className="moderation-reject"
                  >
                    رفض
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="operations-panel moderation-section" aria-labelledby="reports-title">
        <div className="panel-heading"><h2 id="reports-title">بلاغات المستخدمين</h2><span>{reports.filter((report) => report.status === 'submitted' || report.status === 'in_review').length}</span></div>
        {reports.length === 0 ? <p className="moderation-empty">لا توجد بلاغات مسجلة.</p> : <div className="moderation-list">
          {reports.map((report) => <article key={report.id} className="moderation-card">
            <div><h3>{report.targetType === 'business' ? 'نشاط تجاري' : 'ملف مهني'} · {report.reasonCode}</h3><p>{report.details}</p><small><bdi>{report.targetId}</bdi> · {report.status}</small></div>
            {(report.status === 'submitted' || report.status === 'in_review') && <div className="moderation-actions">
              {report.status === 'submitted' && <button disabled={actionLoading} onClick={() => void reviewReport(report.id, 'in_review')} className="filter-action-secondary">بدء المراجعة</button>}
              <button disabled={actionLoading} onClick={() => void reviewReport(report.id, 'resolved')} className="moderation-approve">تمت المعالجة</button>
              <button disabled={actionLoading} onClick={() => void reviewReport(report.id, 'dismissed')} className="moderation-reject">استبعاد</button>
            </div>}
          </article>)}
        </div>}
      </section>

      <section className="operations-panel moderation-section">
        <div className="panel-heading"><h2>المهنيون المعلقون</h2><span>{professionals.length}</span></div>
        {professionals.length === 0 ? (
          <p className="moderation-empty">لا يوجد مهنيون بانتظار المراجعة.</p>
        ) : (
          <div className="moderation-list">
            {professionals.map((p) => (
              <article key={p.id} className="moderation-card">
                <div>
                  <h3>{p.headlineAr}</h3>
                  <p>{p.cityCode} · {p.skills.join('، ')}</p>
                </div>
                <div className="moderation-actions">
                  <button
                    onClick={() => handleApprove('professional', p.id)}
                    disabled={actionLoading}
                    className="moderation-approve"
                  >
                    موافقة
                  </button>
                  <button
                    onClick={() => setRejectingEntity({ type: 'professional', id: p.id })}
                    disabled={actionLoading}
                    className="moderation-reject"
                  >
                    رفض
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {rejectingEntity && (
        <div className="moderation-dialog-backdrop" role="presentation">
          <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title" dir="rtl">
            <h3 id="reject-title">سبب الرفض</h3>
            <textarea
              className="moderation-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="يرجى كتابة سبب الرفض هنا..."
            />
            <div className="moderation-actions">
              <button
                onClick={() => { setRejectingEntity(null); setRejectReason(''); }}
                className="filter-action-secondary"
              >
                إلغاء
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="moderation-reject"
              >
                تأكيد الرفض
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
