'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../../lib/api-client';
import { CLASSIFIEDS_MAX_IMAGES, classifiedsApi, type AdImage, type AdKind, type AdPriceMode, type OwnerAdListing } from '../../../lib/classifieds-client';
import { CLASSIFIEDS_ENABLED, clearRequestId, requestId } from '../../../lib/classifieds';
import { useCategories } from '../../../lib/use-categories';
import { useSyrianCities } from '../../../lib/use-syrian-cities';
import { CategorySelectOptions } from '../../components/category-select-options';
import { ActionButton, ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../classifieds.module.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('read_failed'));
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(file);
});

const CREATE_KEY = 'khedmah.classifieds.create';

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

const INITIAL_FORM: FormState = {
  businessProfileId: '', kind: 'sale', titleAr: '', descriptionAr: '', categoryCode: '', priceMode: 'none', priceMinor: '', currency: 'SYP',
  cityCode: '', areaText: '', contactMode: 'profile', contactValue: ''
};

export default function NewClassifiedPage() {
  const router = useRouter();
  const { categories, isLoading: categoryLoading, error: categoryError } = useCategories();
  const { cities, isLoading: cityLoading, error: cityError } = useSyrianCities();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: 3 } | null>(null);
  const [loading, setLoading] = useState(CLASSIFIEDS_ENABLED);
  const [saving, setSaving] = useState(false);
  const [savingIntent, setSavingIntent] = useState<'draft' | 'review' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createConflict, setCreateConflict] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [draft, setDraft] = useState<OwnerAdListing | null>(null);
  const [images, setImages] = useState<AdImage[]>([]);
  const lifecycle = useRef(0);
  const pending = useRef(false);
  const operationRequestKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!CLASSIFIEDS_ENABLED) return;
    const generation = ++lifecycle.current;
    setLoading(true); setError('');
    void Promise.all([api.businesses.listMine(), classifiedsApi.quota()])
      .then(([businessData, quotaData]) => {
        if (generation !== lifecycle.current) return;
        setBusinesses(businessData.businesses);
        setQuota(quotaData);
      })
      .catch((cause) => {
        if (generation !== lifecycle.current) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) router.replace('/auth/login?next=%2Fclassifieds%2Fnew');
        else setError('تعذر تجهيز نموذج الإعلان. تحقق من الاتصال ثم أعد المحاولة.');
      })
      .finally(() => { if (generation === lifecycle.current) setLoading(false); });
    return () => { lifecycle.current += 1; };
  }, [router]);

  function payload() {
    const value: Record<string, unknown> = {
      businessProfileId: form.businessProfileId || null,
      kind: form.kind,
      titleAr: form.titleAr.trim(),
      descriptionAr: form.descriptionAr.trim(),
      categoryCode: form.categoryCode,
      priceMode: form.priceMode,
      priceMinor: form.priceMode === 'fixed' ? Number(form.priceMinor) : null,
      currency: form.priceMode === 'fixed' ? form.currency : null,
      cityCode: form.cityCode,
      areaText: form.areaText.trim(),
      contactMode: form.contactMode,
      contactValue: form.contactMode === 'profile' ? '' : form.contactValue.trim()
    };
    return value;
  }

  function clientValidation(): string {
    if (form.titleAr.trim().length < 2) return 'أدخل عنوانًا واضحًا للإعلان.';
    if (!form.categoryCode) return 'اختر تصنيفًا دقيقًا.';
    if (form.priceMode === 'fixed' && (!Number.isSafeInteger(Number(form.priceMinor)) || Number(form.priceMinor) <= 0)) return 'أدخل السعر كعدد صحيح موجب.';
    if (form.contactMode === 'profile' && !form.businessProfileId) return 'اربط الإعلان بنشاط أو اختر هاتفًا أو واتساب للتواصل.';
    if (form.contactMode !== 'profile' && form.contactValue.trim().length < 6) return 'أدخل وسيلة تواصل صالحة.';
    return '';
  }

  function operationRequestId(storageKey: string): string {
    operationRequestKeys.current.add(storageKey);
    return requestId(storageKey);
  }

  function acknowledgeRequest(storageKey: string): void {
    clearRequestId(storageKey);
    operationRequestKeys.current.delete(storageKey);
  }

  function startAnotherAd(): void {
    if (pending.current) return;
    clearRequestId(CREATE_KEY);
    for (const key of operationRequestKeys.current) clearRequestId(key);
    operationRequestKeys.current.clear();
    setDraft(null);
    setImages([]);
    setForm(INITIAL_FORM);
    setCreateConflict(false);
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent: 'draft' | 'review' = submitter?.value === 'draft' ? 'draft' : 'review';
    if (intent === 'review' && quota && quota.used === quota.limit) {
      setError('تم استهلاك الحصة الحالية. يمكنك حفظ الإعلان كمسودة دون إرساله للمراجعة.');
      return;
    }
    const validation = clientValidation();
    if (validation) { setError(validation); return; }
    const input = event.currentTarget.elements.namedItem('adImages') as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    if (images.length + selected.length > CLASSIFIEDS_MAX_IMAGES) {
      setError(`يمكن حفظ ${CLASSIFIEDS_MAX_IMAGES} صور كحد أقصى للإعلان. لديك ${images.length} صور محفوظة.`);
      return;
    }
    if (selected.some((file) => !allowedTypes.includes(file.type as typeof allowedTypes[number]) || file.size <= 0 || file.size > 5 * 1024 * 1024)) {
      setError('الصور المقبولة JPG أو PNG أو WebP، وحدها 5 ميغابايت للصورة.'); return;
    }
    input.value = '';
    pending.current = true;
    const generation = lifecycle.current;
    setSaving(true); setSavingIntent(intent); setError(''); setNotice(''); setCreateConflict(false);
    let current = draft;
    try {
      if (!current) {
        const created = await classifiedsApi.create({ ...payload(), clientRequestId: requestId(CREATE_KEY) });
        if (generation !== lifecycle.current) return;
        current = created.ad;
        clearRequestId(CREATE_KEY);
      } else {
        const updateKey = `khedmah.classifieds.update.${current.id}.${current.contentRevision}`;
        const updated = await classifiedsApi.update(current.id, {
          ...payload(), clientRequestId: operationRequestId(updateKey), expectedContentRevision: current.contentRevision
        });
        if (generation !== lifecycle.current) return;
        current = updated.ad;
        acknowledgeRequest(updateKey);
      }
      setDraft(current);
      const stored = await classifiedsApi.listImages(current.id).catch(() => ({ images: [] as AdImage[] }));
      if (generation !== lifecycle.current) return;
      setImages(stored.images);

      let contentRevision = current.contentRevision;
      for (const [index, file] of selected.entries()) {
        const content = await readFile(file);
        if (generation !== lifecycle.current) return;
        const storageKey = `khedmah.classifieds.media.${current.id}.${file.name}.${file.size}.${file.lastModified}.${index}`;
        const uploaded = await classifiedsApi.uploadImage(current.id, {
          clientRequestId: operationRequestId(storageKey), expectedContentRevision: contentRevision, filename: file.name,
          mimeType: file.type as typeof allowedTypes[number], sizeBytes: file.size, content, sortOrder: index
        });
        contentRevision = uploaded.contentRevision;
        if (generation !== lifecycle.current) return;
        acknowledgeRequest(storageKey);
        current = { ...current, revision: uploaded.adRevision, contentRevision: uploaded.contentRevision };
        setDraft(current);
        setImages((value) => value.some((item) => item.id === uploaded.image.id) ? value : [...value, uploaded.image]);
      }

      if (intent === 'draft') {
        setDraft(current);
        setNotice('تم حفظ المسودة. لم تُرسل للمراجعة ولم تستهلك من حصة الإعلانات.');
        return;
      }

      const submitKey = `khedmah.classifieds.submit.${current.id}.${current.contentRevision}`;
      const submitted = await classifiedsApi.submit(current.id, {
        clientRequestId: operationRequestId(submitKey), expectedContentRevision: current.contentRevision
      });
      if (generation !== lifecycle.current) return;
      acknowledgeRequest(submitKey);
      setDraft(submitted.ad);
      router.push('/classifieds/manage');
    } catch (cause) {
      if (generation !== lifecycle.current) return;
      const issue = cause instanceof Error ? cause as Error & { statusCode?: number; code?: string } : undefined;
      if (issue?.statusCode === 429 || issue?.code === 'AD_FREE_QUOTA_EXHAUSTED') {
        setError('تم استهلاك الحصة الحالية: ثلاثة إعلانات مجانية للحساب. المسودة محفوظة ولن تُكرر عند إعادة المحاولة.');
      } else if (issue?.code === 'AD_IMAGE_LIMIT_REACHED') {
        setError(`يمكن حفظ ${CLASSIFIEDS_MAX_IMAGES} صور كحد أقصى للإعلان.`);
      } else if (issue?.statusCode === 409) {
        if (!current) setCreateConflict(true);
        setError(current
          ? 'تغيرت المسودة أو توجد محاولة محفوظة بنفس المفتاح. افتح «إعلاناتي» لمراجعة النسخة الحالية قبل المتابعة.'
          : 'هذه المحاولة مرتبطة بمسودة سابقة. راجع «إعلاناتي» أو ابدأ محاولة جديدة بمفتاح مستقل.');
      } else {
        setError(issue?.message || 'لم تكتمل العملية. أعد اختيار الصور غير المحفوظة فقط؛ لن ننشئ مسودة أخرى لنفس المحاولة.');
      }
      if (current) {
        try {
          const [latest, stored] = await Promise.all([classifiedsApi.getMine(current.id), classifiedsApi.listImages(current.id)]);
          if (generation === lifecycle.current) { setDraft(latest.ad); setImages(stored.images); }
        } catch { /* The primary error remains the useful message. */ }
      }
    } finally {
      if (generation === lifecycle.current) { pending.current = false; setSaving(false); setSavingIntent(null); }
    }
  }

  if (!CLASSIFIEDS_ENABLED) return <PageShell className={styles.page} label="إضافة إعلان"><StatusMessage tone="warning">إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة.</StatusMessage><ActionLink href="/classifieds" variant="secondary">العودة للإعلانات</ActionLink></PageShell>;
  if (loading) return <PageShell className={styles.page} label="إضافة إعلان"><SkeletonGrid count={3}/></PageShell>;

  return <PageShell className={styles.page} label="إضافة إعلان"><div className={styles.formShell}>
    <PageHeader eyebrow="إعلانات خدمة" title="إضافة إعلان" description="أنشئ إعلانًا مستقلاً عن متجر خدمة. إنشاء المسودة لا يستهلك الحصة؛ أول إرسال للمراجعة يحجز أحد الإعلانات المجانية الثلاثة." actions={<ActionLink href="/classifieds/manage" variant="secondary">إعلاناتي</ActionLink>}/>
    {quota && <Surface className={styles.quota}><strong>الحصة المجانية</strong><span>{quota.used} من {quota.limit} مستخدمة</span></Surface>}
    {quota && quota.used === quota.limit && <StatusMessage tone="warning">يمكنك حفظ مسودة، لكن لن يمكن إرسال إعلان جديد للمراجعة بعد استهلاك الحصة الحالية.</StatusMessage>}
    {error && <StatusMessage tone="danger">{error}{createConflict && <div className={styles.actions}><ActionButton type="button" variant="secondary" disabled={saving} onClick={startAnotherAd}>بدء محاولة إعلان جديدة</ActionButton><ActionLink href="/classifieds/manage" variant="secondary">مراجعة إعلاناتي</ActionLink></div>}</StatusMessage>}
    {notice && <StatusMessage tone="success">{notice}</StatusMessage>}
    {draft?.status === 'draft' && <Surface className={styles.quota}><span>هذه المسودة محفوظة؛ يمكنك إرسالها للمراجعة أو بدء إعلان آخر.</span><ActionButton type="button" variant="secondary" disabled={saving} onClick={startAnotherAd}>بدء إعلان جديد</ActionButton></Surface>}
    {categoryError && <StatusMessage tone="danger">{categoryError}</StatusMessage>}
    {cityError && <StatusMessage tone="danger">{cityError}</StatusMessage>}
    <Surface as="form" className={styles.form} onSubmit={submit} aria-busy={saving}>
      <fieldset className={styles.formFields} disabled={saving}>
        <label className={styles.field}>ربط بنشاط تملكه — اختياري<select name="businessProfileId" value={form.businessProfileId} onChange={(event) => setForm((value) => ({ ...value, businessProfileId: event.target.value }))}><option value="">بدون ربط بنشاط</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>
        <div className={styles.formGrid}>
          <label className={styles.field}>نوع الإعلان<select name="kind" value={form.kind} onChange={(event) => setForm((value) => ({ ...value, kind: event.target.value as AdKind }))}><option value="sale">للبيع</option><option value="service">خدمة</option><option value="wanted">مطلوب</option><option value="rent">للإيجار</option></select></label>
          <label className={styles.field}>التصنيف<select name="categoryCode" value={form.categoryCode} disabled={categoryLoading || !!categoryError} required onChange={(event) => setForm((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">اختر تصنيفًا دقيقًا</option><CategorySelectOptions categories={categories} allowRoots={false}/></select></label>
        </div>
        <label className={styles.field}>عنوان الإعلان<input name="titleAr" minLength={2} maxLength={160} required value={form.titleAr} onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))}/></label>
        <label className={styles.field}>الوصف<textarea name="descriptionAr" rows={5} maxLength={4000} value={form.descriptionAr} onChange={(event) => setForm((value) => ({ ...value, descriptionAr: event.target.value }))}/></label>
        <div className={styles.formGrid}>
          <label className={styles.field}>طريقة السعر<select name="priceMode" value={form.priceMode} onChange={(event) => setForm((value) => ({ ...value, priceMode: event.target.value as AdPriceMode }))}><option value="none">بدون سعر محدد</option><option value="fixed">سعر ثابت</option><option value="negotiable">قابل للتفاوض</option><option value="contact">تواصل للسعر</option></select></label>
          {form.priceMode === 'fixed' && <label className={styles.field}>السعر<input name="priceMinor" type="number" inputMode="numeric" dir="ltr" min="1" step="1" value={form.priceMinor} required onChange={(event) => setForm((value) => ({ ...value, priceMinor: event.target.value }))}/></label>}
        </div>
        {form.priceMode === 'fixed' && <label className={styles.field}>العملة<select name="currency" value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value as 'SYP' | 'USD' }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label>}
        <div className={styles.formGrid}>
          <label className={styles.field}>المدينة — اختياري<select name="cityCode" value={form.cityCode} disabled={cityLoading || !!cityError} onChange={(event) => setForm((value) => ({ ...value, cityCode: event.target.value }))}><option value="">بدون مدينة محددة</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
          <label className={styles.field}>المنطقة — اختياري<input name="areaText" maxLength={160} value={form.areaText} onChange={(event) => setForm((value) => ({ ...value, areaText: event.target.value }))}/></label>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>طريقة التواصل<select name="contactMode" value={form.contactMode} onChange={(event) => setForm((value) => ({ ...value, contactMode: event.target.value as FormState['contactMode'] }))}><option value="profile">الملف المرتبط</option><option value="phone">هاتف</option><option value="whatsapp">واتساب</option></select></label>
          {form.contactMode !== 'profile' && <label className={styles.field}>بيانات التواصل<input name="contactValue" type="tel" inputMode="tel" dir="ltr" maxLength={80} required value={form.contactValue} onChange={(event) => setForm((value) => ({ ...value, contactValue: event.target.value }))}/></label>}
        </div>
        <label className={styles.field}>صور الإعلان — اختيارية، حتى {CLASSIFIEDS_MAX_IMAGES} صور<input name="adImages" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={images.length >= CLASSIFIEDS_MAX_IMAGES}/></label>
        <p className={styles.notice}>كل صورة حتى 5 ميغابايت. الصور المحفوظة: {images.length} من {CLASSIFIEDS_MAX_IMAGES}. حفظ المسودة لا يستهلك حصة، ولا تنشئ هذه العملية طلب شراء أو دفعة.</p>
        <div className={styles.actions}>
          <ActionButton type="submit" name="intent" value="draft" variant="secondary" disabled={saving || categoryLoading || !!categoryError}>{savingIntent === 'draft' ? 'جارٍ حفظ المسودة…' : 'حفظ كمسودة'}</ActionButton>
          <ActionButton type="submit" name="intent" value="review" disabled={saving || categoryLoading || !!categoryError || Boolean(quota && quota.used === quota.limit)}>{savingIntent === 'review' ? 'جارٍ الحفظ والإرسال…' : 'حفظ وإرسال للمراجعة'}</ActionButton>
        </div>
      </fieldset>
    </Surface>
  </div></PageShell>;
}
