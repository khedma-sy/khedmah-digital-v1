'use client';

import { useEffect, useRef, useState } from 'react';
import {
  api,
  type BusinessProfileReviewSnapshot,
  type ModerationProviderReport,
  type ProductListing,
  type ProfessionalProfileReviewSnapshot,
  type PublicBusinessProfileModerationReview,
  type PublicProfessionalProfileModerationReview,
  type PublicServiceListing
} from '../../../lib/api-client';
import { adminClassifiedsApi, CLASSIFIEDS_SMART_ADMIN_VERSION, type OwnerAdListing } from '../../../lib/classifieds-client';
import { AD_KIND_LABELS, CLASSIFIEDS_ENABLED, formatAdPrice } from '../../../lib/classifieds';

type DialogAction =
  | { kind: 'approve-profile'; type: 'business' | 'professional'; id: string; title: string; revision: string }
  | { kind: 'reject-profile'; type: 'business' | 'professional'; id: string; title: string; revision: string }
  | { kind: 'review-product'; status: 'approved' | 'rejected'; id: string; title: string; revision: string; requiresPrescription?: boolean; controlledItem?: boolean }
  | { kind: 'review-ad'; decision: 'approved' | 'rejected'; id: string; title: string; reviewRevision: number; assessmentVersion: typeof CLASSIFIEDS_SMART_ADMIN_VERSION }
  | { kind: 'review-report'; status: 'in_review' | 'resolved' | 'dismissed'; id: string; title: string };

const messageFor = (value: unknown, fallback: string) => value instanceof Error ? value.message : fallback;
const needsNote = (action: DialogAction | null) => action?.kind === 'reject-profile' || (action?.kind === 'review-product' && action.status === 'rejected') || (action?.kind === 'review-ad' && action.decision === 'rejected') || action?.kind === 'review-report';
const requiresSecurityAuthority = (action: DialogAction | null) => action?.kind === 'reject-profile' ||
  (action?.kind === 'review-product' && action.status === 'rejected') ||
  (action?.kind === 'review-ad' && action.decision === 'rejected') ||
  action?.kind === 'review-report';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const hasProductSafetyContract = (product: ProductListing) =>
  typeof (product as { requiresPrescription?: unknown }).requiresPrescription === 'boolean'
  && typeof (product as { controlledItem?: unknown }).controlledItem === 'boolean';
const hasCompleteService = (value: unknown): value is PublicServiceListing => isRecord(value) &&
  isText(value.id) && isText(value.ownerType) && isText(value.ownerId) && isText(value.titleAr) && isText(value.categoryCode) &&
  ['fixed', 'hourly', 'negotiable'].includes(String(value.priceType)) && ['active', 'inactive'].includes(String(value.status)) &&
  typeof value.isFeatured === 'boolean' && isText(value.createdAt) &&
  (value.price === undefined || (typeof value.price === 'number' && Number.isFinite(value.price))) &&
  (value.priceCurrency === undefined || isText(value.priceCurrency));
const hasCoreSnapshot = (value: unknown): value is ProfessionalProfileReviewSnapshot => isRecord(value) &&
  isText(value.exactRevision) && Array.isArray(value.reviewImageUrls) && value.reviewImageUrls.every(isText) &&
  Array.isArray(value.serviceListings) && value.serviceListings.every(hasCompleteService);
const businessSnapshotFor = (profile: PublicBusinessProfileModerationReview): BusinessProfileReviewSnapshot | null => {
  const snapshot: unknown = profile.reviewSnapshot;
  if (!hasCoreSnapshot(snapshot) || !isRecord(snapshot)) return null;
  if (!Array.isArray(snapshot.openingHours) || !snapshot.openingHours.every((hour) => isRecord(hour) &&
    typeof hour.dayOfWeek === 'number' && isText(hour.openTime) && isText(hour.closeTime) && typeof hour.isClosed === 'boolean')) return null;
  if (!Array.isArray(snapshot.branches) || !snapshot.branches.every((branch) => isRecord(branch) &&
    isText(branch.id) && isText(branch.nameAr) && isText(branch.cityCode) && typeof branch.isMain === 'boolean')) return null;
  if (!Array.isArray(snapshot.socialLinks) || !snapshot.socialLinks.every((link) => isRecord(link) &&
    isText(link.id) && isText(link.platform) && isText(link.url))) return null;
  return snapshot as unknown as BusinessProfileReviewSnapshot;
};
const professionalSnapshotFor = (profile: PublicProfessionalProfileModerationReview): ProfessionalProfileReviewSnapshot | null =>
  hasCoreSnapshot(profile.reviewSnapshot) ? profile.reviewSnapshot : null;
