'use client';

import React, { useEffect, useState } from 'react';
import { api, AdminContentGovernance, KhedmahPromotion, ModerationProviderReport, ProductListing, PublicBusinessProfile, PublicProfessionalProfile, UploadedMediaAsset } from '../../../lib/api-client';

const DRIVER_DOCUMENT_LABELS:Record<string,string>={driver_photo:'الصورة الشخصية للسائق',identity_card:'بطاقة الهوية',driving_license:'رخصة القيادة',vehicle_license:'رخصة السيارة'};
const DRIVER_REVIEW_LABELS={pending:'بانتظار التدقيق',approved:'معتمدة',rejected:'مرفوضة'} as const;

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
  const [governance,setGovernance]=useState<AdminContentGovernance|null>(null);
  const [driverDocuments,setDriverDocuments]=useState<Record<string,UploadedMediaAsset[]>>({});
  const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;

  const loadQueue = async () => {
    setLoading(true);
    try {
      const [{ businesses, professionals }, { products }, { reports }, { promotions },{contentGovernance}] = await Promise.all([
        api.moderation.listPending(),
        api.adminProducts.pending(),
        api.moderation.listReports(),
        api.adminPromotions.pending(),api.operationsProduct.contentGovernance()
      ]);
      setBusinesses(businesses);
      setProfessionals(professionals);
      setProducts(products);
      setReports(reports);
      setPromotions(promotions);
      setGovernance(contentGovernance);
      const mobilityBusinesses=businesses.filter(business=>business.categoryCode==='taxi'||business.categoryCode==='delivery_courier');
      const documents=await Promise.all(mobilityBusinesses.map(async business=>[business.id,(await api.media.listForOwner('business_profile',business.id)).filter(asset=>['driver_photo','identity_card','driving_license','vehicle_license'].includes(asset.assetType??''))] as const));
      setDriverDocuments(Object.fromEntries(documents));
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
        await api.businesses.approveAndPublish(id);
      } else {
        await api.professionals.approveAndPublish(id);
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
  const reviewDriverDocument=async(id:string,status:'approved'|'rejected')=>{let reason:string|undefined;if(status==='rejected'){const entered=prompt('اكتب سبب رفض الوثيقة بوضوح:');if(!entered||entered.trim().length<5)return;reason=entered.trim()}else if(!confirm('اعتماد هذه الوثيقة؟'))return;setActionLoading(true);try{await api.media.reviewDriverDocument(id,status,reason);await loadQueue()}catch(err){alert(messageFor(err,'تعذر تحديث قرار الوثيقة'))}finally{setActionLoading(false)}};

  if (loading) return <main id="foundation-content" className="operations-shell moderation-state" aria-busy="true">جاري تحميل قائمة المراجعة...</main>;
  if (error) return <main id="foundation-content" className="operations-shell moderation-state form-error" role="alert">{error}</main>;

  return (
    <main id="foundation-content" className="operations-shell moderation-page" dir="rtl">
      <header className="operations-header"><div><p className="eyebrow">خدمة · الإشراف</p><h1>إدارة المراجعة</h1><p>مراجعة ملفات الأعمال والمهنيين والمنتجات والعروض قبل إتاحتها للمستخدمين.</p></div><span className="status-badge">{businesses.length + professionals.length + products.length + promotions.length} بانتظار المراجعة</span></header>

      {governance?<section className="operations-summary" aria-label="سياسة المنتجات والعروض"><article><strong>{governance.productPolicy.listingLimitPerUser}</strong><span>حد الإعلانات لكل مستخدم</span></article><article><strong>{governance.products.pending}</strong><span>منتجات تحتاج مراجعة</span></article><article><strong>{governance.promotions.autoApprovedLast30Days}</strong><span>عروض قُبلت آليًا خلال 30 يومًا</span></article><article><strong>{governance.products.ownersAtLimit}</strong><span>مستخدمون بلغوا الحد</span></article></section>:null}
      {governance?<section className="operations-panel"><div className="panel-heading"><h2>سياسة القبول الآلي</h2><span>مفعّلة</span></div><p>تُقبل المنتجات والعروض منخفضة المخاطر وفق الشروط الموضوعية. العناصر الدوائية المقيدة أو البائع غير المؤهل أو نقص الصورة تبقى للمراجعة البشرية، ولا ينفذ الأدمن الذكي رفضًا استثنائيًا بمفرده.</p><p><strong>مرحلة الإعلانات:</strong> {governance.productPolicy.phase==='free_launch'?'إطلاق مجاني — الدفع والتسعير غير مفعّلين':'خطط مدفوعة متاحة'}. لا تظهر إمكانية الشراء إلا بعد جاهزية التسعير والدفع ومسار التحصيل معًا.</p></section>:null}

      {governance?<section className="operations-panel" aria-labelledby="advertising-blueprints-title"><div className="panel-heading"><h2 id="advertising-blueprints-title">مسودة باقات الإعلانات المدفوعة</h2><span>غير قابلة للشراء</span></div><div className="moderation-list">{governance.productPolicy.plannedPackages.map(plan=><article className="moderation-card" key={plan.code}><div><h3>{plan.nameAr}</h3><p>{plan.kind==='listing_bundle'?`${plan.listingLimit?.toLocaleString('ar-SY')} إعلانًا لمدة ${plan.durationDays.toLocaleString('ar-SY')} يومًا`:`إضافة ممولة لمدة ${plan.durationDays.toLocaleString('ar-SY')} أيام`}</p><small>{plan.featuresAr.join(' · ')}</small></div><div><strong>السعر غير معتمد</strong><p>{plan.placement==='organic'?'ظهور عضوي عادل':'يظهر بعلامة «ممول» منفصلة'}</p></div></article>)}</div><p>هذه حدود تشغيلية مقترحة فقط. لا توجد أسعار أو اشتراكات أو دفعات منشأة، ولا تمنح أي باقة أفضلية مخفية في الثقة أو التقييم أو البحث العضوي.</p></section>:null}

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
                  {(b.categoryCode==='taxi'||b.categoryCode==='delivery_courier')&&<><small>الوثائق المعتمدة: {(driverDocuments[b.id]??[]).filter(asset=>asset.documentReviewStatus==='approved').length.toLocaleString('ar-SY')}/٤</small><div className="moderation-list">{(driverDocuments[b.id]??[]).map(asset=><div className="moderation-card" key={asset.id}><div><a href={asset.publicUrl} target="_blank" rel="noreferrer">{DRIVER_DOCUMENT_LABELS[asset.assetType??'']??'وثيقة السائق'}</a><small>{DRIVER_REVIEW_LABELS[asset.documentReviewStatus??'pending']}{asset.documentReviewReason?` · ${asset.documentReviewReason}`:''}</small></div><div className="moderation-actions"><button type="button" disabled={actionLoading||asset.documentReviewStatus==='approved'} onClick={()=>void reviewDriverDocument(asset.id,'approved')} className="moderation-approve">اعتماد</button><button type="button" disabled={actionLoading||asset.documentReviewStatus==='rejected'} onClick={()=>void reviewDriverDocument(asset.id,'rejected')} className="moderation-reject">رفض</button></div></div>)}</div></>}
                </div>
                <div className="moderation-actions">
                  <button
                    onClick={() => handleApprove('business', b.id)}
                    disabled={actionLoading||((b.categoryCode==='taxi'||b.categoryCode==='delivery_courier')&&(driverDocuments[b.id]??[]).filter(asset=>asset.documentReviewStatus==='approved').length!==4)}
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
