'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, BusinessBranch, BusinessSocialLink, MediaAsset, OpeningHours, ProviderContactInquiry, PublicBusinessProfile, PublicServiceListing, PublicUserProfile, VerificationRequest } from '../../../../lib/api-client';
import { useCategories } from '../../../../lib/use-categories';
import { useSyrianCities } from '../../../../lib/use-syrian-cities';
import { ActionButton, ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../../components/ui-primitives';
import { PlatformIcon } from '../../../components/platform-icon';
import { CategorySelectOptions } from '../../../components/category-select-options';
import styles from './provider-core.module.css';

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const PLATFORMS = [{ value: 'facebook', label: 'فيسبوك' }, { value: 'instagram', label: 'إنستغرام' }, { value: 'linkedin', label: 'لينكدإن' }, { value: 'youtube', label: 'يوتيوب' }, { value: 'whatsapp', label: 'واتساب' }];
const defaultHours = (): OpeningHours[] => DAYS.map((_, dayOfWeek) => ({ id: `day-${dayOfWeek}`, businessProfileId: '', dayOfWeek, openTime: '09:00', closeTime: '17:00', isClosed: dayOfWeek === 5 }));
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

function fileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read_failed'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

export default function ManageBusinessProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const { cities, isLoading: citiesLoading, error: citiesError } = useSyrianCities();
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [inquiries, setInquiries] = useState<ProviderContactInquiry[]>([]);
  const [hours, setHours] = useState<OpeningHours[]>(defaultHours);
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [socialLinks, setSocialLinks] = useState<BusinessSocialLink[]>([]);
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [mediaType, setMediaType] = useState<'logo' | 'cover' | 'gallery'>('gallery');
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [hasSavedHours, setHasSavedHours] = useState(false);
  const [mediaReadFailed, setMediaReadFailed] = useState(false);
  const lifecycle = useRef(0);
  const requestSequence = useRef(0);
  const actionInProgress = useRef(false);
  const currentId = useRef(id);
  currentId.current = id;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showReviewConfirm, setShowReviewConfirm] = useState(false);
  const [serviceForm, setServiceForm] = useState({ titleAr: '', descriptionAr: '', categoryCode: '', priceType: 'negotiable', price: '' });
  const [profileForm, setProfileForm] = useState({ name: '', descriptionAr: '', phone: '', email: '', website: '', categoryCode: '' });
  const [branchForm, setBranchForm] = useState({ nameAr: '', addressAr: '', phone: '', cityCode: '', isMain: false });
  const [socialForm, setSocialForm] = useState({ platform: 'facebook', url: '' });

  async function loadWorkspace() {
    const request = ++requestSequence.current;
    const active = () => request === requestSequence.current && currentId.current === id;
    setIsLoading(true); setLoadError('');
    try {
      const [session, profiles, ownerServices, received, storedHours, storedBranches, storedLinks, verificationState, storedMedia] = await Promise.all([
        api.auth.session(), api.businesses.listMine(), api.services.listForOwner(id, 'business'), api.businesses.listReceivedInquiries(id),
        api.businesses.getOpeningHours(id), api.businesses.getBranches(id), api.businesses.getSocialLinks(id), api.businesses.getVerificationStatus(id), api.businesses.getMedia(id)
      ]);
      if (!active()) return;
      const owned = profiles.businesses.find((profile) => profile.id === id);
      if (!owned) { setLoadError('هذا النشاط غير متاح لحسابك.'); router.replace('/business-profiles'); return; }
      setUser(session.user); setBusiness(owned); setServices(ownerServices.services); setInquiries(received.inquiries);
      setBranches(storedBranches.branches); setSocialLinks(storedLinks.links); setVerification(verificationState.status);
      setMedia(storedMedia.assets); setMediaReadFailed(false);
      setHasSavedHours(storedHours.hours.length === 7);
      setHours(storedHours.hours.length === 7 ? storedHours.hours : defaultHours().map((hour) => ({ ...hour, businessProfileId: id })));
      setProfileForm({ name: owned.name, descriptionAr: owned.descriptionAr ?? '', phone: owned.phone ?? '', email: owned.email ?? '', website: owned.website ?? '', categoryCode: owned.categoryCode });
      setBranchForm((current) => ({ ...current, cityCode: current.cityCode || owned.cityCode }));
    } catch (cause) {
      if (!active()) return;
      setLoadError('تعذر تحميل مساحة إدارة النشاط. حاول مجدداً.');
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) {
        router.replace(`/auth/login?next=${encodeURIComponent(`/business-profiles/${encodeURIComponent(id)}/manage`)}`);
        return;
      }
      if (status === 403) { router.replace('/business-profiles'); return; }
    } finally { if (active()) setIsLoading(false); }
  }

  useEffect(() => {
    lifecycle.current += 1; actionInProgress.current = false;
    setBusyAction(''); setError(''); setNotice('');
    setShowProfileForm(false); setShowServiceForm(false); setShowReviewConfirm(false);
    setServiceForm({ titleAr: '', descriptionAr: '', categoryCode: '', priceType: 'negotiable', price: '' });
    setBranchForm({ nameAr: '', addressAr: '', phone: '', cityCode: '', isMain: false });
    setSocialForm({ platform: 'facebook', url: '' });
    void loadWorkspace();
    return () => { lifecycle.current += 1; requestSequence.current += 1; };
  }, [id, router, retryCount]);

  const completion = useMemo(() => {
    if (!business) return 0;
    const checks = [business.name, business.descriptionAr, business.categoryCode, business.cityCode, business.phone || business.email, services.length, hasSavedHours, branches.length, media.length];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [business, services.length, hasSavedHours, branches.length, media.length]);

  function begin(action: string): (() => boolean) | undefined {
    if (actionInProgress.current || isLoading || business?.id !== id) return;
    actionInProgress.current = true;
    const generation = lifecycle.current;
    setBusyAction(action); setError(''); setNotice('');
    return () => generation === lifecycle.current && currentId.current === id;
  }
  function succeeded(message: string, active: () => boolean) {
    if (!active()) return;
    setNotice(message); setBusyAction(''); actionInProgress.current = false;
  }
  function failed(message: string, active: () => boolean) {
    if (!active()) return;
    setError(message); setBusyAction(''); actionInProgress.current = false;
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const active = begin('profile'); if (!active) return;
    try { const result = await api.businesses.update(id, { ...profileForm, name: profileForm.name.trim(), descriptionAr: profileForm.descriptionAr.trim(), phone: profileForm.phone.trim(), email: profileForm.email.trim(), website: profileForm.website.trim() }); if (!active()) return; setBusiness(result.business); setShowProfileForm(false); succeeded('تم حفظ معلومات النشاط.', active); }
    catch { failed('تعذر حفظ معلومات النشاط. راجع الحقول وحاول مجدداً.', active); }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user) return; const active = begin('service'); if (!active) return;
    try { const result = await api.services.create({ titleAr: serviceForm.titleAr.trim(), descriptionAr: serviceForm.descriptionAr.trim() || undefined, categoryCode: serviceForm.categoryCode, price: serviceForm.price ? Number(serviceForm.price) : undefined, priceCurrency: 'SYP', priceType: serviceForm.priceType, ownerId: id, ownerType: 'business', ownerUserId: user.id }); if (!active()) return; setServiceForm({ titleAr: '', descriptionAr: '', categoryCode: '', priceType: 'negotiable', price: '' }); setShowServiceForm(false); setServices((items) => [...items, result.service]); succeeded('تمت إضافة الخدمة.', active); }
    catch { failed('تعذر حفظ الخدمة. راجع البيانات وحاول مجدداً.', active); }
  }

  async function toggleService(service: PublicServiceListing) {
    const active = begin(`service-${service.id}`); if (!active) return;
    try { const result = await api.services.update(service.id, { status: service.status === 'active' ? 'inactive' : 'active' }); if (!active()) return; setServices((items) => items.map((item) => item.id === service.id ? result.service : item)); succeeded('تم تحديث ظهور الخدمة.', active); }
    catch { failed('تعذر تحديث حالة الخدمة.', active); }
  }

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const active = begin('hours'); if (!active) return;
    try { const result = await api.businesses.setOpeningHours(id, hours.map(({ dayOfWeek, openTime, closeTime, isClosed }) => ({ dayOfWeek, openTime, closeTime, isClosed }))); if (!active()) return; setHours(result.hours); setHasSavedHours(result.hours.length === 7); succeeded('تم حفظ ساعات العمل دون تكرار.', active); }
    catch { failed('تعذر حفظ ساعات العمل. يجب أن يكون وقت الفتح قبل الإغلاق.', active); }
  }

  async function addBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const active = begin('branch'); if (!active) return;
    try { const result = await api.businesses.addBranch(id, { ...branchForm, nameAr: branchForm.nameAr.trim(), addressAr: branchForm.addressAr.trim() || undefined, phone: branchForm.phone.trim() || undefined }); if (!active()) return; setBranches((items) => [...items, result.branch]); setBranchForm({ nameAr: '', addressAr: '', phone: '', cityCode: business?.cityCode ?? '', isMain: false }); succeeded('تمت إضافة الفرع.', active); }
    catch { failed('تعذر إضافة الفرع.', active); }
  }

  async function addSocialLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const active = begin('social'); if (!active) return;
    try { const result = await api.businesses.setSocialLink(id, socialForm.platform, socialForm.url.trim()); if (!active()) return; setSocialLinks((items) => [...items, result.link]); setSocialForm((current) => ({ ...current, url: '' })); succeeded('تمت إضافة وسيلة التواصل.', active); }
    catch { failed('تعذر إضافة الرابط. تأكد من كتابة رابط كامل وآمن.', active); }
  }

  async function deleteSocialLink(linkId: string) {
    const active = begin(`social-${linkId}`); if (!active) return;
    try { await api.businesses.deleteSocialLink(id, linkId); if (!active()) return; setSocialLinks((items) => items.filter((item) => item.id !== linkId)); succeeded('تم حذف الرابط.', active); }
    catch { failed('تعذر حذف الرابط.', active); }
  }

  async function refreshMedia(active: () => boolean) {
    const result = await api.businesses.getMedia(id);
    if (!active()) return;
    setMedia(result.assets); setMediaReadFailed(false);
  }

  async function retryMedia() {
    const active = begin('media-read'); if (!active) return;
    try { await refreshMedia(active); succeeded('تم تحديث قائمة الصور.', active); }
    catch { failed('تعذر تحديث قائمة الصور. حاول مجدداً.', active); }
  }

  async function uploadMedia(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionInProgress.current || mediaReadFailed) return;
    const input = event.currentTarget.elements.namedItem('image') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { setError('اختر صورة أولاً.'); return; }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as typeof ALLOWED_IMAGE_TYPES[number])) { setError('الصور المقبولة: JPG أو PNG أو WebP فقط.'); return; }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) { setError('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.'); return; }
    const active = begin('media'); if (!active) return;
    let uploadStarted = false;
    let uploadConfirmed = false;
    try {
      const content = await fileContent(file); if (!active()) return;
      input.value = ''; uploadStarted = true;
      await api.media.uploadBusiness(id, { filename: file.name, mimeType: file.type as typeof ALLOWED_IMAGE_TYPES[number], sizeBytes: file.size, content, assetType: mediaType, sortOrder: mediaType === 'gallery' ? media.filter((item) => item.assetType === 'gallery').length : 0 });
      if (!active()) return;
      uploadConfirmed = true;
      await refreshMedia(active);
      succeeded('تم رفع الصورة وحفظها في ملف النشاط.', active);
    } catch {
      if (!active()) return;
      let recovered = false;
      if (uploadStarted) {
        try { await refreshMedia(active); recovered = true; }
        catch { if (active()) setMediaReadFailed(true); }
      }
      if (uploadConfirmed && recovered) { succeeded('تم رفع الصورة وتحديث قائمتها.', active); return; }
      failed(uploadConfirmed ? 'تم رفع الصورة، لكن تعذر تحديث قائمتها. أعد تحميل الصور قبل رفع صورة أخرى.' : uploadStarted ? 'تعذر تأكيد الرفع. راجع قائمة الصور قبل اختيار الصورة مجدداً.' : 'تعذر قراءة الصورة. اخترها مجدداً.', active);
    }
  }

  async function deleteMedia(assetId: string) {
    const active = begin(`media-${assetId}`); if (!active) return;
    try { await api.media.delete(assetId); if (!active()) return; setMedia((items) => items.filter((item) => item.id !== assetId)); succeeded('تم حذف الصورة من الملف.', active); }
    catch { failed('تعذر حذف الصورة.', active); }
  }

  async function requestVerification() {
    const active = begin('verification'); if (!active) return;
    try { const result = await api.businesses.requestVerification(id); if (!active()) return; setVerification(result.request); succeeded('تم إرسال طلب التوثيق للمراجعة البشرية.', active); }
    catch { failed('تعذر إرسال طلب التوثيق.', active); }
  }

  async function submitForReview() {
    setShowReviewConfirm(false);
    const active = begin('submit'); if (!active) return;
    try { const result = await api.businesses.submitForReview(id); if (!active()) return; setBusiness(result.business); succeeded('تم إرسال النشاط للمراجعة. لن يظهر للعامة قبل الاعتماد.', active); }
    catch { failed('تعذر إرسال النشاط للمراجعة.', active); }
  }

  const hasSelectableCurrentCategory = categories.some((category) =>
    category.code === profileForm.categoryCode && !!category.parentCode
  );

  if (isLoading || (!loadError && business?.id !== id)) return <PageShell className={styles.page} label="جاري تحميل إدارة النشاط"><SkeletonGrid count={6} label="جاري تحميل بيانات النشاط" /></PageShell>;

  if (loadError || !business) return <PageShell className={styles.page} label="إدارة النشاط"><PageHeader title="تعذر تحميل إدارة النشاط" /><StatusMessage tone="danger">{loadError || 'تعذر تحميل النشاط.'}</StatusMessage><ActionButton type="button" onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</ActionButton><ActionLink href="/business-profiles" variant="secondary">أنشطتي</ActionLink></PageShell>;
  const isPublic = business.visibility === 'public' && business.moderationStatus === 'approved' && business.trustStatus === 'approved' && business.status === 'active';

  return <PageShell className={styles.page} label="إدارة النشاط">
    <PageHeader eyebrow="مساحة صاحب النشاط" title={business?.name ?? 'إدارة النشاط'} description="أكمل معلومات نشاطك وخدماته وفروعه، ثم راجعه قبل إرساله للاعتماد." actions={<ActionButton type="button" onClick={() => setShowServiceForm((value) => !value)}><PlatformIcon name={showServiceForm ? 'close' : 'grid'} size={18}/>{showServiceForm ? 'إغلاق' : 'إضافة خدمة'}</ActionButton>} />
    <nav className={styles.secondaryActions} aria-label="إجراءات الملف"><button type="button" onClick={() => setShowProfileForm((value) => !value)}><PlatformIcon name="briefcase" size={18}/> تعديل المعلومات</button>{isPublic && <Link href={`/business-profiles/${id}`}><PlatformIcon name="eye" size={18}/> معاينة الصفحة</Link>}<Link href="/business-profiles"><PlatformIcon name="arrow" size={18}/> أنشطتي</Link></nav>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}{notice && <StatusMessage tone="success">{notice}</StatusMessage>}
    <fieldset className={styles.actionFields} disabled={!!busyAction}>
    {showReviewConfirm && <StatusMessage tone="warning"><div role="group" aria-label="تأكيد إرسال النشاط للمراجعة"><strong>تأكيد إرسال النشاط للمراجعة</strong><p>سيُرسل الملف للمراجعة البشرية. تأكد من اكتمال المعلومات والخدمات قبل المتابعة.</p><div className={styles.actions}><ActionButton type="button" onClick={() => void submitForReview()} disabled={!!busyAction}>تأكيد الإرسال</ActionButton><ActionButton type="button" variant="secondary" onClick={() => setShowReviewConfirm(false)} disabled={!!busyAction}>إلغاء</ActionButton></div></div></StatusMessage>}
    <Surface className={styles.progress}><div><span>اكتمال الملف</span><strong>{completion.toLocaleString('ar-SY')}٪</strong></div><progress max="100" value={completion}>{completion}%</progress><p>أكمل بيانات التواصل والخدمات والساعات والفروع قبل الإرسال للمراجعة.</p></Surface>

    {showProfileForm && <Surface as="form" className={styles.form} onSubmit={updateProfile} aria-busy={busyAction === 'profile'}><h2>المعلومات الأساسية</h2><label>اسم النشاط<input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={160} required/></label><label>نبذة عن النشاط<textarea value={profileForm.descriptionAr} onChange={(event) => setProfileForm((current) => ({ ...current, descriptionAr: event.target.value }))} maxLength={2000} rows={5}/></label><label>التخصص الدقيق<select value={profileForm.categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setProfileForm((current) => ({ ...current, categoryCode: event.target.value }))} required>{profileForm.categoryCode && !hasSelectableCurrentCategory && <option value={profileForm.categoryCode}>التصنيف الحالي المحفوظ (قديم)</option>}<CategorySelectOptions categories={categories} allowRoots={false} /></select>{profileForm.categoryCode && !hasSelectableCurrentCategory && <small>يمكنك إبقاء التصنيف الحالي عند تعديل معلومات أخرى، أو اختيار تخصص نشط جديد.</small>}</label><div className={styles.formGrid}><label>الهاتف<input type="tel" value={profileForm.phone} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))}/></label><label>البريد الإلكتروني<input type="email" dir="ltr" value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}/></label></div><label>الموقع الإلكتروني<input type="url" dir="ltr" value={profileForm.website} onChange={(event) => setProfileForm((current) => ({ ...current, website: event.target.value }))}/></label><ActionButton type="submit" disabled={!!busyAction}>{busyAction === 'profile' ? 'جارٍ الحفظ…' : 'حفظ المعلومات'}</ActionButton></Surface>}

    {showServiceForm && <Surface as="form" className={styles.form} onSubmit={createService} aria-busy={busyAction === 'service'}><h2>خدمة جديدة</h2><label>اسم الخدمة<input value={serviceForm.titleAr} onChange={(event) => setServiceForm((current) => ({ ...current, titleAr: event.target.value }))} minLength={2} maxLength={200} required/></label><label>وصف مختصر<textarea value={serviceForm.descriptionAr} onChange={(event) => setServiceForm((current) => ({ ...current, descriptionAr: event.target.value }))} maxLength={2000} rows={4}/></label><div className={styles.formGrid}><label>التخصص<select value={serviceForm.categoryCode} disabled={categoriesLoading || !!categoriesError} required onChange={(event) => setServiceForm((current) => ({ ...current, categoryCode: event.target.value }))}><option value="">اختر تخصص الخدمة</option><CategorySelectOptions categories={categories} allowRoots={false} /></select></label><label>طريقة السعر<select value={serviceForm.priceType} onChange={(event) => setServiceForm((current) => ({ ...current, priceType: event.target.value }))}><option value="negotiable">قابل للتفاوض</option><option value="fixed">سعر ثابت</option><option value="hourly">بالساعة</option></select></label></div>{serviceForm.priceType !== 'negotiable' && <label>السعر بالليرة السورية<input type="number" value={serviceForm.price} onChange={(event) => setServiceForm((current) => ({ ...current, price: event.target.value }))} min="1" step="1" required/></label>}<ActionButton type="submit" disabled={!!busyAction}>{busyAction === 'service' ? 'جارٍ الحفظ…' : 'حفظ الخدمة'}</ActionButton></Surface>}

    <div className={styles.workspace}>
      <Surface className={styles.section}><div className={styles.sectionHeading}><h2>صور النشاط</h2><span>{media.length}</span></div><p>أضف شعاراً وصورة غلاف وحتى ١٢ صورة للمعرض. الصيغ المقبولة JPG وPNG وWebP، بحد أقصى 5 ميغابايت.</p>{mediaReadFailed && <StatusMessage tone="warning">أعد تحميل الصور قبل متابعة الرفع.<ActionButton type="button" onClick={() => void retryMedia()} disabled={!!busyAction}>إعادة تحميل الصور</ActionButton></StatusMessage>}{media.length > 0 && <div className={styles.mediaGrid}>{media.map((asset) => <figure key={asset.id}><img src={asset.url} alt={asset.assetType === 'logo' ? `شعار ${business?.name}` : asset.assetType === 'cover' ? `غلاف ${business?.name}` : `صورة من ${business?.name}`} loading="lazy"/><figcaption><span>{asset.assetType === 'logo' ? 'الشعار' : asset.assetType === 'cover' ? 'الغلاف' : 'المعرض'}</span><button type="button" onClick={() => void deleteMedia(asset.id)} disabled={!!busyAction}>حذف</button></figcaption></figure>)}</div>}<form className={styles.nestedForm} onSubmit={uploadMedia}><label>نوع الصورة<select value={mediaType} onChange={(event) => setMediaType(event.target.value as typeof mediaType)}><option value="logo">شعار النشاط</option><option value="cover">صورة الغلاف</option><option value="gallery">معرض الصور</option></select></label><label>ملف الصورة<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required/></label><ActionButton type="submit" disabled={!!busyAction || mediaReadFailed}>{busyAction === 'media' ? 'جارٍ الرفع…' : 'رفع الصورة'}</ActionButton></form></Surface>
      <Surface className={styles.section}><div className={styles.sectionHeading}><h2>الخدمات</h2><span>{services.length}</span></div>{services.length === 0 ? <p className={styles.empty}>لم تضف خدمات بعد.</p> : <div className={styles.list}>{services.map((service) => <article key={service.id} className={styles.listItem}><div><h3>{service.titleAr}</h3><p>{service.descriptionAr || 'لا يوجد وصف.'}</p><small>{service.status === 'active' ? isPublic ? 'ظاهرة للعملاء' : 'مفعلة؛ بانتظار نشر النشاط' : 'مخفية عن العملاء'}</small></div><ActionButton type="button" variant="secondary" onClick={() => void toggleService(service)} disabled={!!busyAction}>{service.status === 'active' ? 'إخفاء' : 'نشر'}</ActionButton></article>)}</div>}</Surface>
      <Surface as="form" className={`${styles.section} ${styles.form}`} onSubmit={saveHours} aria-busy={busyAction === 'hours'}><div className={styles.sectionHeading}><h2>ساعات العمل</h2><span>٧</span></div><div className={styles.hours}>{hours.map((hour, index) => <div className={styles.hour} key={hour.dayOfWeek}><strong>{DAYS[hour.dayOfWeek]}</strong><label className={styles.check}><input type="checkbox" checked={hour.isClosed} onChange={(event) => setHours((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, isClosed: event.target.checked } : item))}/> مغلق</label><input aria-label={`وقت فتح ${DAYS[hour.dayOfWeek]}`} type="time" value={hour.openTime} disabled={hour.isClosed} onChange={(event) => setHours((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, openTime: event.target.value } : item))}/><input aria-label={`وقت إغلاق ${DAYS[hour.dayOfWeek]}`} type="time" value={hour.closeTime} disabled={hour.isClosed} onChange={(event) => setHours((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, closeTime: event.target.value } : item))}/></div>)}</div><ActionButton type="submit" disabled={!!busyAction}>{busyAction === 'hours' ? 'جارٍ الحفظ…' : 'حفظ ساعات العمل'}</ActionButton></Surface>
      <Surface className={styles.section}><div className={styles.sectionHeading}><h2>الفروع</h2><span>{branches.length}</span></div>{branches.length > 0 && <div className={styles.list}>{branches.map((branch) => <article className={styles.compactItem} key={branch.id}><strong>{branch.nameAr}</strong><span>{cities.find((city) => city.code === branch.cityCode)?.nameAr ?? branch.cityCode}{branch.isMain ? ' · الفرع الرئيسي' : ''}</span>{branch.addressAr && <small>{branch.addressAr}</small>}</article>)}</div>}<form className={styles.nestedForm} onSubmit={addBranch}><label>اسم الفرع<input value={branchForm.nameAr} onChange={(event) => setBranchForm((current) => ({ ...current, nameAr: event.target.value }))} required/></label><label>المدينة<select value={branchForm.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setBranchForm((current) => ({ ...current, cityCode: event.target.value }))} required><option value="">اختر مدينة</option>{cities.map((city) => <option value={city.code} key={city.code}>{city.nameAr}</option>)}</select></label><label>العنوان<input value={branchForm.addressAr} onChange={(event) => setBranchForm((current) => ({ ...current, addressAr: event.target.value }))}/></label><label>الهاتف<input type="tel" value={branchForm.phone} onChange={(event) => setBranchForm((current) => ({ ...current, phone: event.target.value }))}/></label><label className={styles.check}><input type="checkbox" checked={branchForm.isMain} onChange={(event) => setBranchForm((current) => ({ ...current, isMain: event.target.checked }))}/> فرع رئيسي</label><ActionButton type="submit" variant="secondary" disabled={!!busyAction}>إضافة الفرع</ActionButton></form></Surface>
      <Surface className={styles.section}><div className={styles.sectionHeading}><h2>روابط التواصل</h2><span>{socialLinks.length}</span></div>{socialLinks.length > 0 && <div className={styles.list}>{socialLinks.map((link) => <article className={styles.linkItem} key={link.id}><a href={link.url} target="_blank" rel="noopener noreferrer">{PLATFORMS.find((item) => item.value === link.platform)?.label ?? link.platform}</a><button type="button" onClick={() => void deleteSocialLink(link.id)} disabled={!!busyAction}>حذف</button></article>)}</div>}<form className={styles.nestedForm} onSubmit={addSocialLink}><label>المنصة<select value={socialForm.platform} onChange={(event) => setSocialForm((current) => ({ ...current, platform: event.target.value }))}>{PLATFORMS.map((platform) => <option key={platform.value} value={platform.value}>{platform.label}</option>)}</select></label><label>الرابط<input type="url" dir="ltr" value={socialForm.url} onChange={(event) => setSocialForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://" required/></label><ActionButton type="submit" variant="secondary" disabled={!!busyAction}>إضافة الرابط</ActionButton></form></Surface>
      <Surface className={styles.section}><div className={styles.sectionHeading}><h2>الاستفسارات الواردة</h2><span>{inquiries.length}</span></div>{inquiries.length === 0 ? <p className={styles.empty}>لا توجد استفسارات جديدة.</p> : <div className={styles.list}>{inquiries.map((inquiry) => <article key={inquiry.id} className={styles.inquiry}><div><h3>{inquiry.name}</h3><time dateTime={inquiry.createdAt}>{new Date(inquiry.createdAt).toLocaleDateString('ar-SY')}</time></div><p>{inquiry.message}</p><a href={`mailto:${inquiry.contactEmail}`} dir="ltr">{inquiry.contactEmail}</a></article>)}</div>}</Surface>
      <Surface className={styles.section}><h2>الثقة والمراجعة</h2><p>قرار النشر والتوثيق نهائيّاً بيد فريق المراجعة البشري. لا يظهر النشاط للعامة قبل الاعتماد.</p><dl className={styles.statusList}><div><dt>المراجعة</dt><dd>{business?.moderationStatus === 'approved' ? 'معتمد' : business?.moderationStatus === 'rejected' ? 'مطلوب تعديل' : 'قيد المراجعة'}</dd></div><div><dt>التوثيق</dt><dd>{verification?.status === 'approved' ? 'موثّق' : verification?.status === 'rejected' ? 'مرفوض' : verification?.status === 'pending' ? 'قيد المراجعة' : 'لم يُطلب'}</dd></div></dl><div className={styles.actions}><ActionButton type="button" variant="secondary" onClick={() => void requestVerification()} disabled={!!busyAction || verification?.status === 'pending' || verification?.status === 'approved'}>طلب التوثيق</ActionButton><ActionButton type="button" onClick={() => setShowReviewConfirm(true)} disabled={!!busyAction || showReviewConfirm}>{busyAction === 'submit' ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}</ActionButton>{isPublic && <ActionLink href={`/business-profiles/${id}`} variant="quiet">معاينة الصفحة العامة</ActionLink>}</div></Surface>
    </div>
    </fieldset>
  </PageShell>;
}