const priceTypeLabels: Readonly<Record<PublicServiceListing['priceType'], string>> = {
  fixed: 'سعر ثابت', hourly: 'بالساعة', negotiable: 'قابل للتفاوض'
};
const dayLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

function reviewServices(services: readonly PublicServiceListing[]) {
  return <div aria-label="الخدمات ضمن لقطة المراجعة"><h4>الخدمات ({services.length})</h4>{services.length === 0 ? <p>لا توجد خدمات مضافة.</p> : <ul>{services.map((service) => <li key={service.id}>
    <strong>{service.titleAr}</strong>{service.titleEn && <span dir="ltr"> · {service.titleEn}</span>}
    {service.descriptionAr && <p>{service.descriptionAr}</p>}{service.descriptionEn && <p dir="ltr">{service.descriptionEn}</p>}
    <p>{service.categoryNameAr ?? service.categoryCode} · {priceTypeLabels[service.priceType]}{service.price !== undefined ? ` · ${service.price.toLocaleString('ar-SY')} ${service.priceCurrency ?? 'دون عملة'}` : ' · دون سعر رقمي'} · {service.status === 'active' ? 'نشطة' : 'غير نشطة'}</p>
  </li>)}</ul>}</div>;
}

function businessReviewDetails(snapshot: BusinessProfileReviewSnapshot) {
  return <>
    {reviewServices(snapshot.serviceListings)}
    <div aria-label="ساعات العمل ضمن لقطة المراجعة"><h4>ساعات العمل ({snapshot.openingHours.length})</h4>{snapshot.openingHours.length === 0 ? <p>لم تُضف ساعات عمل.</p> : <ul>{snapshot.openingHours.map((hour) => <li key={hour.id}>{dayLabels[hour.dayOfWeek] ?? `اليوم ${hour.dayOfWeek}`} · {hour.isClosed ? 'مغلق' : `${hour.openTime}–${hour.closeTime}`}</li>)}</ul>}</div>
    <div aria-label="الفروع ضمن لقطة المراجعة"><h4>الفروع ({snapshot.branches.length})</h4>{snapshot.branches.length === 0 ? <p>لا توجد فروع مضافة.</p> : <ul>{snapshot.branches.map((branch) => <li key={branch.id}><strong>{branch.nameAr}</strong>{branch.nameEn && <span dir="ltr"> · {branch.nameEn}</span>}<p>{branch.cityCode}{branch.addressAr ? ` · ${branch.addressAr}` : ''}{branch.phone ? ` · ${branch.phone}` : ''}{branch.isMain ? ' · الفرع الرئيسي' : ''}</p></li>)}</ul>}</div>
    <div aria-label="روابط التواصل ضمن لقطة المراجعة"><h4>روابط التواصل ({snapshot.socialLinks.length})</h4>{snapshot.socialLinks.length === 0 ? <p>لا توجد روابط تواصل مضافة.</p> : <ul>{snapshot.socialLinks.map((link) => <li key={link.id}><a href={link.url} target="_blank" rel="noreferrer">{link.platform}</a></li>)}</ul>}</div>
  </>;
}

