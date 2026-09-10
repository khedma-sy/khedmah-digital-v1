'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type AdImage, type AdKind, type AdPriceMode, type OwnerAdListing, type PublicBusinessProfile } from '../../../../../lib/api-client';
import { AD_STATUS_LABELS, CLASSIFIEDS_ENABLED } from '../../../../../lib/classifieds';
import { useCategories } from '../../../../../lib/use-categories';
import { useSyrianCities } from '../../../../../lib/use-syrian-cities';
import { CategorySelectOptions } from '../../../../components/category-select-options';
import { ActionButton, ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../../../components/ui-primitives';
import styles from '../../../classifieds.module.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('read_failed'));
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(file);
});

type FormState = {
  businessProfileId: string;
  kind: AdKind;
  titleAr: string;
  descriptionAr: string;
  categoryCode: string;
  priceMode: AdPriceMode;
  priceMinor: string;
  currency: 'SYP' | 'USD';
  cityCode: string;
  areaText: string;
  contactMode: 'profile' | 'phone' | 'whatsapp';
  contactValue: string;
};

function fromAd(ad: OwnerAdListing): FormState {
  return {
    businessProfileId: ad.businessProfileId ?? '', kind: ad.kind, titleAr: ad.titleAr, descriptionAr: ad.descriptionAr ?? '', categoryCode: ad.categoryCode,
    priceMode: ad.priceMode, priceMinor: ad.priceMinor === undefined ? '' : String(ad.priceMinor), currency: ad.currency ?? 'SYP', cityCode: ad.cityCode ?? '', areaText: ad.areaText ?? '',
    contactMode: ad.contactMode, contactValue: ad.contactValue ?? ''
  };
}