export default function ModerationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [businesses, setBusinesses] = useState<PublicBusinessProfileModerationReview[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessionalProfileModerationReview[]>([]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [ads, setAds] = useState<OwnerAdListing[]>([]);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [reports, setReports] = useState<ModerationProviderReport[]>([]);
  const [hasSecurityAuthority, setHasSecurityAuthority] = useState(false);
  const [dialogAction, setDialogAction] = useState<DialogAction | null>(null);
  const [dialogNote, setDialogNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const dialogCancelRef = useRef<HTMLButtonElement>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);

  const lifecycle = useRef(0);
  const queueSequence = useRef(0);
  const actionInProgress = useRef(false);

  useEffect(() => {
    lifecycle.current += 1;
    return () => { lifecycle.current += 1; queueSequence.current += 1; };
  }, []);

  const loadQueue = async () => {
    const request = ++queueSequence.current;
    setLoading(true);
    setHasSecurityAuthority(false);
    setReports([]);
    setDialogAction((current) => requiresSecurityAuthority(current) ? null : current);
    try {
      const securityAuthorityPromise = (async () => {
        try {
          const { operationsProduct } = await api.operationsProduct.overview();
          return operationsProduct.permissions.includes('security.manage');
        } catch {
          // Content approval remains independently authorized by every backend queue.
          // If permission discovery is unavailable, fail closed for reports and all
          // destructive decisions rather than requesting their data speculatively.
          return false;
        }
      })();
      const classifiedsQueue = CLASSIFIEDS_ENABLED
        ? adminClassifiedsApi.pending()
          .then(({ ads }) => ({ ads, error: null as string | null }))
          .catch((err: unknown) => ({ ads: [] as OwnerAdListing[], error: messageFor(err, 'تعذر تحميل إعلانات خدمة للمراجعة.') }))
        : Promise.resolve({ ads: [] as OwnerAdListing[], error: null as string | null });
      const pendingProfiles = api.moderation.listPending();
      const pendingProducts = api.adminProducts.pending();
      const securityAuthority = await securityAuthorityPromise;
      const reportsQueue = securityAuthority
        ? api.moderation.listReports()
        : Promise.resolve({ reports: [] as ModerationProviderReport[] });
      const [{ businesses, professionals }, { products }, { reports }, { ads: pendingAds, error: pendingAdsError }] = await Promise.all([
        pendingProfiles,
        pendingProducts,
        reportsQueue,
        classifiedsQueue
      ]);
      if (request !== queueSequence.current) return;
      setBusinesses(businesses);
      setProfessionals(professionals);
      setProducts(products);
      setAds(pendingAds);
      setAdsError(pendingAdsError);
      setReports(reports);
      setHasSecurityAuthority(securityAuthority);
      if (!securityAuthority) {
        setDialogAction((current) => requiresSecurityAuthority(current) ? null : current);
        setDialogNote('');
      }
      setError(null);
    } catch (err: unknown) {
      if (request === queueSequence.current) setError(messageFor(err, 'حدث خطأ أثناء تحميل قائمة المراجعة'));
    } finally {
      if (request === queueSequence.current) setLoading(false);
    }
  };

  useEffect(() => { void loadQueue(); }, []);
  useEffect(() => {
    if (!dialogAction) return;
    if (!needsNote(dialogAction)) dialogCancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || actionInProgress.current) return;
      event.preventDefault();
      setDialogAction(null);
      setDialogNote('');
      const focusGeneration = lifecycle.current;
      window.requestAnimationFrame(() => { if (focusGeneration === lifecycle.current) dialogReturnFocusRef.current?.focus(); });
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
    if (actionInProgress.current) return;
    setDialogAction(null);
    setDialogNote('');
    const focusGeneration = lifecycle.current;
    window.requestAnimationFrame(() => { if (focusGeneration === lifecycle.current) dialogReturnFocusRef.current?.focus(); });
  }

  async function executeDialogAction() {
    if (!dialogAction || actionInProgress.current) return;
    if (requiresSecurityAuthority(dialogAction) && !hasSecurityAuthority) return;
    if (needsNote(dialogAction) && dialogNote.trim().length < 5) return;
    actionInProgress.current = true;
    queueSequence.current += 1;
    const generation = lifecycle.current;
    const active = () => generation === lifecycle.current;
    setActionLoading(true);
    setFeedback(null);
    try {
      if (dialogAction.kind === 'approve-profile') {
        if (dialogAction.type === 'business') await api.businesses.approveModeration(dialogAction.id, dialogAction.revision);
        else await api.professionals.approveModeration(dialogAction.id, dialogAction.revision);
        if (!active()) return;
        setFeedback({ tone: 'success', text: 'تمت الموافقة على الملف بنجاح.' });
      } else if (dialogAction.kind === 'reject-profile') {
        if (dialogAction.type === 'business') await api.businesses.rejectModeration(dialogAction.id, dialogNote.trim(), dialogAction.revision);
        else await api.professionals.rejectModeration(dialogAction.id, dialogNote.trim(), dialogAction.revision);
        if (!active()) return;
        setFeedback({ tone: 'success', text: 'تم رفض الملف وتسجيل السبب.' });
      } else if (dialogAction.kind === 'review-product') {
        if (dialogAction.status === 'approved' && (typeof dialogAction.requiresPrescription !== 'boolean' || typeof dialogAction.controlledItem !== 'boolean')) return;
        await api.adminProducts.review(dialogAction.id, dialogAction.status, dialogAction.revision, dialogAction.status === 'rejected' ? dialogNote.trim() : undefined);
        if (!active()) return;
        setFeedback({ tone: 'success', text: dialogAction.status === 'approved' ? 'تم نشر المنتج.' : 'تم رفض المنتج وتسجيل السبب.' });
      } else if (dialogAction.kind === 'review-ad') {
        await adminClassifiedsApi.review(
          dialogAction.id,
          dialogAction.decision,
          dialogAction.reviewRevision,
          dialogAction.assessmentVersion,
          dialogAction.decision === 'rejected' ? dialogNote.trim() : undefined
        );
        if (!active()) return;
        setFeedback({ tone: 'success', text: dialogAction.decision === 'approved' ? 'تم نشر الإعلان.' : 'تم رفض الإعلان وتسجيل السبب.' });
      } else {
        await api.moderation.reviewReport(dialogAction.id, dialogAction.status, dialogNote.trim());
        if (!active()) return;
        setFeedback({ tone: 'success', text: dialogAction.status === 'resolved' ? 'تم تسجيل معالجة البلاغ.' : dialogAction.status === 'dismissed' ? 'تم استبعاد البلاغ مع تسجيل السبب.' : 'تم بدء مراجعة البلاغ.' });
      }
      setDialogAction(null);
      setDialogNote('');
      const focusGeneration = lifecycle.current;
      window.requestAnimationFrame(() => { if (focusGeneration === lifecycle.current) dialogReturnFocusRef.current?.focus(); });
      await loadQueue();
    } catch (err: unknown) {
      if (!active()) return;
      const status = err && typeof err === 'object' && 'statusCode' in err ? err.statusCode : undefined;
      if (['review-product', 'review-ad', 'approve-profile', 'reject-profile'].includes(dialogAction.kind) && status === 409) {
        setDialogAction(null); setDialogNote('');
        setFeedback({ tone: 'error', text: dialogAction.kind === 'review-product' ? 'تغير المنتج أو صوره. تم تحديث القائمة؛ راجع البيانات والصور الجديدة قبل اتخاذ قرار آخر.' : dialogAction.kind === 'review-ad' ? 'تغير الإعلان أو صوره. تم تحديث القائمة؛ راجع النسخة الجديدة قبل اتخاذ قرار آخر.' : 'تغير الملف. تم تحديث القائمة؛ راجع البيانات الجديدة قبل اتخاذ قرار آخر.' });
        await loadQueue();
      } else setFeedback({ tone: 'error', text: messageFor(err, 'تعذر تنفيذ إجراء المراجعة.') });
    } finally {
      if (active()) { actionInProgress.current = false; setActionLoading(false); }
    }
  }

  if (loading) return <main id="foundation-content" className="operations-shell moderation-state" aria-busy="true">جاري تحميل قائمة المراجعة...</main>;
  if (error) return <main id="foundation-content" className="operations-shell moderation-state form-error" role="alert">{error}<button type="button" onClick={() => void loadQueue()}>إعادة المحاولة</button></main>;

  return <main id="foundation-content" className="operations-shell moderation-page" dir="rtl">
    <header className="operations-header"><div><p className="eyebrow">خدمة · الإشراف</p><h1>إدارة المراجعة</h1><p>مراجعة ملفات الأعمال والمهنيين والمنتجات والإعلانات قبل اتخاذ قرار بشري صريح.</p></div><span className="status-badge">{businesses.length + professionals.length + products.length + ads.length} بانتظار المراجعة</span></header>
    {(businesses.some((profile) => !businessSnapshotFor(profile)) || professionals.some((profile) => !professionalSnapshotFor(profile))) && <p className="moderation-feedback error" role="alert">لقطة المراجعة الكاملة مفقودة لبعض الملفات، لذلك تم تعطيل قرارها. <button type="button" disabled={actionLoading} onClick={() => void loadQueue()}>إعادة تحميل القائمة</button></p>}
    {feedback && <p className={`moderation-feedback ${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</p>}

    <section className="operations-panel moderation-section" aria-labelledby="products-title">
      <div className="panel-heading"><h2 id="products-title">منتجات متجر خدمة</h2><span>{products.length}</span></div>
      {products.length === 0 ? <p className="moderation-empty">لا توجد منتجات بانتظار المراجعة.</p> : <div className="moderation-list">{products.map((product) => { const safetyContractReady = hasProductSafetyContract(product); return <article key={product.id} className="moderation-card"><div><h3>{product.titleAr}</h3><p>{product.businessName ?? 'نشاط على خدمة'} · {product.price.toLocaleString('ar-SY')} {product.currency} · {product.categoryCode}</p>{product.descriptionAr && <p>{product.descriptionAr}</p>}<p>{product.availability === 'in_stock' ? 'متوفر' : product.availability === 'out_of_stock' ? 'غير متوفر' : 'حسب الطلب'}</p>{safetyContractReady ? <p>يتطلب وصفة طبية: {product.requiresPrescription ? 'نعم' : 'لا'} · صنف مقيّد: {product.controlledItem ? 'نعم' : 'لا'}</p> : <p className="moderation-feedback error" role="alert">حقلا الوصفة الطبية والصنف المقيّد مفقودان أو غير صالحين. لا يمكن نشر المنتج قبل تصحيح عقد البيانات.</p>}{(product.imageUrls ?? (product.imageUrl ? [product.imageUrl] : [])).map((url, index) => <p key={url}><a href={url} target="_blank" rel="noreferrer">فتح صورة المنتج {index + 1}</a></p>)}</div><div className="moderation-actions"><button disabled={actionLoading || !safetyContractReady} onClick={() => { if (!safetyContractReady) return; openDialog({ kind: 'review-product', status: 'approved', id: product.id, title: product.titleAr, revision: product.revision, requiresPrescription: product.requiresPrescription, controlledItem: product.controlledItem }); }} className="moderation-approve">نشر</button>{hasSecurityAuthority && <button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-product', status: 'rejected', id: product.id, title: product.titleAr, revision: product.revision })} className="moderation-reject">رفض</button>}</div></article>; })}</div>}
    </section>

    <section className="operations-panel moderation-section" aria-labelledby="classifieds-title">
      <div className="panel-heading"><h2 id="classifieds-title">إعلانات خدمة المعلقة</h2><span>{ads.length}</span></div>
      {!CLASSIFIEDS_ENABLED ? <p className="moderation-empty">مراجعة إعلانات خدمة معطلة في هذه البيئة. لا يتم استدعاء طابور الإعلانات حتى تفعيل الميزة صراحة.</p> : adsError ? <p className="moderation-feedback error" role="alert">{adsError} <button type="button" disabled={actionLoading} onClick={() => void loadQueue()}>إعادة تحميل قائمة المراجعة</button></p> : ads.length === 0 ? <p className="moderation-empty">لا توجد إعلانات بانتظار المراجعة.</p> : <div className="moderation-list">{ads.map((ad) => {
        const validReviewRevision = Number.isSafeInteger(ad.reviewRevision) && ad.reviewRevision > 0;
        const assessment = ad.smartAdmin;
        const validAssessmentSnapshot = Boolean(
          assessment &&
          assessment.version === CLASSIFIEDS_SMART_ADMIN_VERSION &&
          assessment.reviewRevision === ad.reviewRevision &&
          assessment.humanDecisionRequired === true &&
          assessment.automatedDecisionAllowed === false
        );
        const decisionReady = validReviewRevision && validAssessmentSnapshot;
        const reviewImages = ad.imageUrls.map((sourceUrl, index) => ({
          index,
          sourceUrl,
          reviewUrl: adminClassifiedsApi.reviewMediaUrl(sourceUrl)
        }));
        return <article key={ad.id} className="moderation-card"><div><h3>{ad.titleAr}</h3><p>{AD_KIND_LABELS[ad.kind]} · {formatAdPrice(ad)} · {ad.categoryCode}{ad.cityCode ? ` · ${ad.cityCode}` : ''}</p>{ad.areaText && <p>{ad.areaText}</p>}{ad.descriptionAr && <p>{ad.descriptionAr}</p>}<p>التواصل: {ad.contactMode === 'profile' ? 'عبر ملف النشاط' : <bdi>{ad.contactValue}</bdi>}</p>{ad.smartAdmin && <div className={`moderation-feedback ${ad.smartAdmin.priority === 'elevated' ? 'error' : ''}`} aria-label="تقييم Smart Admin"><strong>Smart Admin · {ad.smartAdmin.priority === 'elevated' ? 'أولوية مرتفعة للمراجعة' : 'فحص بنيوي مكتمل'}</strong><p>{ad.smartAdmin.summaryAr}</p>{ad.smartAdmin.signals.length > 0 && <ul>{ad.smartAdmin.signals.map((signal) => <li key={signal.code}>{signal.messageAr}</li>)}</ul>}<small>نسخة التقييم {ad.smartAdmin.reviewRevision} · القرار النهائي بشري ومسجل.</small></div>}{reviewImages.length > 0 && <div className="moderation-media-grid" aria-label="صور الإعلان للمراجعة">{reviewImages.map(({ index, sourceUrl, reviewUrl }) => reviewUrl ? <a key={sourceUrl} href={reviewUrl} target="_blank" rel="noreferrer" aria-label={`فتح صورة الإعلان ${index + 1}`}><img src={reviewUrl} alt={`${ad.titleAr} — صورة المراجعة ${index + 1}`} loading="lazy"/></a> : <p key={sourceUrl} className="moderation-feedback error" role="alert">تعذر تجهيز صورة الإعلان {index + 1} للمراجعة الخاصة.</p>)}</div>}{!validReviewRevision && <p className="moderation-feedback error" role="alert">تعذر تثبيت نسخة المراجعة لهذا الإعلان. أعد تحميل القائمة قبل اتخاذ قرار.</p>}{!validAssessmentSnapshot && <p className="moderation-feedback error" role="alert">تقييم Smart Admin مفقود أو قديم أو بعقد غير معتمد لهذه النسخة. أعد تحميل القائمة قبل اتخاذ قرار.</p>}</div><div className="moderation-actions"><button disabled={actionLoading || !decisionReady} onClick={() => { if (!ad.smartAdmin || !validAssessmentSnapshot) return; openDialog({ kind: 'review-ad', decision: 'approved', id: ad.id, title: ad.titleAr, reviewRevision: ad.reviewRevision, assessmentVersion: ad.smartAdmin.version }); }} className="moderation-approve">نشر الإعلان</button>{hasSecurityAuthority && <button disabled={actionLoading || !decisionReady} onClick={() => { if (!ad.smartAdmin || !validAssessmentSnapshot) return; openDialog({ kind: 'review-ad', decision: 'rejected', id: ad.id, title: ad.titleAr, reviewRevision: ad.reviewRevision, assessmentVersion: ad.smartAdmin.version }); }} className="moderation-reject">رفض الإعلان</button>}</div></article>;
      })}</div>}
      <p className="moderation-empty">Smart Admin يجهّز سياق المراجعة فقط؛ اعتماد أو رفض الإعلان يبقى قرارًا بشريًا صريحًا.</p>
    </section>

    <section className="operations-panel moderation-section"><div className="panel-heading"><h2>الأعمال المعلقة</h2><span>{businesses.length}</span></div>{businesses.length === 0 ? <p className="moderation-empty">لا توجد أعمال بانتظار المراجعة.</p> : <div className="moderation-list">{businesses.map((business) => {
      const snapshot = businessSnapshotFor(business);
      return <article key={business.id} className="moderation-card"><div><h3>{business.name}</h3><p>{business.categoryCode} · {business.cityCode}</p>{business.descriptionAr && <p>{business.descriptionAr}</p>}{business.descriptionEn && <p dir="ltr">{business.descriptionEn}</p>}<p><bdi>{business.phone}</bdi> · <bdi>{business.email}</bdi></p>{business.website && <p><bdi>{business.website}</bdi></p>}{business.addressAr && <p>{business.addressAr}</p>}{snapshot ? <>{snapshot.reviewImageUrls.map((url, index) => <p key={url}><a href={url} target="_blank" rel="noreferrer">فتح صورة النشاط {index + 1}</a></p>)}{businessReviewDetails(snapshot)}</> : <p className="moderation-feedback error" role="alert">لقطة المراجعة الكاملة غير متاحة. لا يمكن اعتماد هذا النشاط.</p>}</div><div className="moderation-actions"><button onClick={() => { if (!snapshot) return; openDialog({ kind: 'approve-profile', type: 'business', id: business.id, title: business.name, revision: snapshot.exactRevision }); }} disabled={actionLoading || !snapshot} className="moderation-approve">موافقة</button>{hasSecurityAuthority && <button onClick={() => { if (!snapshot) return; openDialog({ kind: 'reject-profile', type: 'business', id: business.id, title: business.name, revision: snapshot.exactRevision }); }} disabled={actionLoading || !snapshot} className="moderation-reject">رفض</button>}</div></article>;
    })}</div>}</section>

    {hasSecurityAuthority && <section className="operations-panel moderation-section" aria-labelledby="reports-title"><div className="panel-heading"><h2 id="reports-title">بلاغات المستخدمين</h2><span>{reports.filter((report) => report.status === 'submitted' || report.status === 'in_review').length}</span></div>{reports.length === 0 ? <p className="moderation-empty">لا توجد بلاغات مسجلة.</p> : <div className="moderation-list">{reports.map((report) => <article key={report.id} className="moderation-card"><div><h3>{report.targetType === 'business' ? 'نشاط تجاري' : 'ملف مهني'} · {report.reasonCode}</h3><p>{report.details}</p><small><bdi>{report.targetId}</bdi> · {report.status}</small></div>{(report.status === 'submitted' || report.status === 'in_review') && <div className="moderation-actions">{report.status === 'submitted' && <button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-report', status: 'in_review', id: report.id, title: 'بدء مراجعة البلاغ' })}>بدء المراجعة</button>}<button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-report', status: 'resolved', id: report.id, title: 'معالجة البلاغ' })} className="moderation-approve">تمت المعالجة</button><button disabled={actionLoading} onClick={() => openDialog({ kind: 'review-report', status: 'dismissed', id: report.id, title: 'استبعاد البلاغ' })} className="moderation-reject">استبعاد</button></div>}</article>)}</div>}</section>}

    <section className="operations-panel moderation-section"><div className="panel-heading"><h2>المهنيون المعلقون</h2><span>{professionals.length}</span></div>{professionals.length === 0 ? <p className="moderation-empty">لا يوجد مهنيون بانتظار المراجعة.</p> : <div className="moderation-list">{professionals.map((professional) => {
      const snapshot = professionalSnapshotFor(professional);
      return <article key={professional.id} className="moderation-card"><div><h3>{professional.headlineAr}</h3><p>{professional.cityCode} · {professional.skills.join('، ')}</p>{professional.headlineEn && <p dir="ltr">{professional.headlineEn}</p>}{professional.bioAr && <p>{professional.bioAr}</p>}{professional.bioEn && <p dir="ltr">{professional.bioEn}</p>}{snapshot ? <>{snapshot.reviewImageUrls.map((url, index) => <p key={url}><a href={url} target="_blank" rel="noreferrer">فتح صورة المهني {index + 1}</a></p>)}{reviewServices(snapshot.serviceListings)}</> : <p className="moderation-feedback error" role="alert">لقطة المراجعة الكاملة غير متاحة. لا يمكن اعتماد هذا الملف المهني.</p>}</div><div className="moderation-actions"><button onClick={() => { if (!snapshot) return; openDialog({ kind: 'approve-profile', type: 'professional', id: professional.id, title: professional.headlineAr, revision: snapshot.exactRevision }); }} disabled={actionLoading || !snapshot} className="moderation-approve">موافقة</button>{hasSecurityAuthority && <button onClick={() => { if (!snapshot) return; openDialog({ kind: 'reject-profile', type: 'professional', id: professional.id, title: professional.headlineAr, revision: snapshot.exactRevision }); }} disabled={actionLoading || !snapshot} className="moderation-reject">رفض</button>}</div></article>;
    })}</div>}</section>

    {dialogAction && <div className="moderation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}><section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="moderation-dialog-title" aria-describedby="moderation-dialog-description" dir="rtl"><h3 id="moderation-dialog-title">{dialogAction.title}</h3><p id="moderation-dialog-description">{dialogAction.kind === 'approve-profile' ? 'تأكد من اكتمال البيانات قبل اعتماد الملف ونشره.' : dialogAction.kind === 'review-product' && dialogAction.status === 'approved' ? `سيصبح المنتج متاحًا في متجر خدمة بعد التأكيد. يتطلب وصفة طبية: ${dialogAction.requiresPrescription ? 'نعم' : 'لا'} · صنف مقيّد: ${dialogAction.controlledItem ? 'نعم' : 'لا'}.` : dialogAction.kind === 'review-ad' && dialogAction.decision === 'approved' ? 'سيصبح الإعلان ظاهرًا في إعلانات خدمة بعد التأكيد. القرار النهائي للمشرف.' : dialogAction.kind === 'review-report' ? 'اكتب ملاحظة إدارية واضحة تحفظ مع سجل البلاغ.' : 'اكتب سببًا واضحًا يمكن الرجوع إليه أثناء المراجعة.'}</p>{needsNote(dialogAction) && <textarea className="moderation-reason" rows={4} value={dialogNote} onChange={(event) => setDialogNote(event.target.value)} placeholder="اكتب الملاحظة أو سبب القرار (5 أحرف على الأقل)…" autoFocus/>}<div className="moderation-actions"><button ref={dialogCancelRef} type="button" onClick={closeDialog} disabled={actionLoading}>إلغاء</button><button type="button" onClick={() => void executeDialogAction()} disabled={actionLoading || (needsNote(dialogAction) && dialogNote.trim().length < 5) || (dialogAction.kind === 'review-product' && dialogAction.status === 'approved' && (typeof dialogAction.requiresPrescription !== 'boolean' || typeof dialogAction.controlledItem !== 'boolean'))} className={dialogAction.kind === 'reject-profile' || (dialogAction.kind === 'review-product' && dialogAction.status === 'rejected') || (dialogAction.kind === 'review-ad' && dialogAction.decision === 'rejected') || (dialogAction.kind === 'review-report' && dialogAction.status === 'dismissed') ? 'moderation-reject' : 'moderation-approve'}>{actionLoading ? 'جارٍ التنفيذ…' : 'تأكيد القرار'}</button></div></section></div>}
  </main>;
}