export default function EditClassifiedPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { categories, isLoading: categoryLoading, error: categoryError } = useCategories();
  const { cities, isLoading: cityLoading, error: cityError } = useSyrianCities();
  const [ad, setAd] = useState<OwnerAdListing | null>(null);
  const [images, setImages] = useState<AdImage[]>([]);
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(CLASSIFIEDS_ENABLED);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const operation = useRef(false);

  useEffect(() => {
    if (!CLASSIFIEDS_ENABLED) return;
    const token = ++generation.current;
    setLoading(true); setError('');
    void Promise.all([api.classifieds.getMine(id), api.classifieds.listImages(id), api.businesses.listMine()])
      .then(([adData, imageData, businessData]) => {
        if (token !== generation.current) return;
        setAd(adData.ad); setForm(fromAd(adData.ad)); setImages(imageData.images); setBusinesses(businessData.businesses);
      })
      .catch((cause) => {
        if (token !== generation.current) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) router.replace(`/auth/login?next=${encodeURIComponent(`/classifieds/manage/${id}/edit`)}`);
        else setError(cause instanceof Error ? cause.message : 'تعذر تحميل الإعلان.');
      })
      .finally(() => { if (token === generation.current) setLoading(false); });
    return () => { generation.current += 1; };
  }, [id, router]);

  function payload(value: FormState) {
    const result: Record<string, unknown> = {
      businessProfileId: value.businessProfileId || null,
      kind: value.kind,
      titleAr: value.titleAr.trim(),
      descriptionAr: value.descriptionAr.trim(),
      categoryCode: value.categoryCode,
      priceMode: value.priceMode,
      priceMinor: value.priceMode === 'fixed' ? Number(value.priceMinor) : null,
      currency: value.priceMode === 'fixed' ? value.currency : null,
      cityCode: value.cityCode,
      areaText: value.areaText.trim(),
      contactMode: value.contactMode,
      contactValue: value.contactMode === 'profile' ? '' : value.contactValue.trim()
    };
    return result;
  }

  function validation(value: FormState): string {
    if (value.titleAr.trim().length < 2) return 'أدخل عنوانًا واضحًا للإعلان.';
    if (!value.categoryCode) return 'اختر تصنيفًا دقيقًا.';
    if (value.priceMode === 'fixed' && (!Number.isSafeInteger(Number(value.priceMinor)) || Number(value.priceMinor) <= 0)) return 'أدخل السعر كعدد صحيح موجب.';
    if (value.contactMode === 'profile' && !value.businessProfileId) return 'اربط الإعلان بنشاط أو اختر هاتفًا أو واتساب للتواصل.';
    if (value.contactMode !== 'profile' && value.contactValue.trim().length < 6) return 'أدخل وسيلة تواصل صالحة.';
    return '';
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ad || !form || operation.current || ad.status === 'active' || ad.status === 'pending_review') return;
    const issue = validation(form);
    if (issue) { setError(issue); return; }
    const input = event.currentTarget.elements.namedItem('adImages') as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    if (selected.some((file) => !allowedTypes.includes(file.type as typeof allowedTypes[number]) || file.size <= 0 || file.size > 5 * 1024 * 1024)) {
      setError('الصور المقبولة JPG أو PNG أو WebP وبحد 5 ميغابايت للصورة.'); return;
    }
    operation.current = true; setSaving(true); setError(''); setNotice('');
    try {
      let current = (await api.classifieds.update(ad.id, {
        ...payload(form), clientRequestId: crypto.randomUUID(), expectedContentRevision: ad.contentRevision
      })).ad;
      setAd(current); setForm(fromAd(current));
      let contentRevision = current.contentRevision;
      for (const [index, file] of selected.entries()) {
        const content = await readFile(file);
        const uploaded = await api.classifieds.uploadImage(current.id, {
          clientRequestId: crypto.randomUUID(), expectedContentRevision: contentRevision, filename: file.name,
          mimeType: file.type as typeof allowedTypes[number], sizeBytes: file.size, content, sortOrder: images.length + index
        });
        contentRevision = uploaded.contentRevision;
        setImages((value) => [...value, uploaded.image]);
      }
      if (selected.length) current = (await api.classifieds.getMine(ad.id)).ad;
      setAd(current); setForm(fromAd(current)); input.value = '';
      setNotice('تم حفظ التعديلات.');
    } catch (cause) {
      const issue = cause instanceof Error ? cause as Error & { statusCode?: number } : undefined;
      setError(issue?.statusCode === 409 ? 'تغير الإعلان في جلسة أخرى. أعد فتح الصفحة لمراجعة النسخة الحالية.' : issue?.message || 'تعذر حفظ التعديلات.');
    } finally { operation.current = false; setSaving(false); }
  }

  async function removeImage(image: AdImage) {
    if (!ad || operation.current || ad.status === 'active' || ad.status === 'pending_review') return;
    operation.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.classifieds.deleteImage(ad.id, image.id, { clientRequestId: crypto.randomUUID(), expectedContentRevision: ad.contentRevision });
      setImages((value) => value.filter((item) => item.id !== image.id));
      setAd({ ...ad, revision: result.adRevision, contentRevision: result.contentRevision, imageUrls: ad.imageUrls.filter((url) => url !== image.publicUrl) });
      setNotice('تم حذف الصورة من الإعلان.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حذف الصورة.'); }
    finally { operation.current = false; setSaving(false); }
  }

  async function deactivate() {
    if (!ad || ad.status !== 'active' || operation.current) return;
    operation.current = true; setSaving(true); setError('');
    try {
      const result = await api.classifieds.deactivate(ad.id, { clientRequestId: crypto.randomUUID(), expectedRevision: ad.revision });
      setAd(result.ad); setForm(fromAd(result.ad)); setNotice('تم إيقاف الإعلان. يمكنك الآن تعديل المحتوى والصور.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إيقاف الإعلان.'); }
    finally { operation.current = false; setSaving(false); }
  }

  async function submitForReview() {
    if (!ad || operation.current || ad.status === 'active' || ad.status === 'pending_review') return;
    operation.current = true; setSaving(true); setError('');
    try {
      const result = await api.classifieds.submit(ad.id, crypto.randomUUID());
      setAd(result.ad); setForm(fromAd(result.ad)); setNotice('تم إرسال الإعلان للمراجعة.');
    } catch (cause) {
      const issue = cause instanceof Error ? cause as Error & { statusCode?: number; code?: string } : undefined;
      setError(issue?.statusCode === 429 || issue?.code === 'AD_FREE_QUOTA_EXHAUSTED' ? 'تم استهلاك الحصة الحالية: ثلاثة إعلانات مجانية للحساب.' : issue?.message || 'تعذر إرسال الإعلان للمراجعة.');
    } finally { operation.current = false; setSaving(false); }
  }

  if (!CLASSIFIEDS_ENABLED) return <PageShell className={styles.page} label="إدارة الإعلان"><StatusMessage tone="warning">إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة.</StatusMessage><ActionLink href="/classifieds" variant="secondary">العودة للإعلانات</ActionLink></PageShell>;
  if (loading) return <PageShell className={styles.page} label="إدارة الإعلان"><SkeletonGrid count={3}/></PageShell>;
  if (error && !ad) return <PageShell className={styles.page} label="إدارة الإعلان"><StatusMessage tone="danger">{error}</StatusMessage><ActionLink href="/classifieds/manage" variant="secondary">العودة إلى إعلاناتي</ActionLink></PageShell>;
  if (!ad || !form) return <PageShell className={styles.page} label="إدارة الإعلان"><StatusMessage tone="danger">الإعلان غير متاح.</StatusMessage></PageShell>;

  const locked = ad.status === 'active' || ad.status === 'pending_review';
  return <PageShell className={styles.page} label="إدارة الإعلان"><div className={styles.formShell}>
    <PageHeader eyebrow="إعلاناتي" title={ad.titleAr} description={`الحالة: ${AD_STATUS_LABELS[ad.status]}`} backHref="/classifieds/manage" actions={ad.status === 'active' ? <ActionLink href={`/classifieds/${encodeURIComponent(ad.id)}`}>عرض الصفحة العامة</ActionLink> : undefined}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {notice && <StatusMessage>{notice}</StatusMessage>}
    {ad.rejectionReason && <StatusMessage tone="danger">سبب الرفض: {ad.rejectionReason}</StatusMessage>}
    {ad.status === 'pending_review' && <StatusMessage tone="warning">الإعلان وصوره مقفلة أثناء المراجعة. انتظر قرار المراجعة قبل التعديل.</StatusMessage>}
    {ad.status === 'active' && <Surface className={styles.quota}><span>الإعلان منشور. أوقفه أولًا قبل تعديل المحتوى أو الصور.</span><ActionButton type="button" variant="secondary" disabled={saving} onClick={() => void deactivate()}>إيقاف للتعديل</ActionButton></Surface>}
    <Surface as="form" className={styles.form} onSubmit={save} aria-busy={saving}>
      <fieldset className={styles.formFields} disabled={saving || locked}>
        <label className={styles.field}>ربط بنشاط — اختياري<select value={form.businessProfileId} onChange={(event) => setForm((value) => value && ({ ...value, businessProfileId: event.target.value }))}><option value="">بدون ربط بنشاط</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>
        <div className={styles.formGrid}><label className={styles.field}>النوع<select value={form.kind} onChange={(event) => setForm((value) => value && ({ ...value, kind: event.target.value as AdKind }))}><option value="sale">للبيع</option><option value="service">خدمة</option><option value="wanted">مطلوب</option><option value="rent">للإيجار</option></select></label><label className={styles.field}>التصنيف<select value={form.categoryCode} disabled={categoryLoading || !!categoryError} onChange={(event) => setForm((value) => value && ({ ...value, categoryCode: event.target.value }))}><option value="">اختر تصنيفًا</option><CategorySelectOptions categories={categories} allowRoots={false}/></select></label></div>
        <label className={styles.field}>العنوان<input minLength={2} maxLength={160} value={form.titleAr} onChange={(event) => setForm((value) => value && ({ ...value, titleAr: event.target.value }))}/></label>
        <label className={styles.field}>الوصف<textarea rows={5} maxLength={4000} value={form.descriptionAr} onChange={(event) => setForm((value) => value && ({ ...value, descriptionAr: event.target.value }))}/></label>
        <div className={styles.formGrid}><label className={styles.field}>طريقة السعر<select value={form.priceMode} onChange={(event) => setForm((value) => value && ({ ...value, priceMode: event.target.value as AdPriceMode }))}><option value="none">بدون سعر</option><option value="fixed">سعر ثابت</option><option value="negotiable">قابل للتفاوض</option><option value="contact">تواصل للسعر</option></select></label>{form.priceMode === 'fixed' && <label className={styles.field}>السعر<input type="number" min="1" step="1" value={form.priceMinor} onChange={(event) => setForm((value) => value && ({ ...value, priceMinor: event.target.value }))}/></label>}</div>
        {form.priceMode === 'fixed' && <label className={styles.field}>العملة<select value={form.currency} onChange={(event) => setForm((value) => value && ({ ...value, currency: event.target.value as 'SYP' | 'USD' }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label>}
        <div className={styles.formGrid}><label className={styles.field}>المدينة<select value={form.cityCode} disabled={cityLoading || !!cityError} onChange={(event) => setForm((value) => value && ({ ...value, cityCode: event.target.value }))}><option value="">بدون مدينة</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label><label className={styles.field}>المنطقة<input maxLength={160} value={form.areaText} onChange={(event) => setForm((value) => value && ({ ...value, areaText: event.target.value }))}/></label></div>
        <div className={styles.formGrid}><label className={styles.field}>طريقة التواصل<select value={form.contactMode} onChange={(event) => setForm((value) => value && ({ ...value, contactMode: event.target.value as FormState['contactMode'] }))}><option value="profile">الملف المرتبط</option><option value="phone">هاتف</option><option value="whatsapp">واتساب</option></select></label>{form.contactMode !== 'profile' && <label className={styles.field}>بيانات التواصل<input maxLength={80} value={form.contactValue} onChange={(event) => setForm((value) => value && ({ ...value, contactValue: event.target.value }))}/></label>}</div>
        <label className={styles.field}>إضافة صور<input name="adImages" type="file" accept="image/jpeg,image/png,image/webp" multiple/></label>
        <ActionButton type="submit" disabled={saving || locked}>حفظ التعديلات والصور</ActionButton>
      </fieldset>
    </Surface>
    <Surface className={styles.form}>
      <h2>صور الإعلان</h2>
      {images.length ? <div className={styles.editorImages}>{images.map((image) => <figure key={image.id}><img src={`/api/v1/classifieds/${encodeURIComponent(ad.id)}/media/${encodeURIComponent(image.id)}`} alt={image.filename}/><figcaption><span>{image.filename}</span><button type="button" disabled={saving || locked} onClick={() => void removeImage(image)}>حذف الصورة</button></figcaption></figure>)}</div> : <p className={styles.notice}>لا توجد صور محفوظة لهذا الإعلان.</p>}
    </Surface>
    {!locked && <div className={styles.actions}><ActionButton type="button" disabled={saving} onClick={() => void submitForReview()}>إرسال للمراجعة</ActionButton><ActionLink href="/classifieds/manage" variant="secondary">العودة إلى إعلاناتي</ActionLink></div>}
  </div></PageShell>;
}
