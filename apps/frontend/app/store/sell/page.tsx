'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type ProductListing, type UploadedMediaAsset, type PublicBusinessProfile } from '../../../lib/api-client';
import { useCategories } from '../../../lib/use-categories';
import { CategorySelectOptions } from '../../components/category-select-options';
import { ActionButton, ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import styles from '../store.module.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const readFile = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('read_failed')); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.readAsDataURL(file); });

export default function SellProductPage() {
  const router = useRouter();
  const { categories, isLoading: categoryLoading, error: categoryError } = useCategories();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ businessProfileId: '', titleAr: '', descriptionAr: '', price: '', currency: 'SYP', categoryCode: '', availability: 'in_stock' });

  const [reloadCount, setReloadCount] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<ProductListing | null>(null);
  const [assets, setAssets] = useState<UploadedMediaAsset[]>([]);
  const [existingDraftId, setExistingDraftId] = useState('');
  const lifecycle = useRef(0);
  const operationPending = useRef(false);
  const createRequest = useRef<{ businessId: string; id: string } | null>(null);

  useEffect(() => {
    const generation = ++lifecycle.current;
    setLoading(true); setLoadError('');
    void api.businesses.listMine().then(({ businesses: items }) => {
      if (generation !== lifecycle.current) return;
      setBusinesses(items); setForm((value) => ({ ...value, businessProfileId: items[0]?.id ?? '' }));
    }).catch((cause) => {
      if (generation !== lifecycle.current) return;
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) router.replace('/auth/login?next=%2Fstore%2Fsell');
      else setLoadError('تعذر تحميل أنشطتك. تحقق من الاتصال ثم أعد المحاولة.');
    }).finally(() => { if (generation === lifecycle.current) setLoading(false); });
    return () => { lifecycle.current += 1; };
  }, [router, reloadCount]);

  function requestIdFor(businessId: string) {
    if (createRequest.current?.businessId === businessId) return createRequest.current.id;
    const key = `khedmah.product-create.${businessId}`;
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(key); } catch { /* Reuse the in-memory ID when storage is unavailable. */ }
    const id = stored && /^[A-Za-z0-9_-]{16,100}$/.test(stored) ? stored : crypto.randomUUID();
    createRequest.current = { businessId, id };
    try { sessionStorage.setItem(key, id); } catch { /* Browser storage is optional. */ }
    return id;
  }
  function clearCreateRequest() {
    const current = createRequest.current;
    if (current) {
      try { if (sessionStorage.getItem(`khedmah.product-create.${current.businessId}`) === current.id) sessionStorage.removeItem(`khedmah.product-create.${current.businessId}`); } catch { /* Optional browser storage. */ }
    }
    createRequest.current = null;
  }
  function startAnotherProduct() {
    if (operationPending.current) return;
    clearCreateRequest(); setDraft(null); setAssets([]); setExistingDraftId(''); setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationPending.current || existingDraftId || loadError) return;
    const imageInput = event.currentTarget.elements.namedItem('productImage') as HTMLInputElement;
    const images = Array.from(imageInput.files ?? []);
    if (!assets.length && !images.length || assets.length + images.length > 5 || images.some((image) => !allowedTypes.includes(image.type as typeof allowedTypes[number]) || image.size <= 0 || image.size > 5 * 1024 * 1024)) {
      setError('أضف من صورة إلى خمس صور بصيغة JPG أو PNG أو WebP، وبحد 5 ميغابايت للصورة.'); return;
    }
    operationPending.current = true;
    const generation = lifecycle.current;
    setSaving(true); setError(''); imageInput.value = '';
    let savedProduct = draft;
    try {
      if (savedProduct) {
        const updated = await api.products.update(savedProduct.id, { ...form, price: Number(form.price), expectedContentRevision: savedProduct.contentRevision });
        savedProduct = updated.product;
      } else {
        const created = await api.products.create({ ...form, price: Number(form.price), clientRequestId: requestIdFor(form.businessProfileId) });
        savedProduct = created.product;
        if (generation !== lifecycle.current) return;
        // A recovered request may already have progressed in another tab. Review it explicitly.
        if (savedProduct.imageUrls?.length) {
          setExistingDraftId(savedProduct.id); setError('تم العثور على مسودة محفوظة وصورها. افتحها لإكمال العمل دون تكرار الصور.'); return;
        }
      }
      if (generation !== lifecycle.current) return;
      setDraft(savedProduct);
      for (const [offset, image] of images.entries()) {
        const content = await readFile(image);
        if (generation !== lifecycle.current) return;
        const uploaded = await api.media.uploadProduct(savedProduct.id, { filename: image.name, mimeType: image.type as typeof allowedTypes[number], sizeBytes: image.size, content, sortOrder: assets.length + offset });
        if (generation !== lifecycle.current) return;
        setAssets((current) => [...current, uploaded]);
      }
      await api.products.submit(savedProduct.id);
      if (generation === lifecycle.current) { clearCreateRequest(); router.push('/store/manage'); }
    } catch (cause) {
      if (generation !== lifecycle.current) return;
      const issue = cause instanceof Error ? cause as Error & { code?: string; productId?: string; statusCode?: number } : undefined;
      if (issue?.code === 'PRODUCT_DRAFT_EXISTS' && issue.productId) {
        setExistingDraftId(issue.productId); setError('وجدنا مسودة محفوظة لهذه المحاولة ببيانات مختلفة. راجعها قبل متابعة العمل.');
      } else if (issue?.statusCode === 409 && savedProduct) {
        setExistingDraftId(savedProduct.id); setError('تغيرت المسودة أثناء العمل. افتحها لمراجعة النسخة الحالية.');
      } else {
        setError('لم تكتمل العملية. أعد اختيار الصور التي لم تُرفع فقط ثم حاول مجدداً؛ لن ننشئ مسودة أخرى لهذه المحاولة.');
        if (savedProduct) {
          try {
            const storedAssets = await api.media.listForOwner('product_listing', savedProduct.id);
            if (generation === lifecycle.current) setAssets(storedAssets.filter((asset) => asset.assetType === 'product_image'));
          } catch {
            if (generation === lifecycle.current) { setExistingDraftId(savedProduct.id); setError('المسودة محفوظة، وتعذر التحقق من صورها. افتحها لاستكمال العمل.'); }
          }
        }
      }
    } finally {
      if (generation === lifecycle.current) { operationPending.current = false; setSaving(false); }
    }
  }

  if (loadError) return <PageShell label="عرض منتج للبيع"><StatusMessage tone="danger">{loadError}</StatusMessage><ActionButton type="button" onClick={() => setReloadCount((value) => value + 1)}>إعادة المحاولة</ActionButton></PageShell>;
  if (loading) return <PageShell label="عرض منتج للبيع"><SkeletonGrid count={3}/></PageShell>;
  return <PageShell className={styles.page} label="عرض منتج للبيع"><div className={styles.formShell}>
    <PageHeader eyebrow="الإعلانات المبوبة" title="عرض منتج للبيع" description="أضف منتجًا حقيقيًا مرتبطًا بنشاطك. سيُراجع قبل ظهوره في الإعلانات." actions={<ActionLink href="/store/manage" variant="secondary">إعلاناتي</ActionLink>}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}{existingDraftId && <Surface><ActionLink href={`/store/manage/${encodeURIComponent(existingDraftId)}/edit`}>فتح المسودة المحفوظة</ActionLink><ActionButton type="button" variant="secondary" disabled={saving} onClick={startAnotherProduct}>بدء منتج جديد</ActionButton></Surface>}{categoryError && <StatusMessage tone="danger">{categoryError}</StatusMessage>}
    {!businesses.length ? <Surface className={styles.empty}><h2>يلزم نشاط أولًا</h2><p>كل منتج يجب أن يكون مرتبطًا بنشاط تملكه.</p><ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink></Surface> : <Surface as="form" className={styles.form} onSubmit={submit} aria-busy={saving}><fieldset className={styles.formFields} disabled={saving || !!existingDraftId}>
      <label className={styles.field}>النشاط البائع<select disabled={!!draft} name="businessProfileId" value={form.businessProfileId} onChange={(event) => setForm((value) => ({ ...value, businessProfileId: event.target.value }))} required>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label>
      <label className={styles.field}>اسم المنتج<input name="titleAr" value={form.titleAr} minLength={2} maxLength={160} required onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))}/></label>
      <label className={styles.field}>الوصف<textarea rows={5} maxLength={2000} name="descriptionAr" value={form.descriptionAr} onChange={(event) => setForm((value) => ({ ...value, descriptionAr: event.target.value }))}/></label>
      <div className={styles.formGrid}><label className={styles.field}>السعر<input type="number" min="1" step="0.01" name="price" value={form.price} required onChange={(event) => setForm((value) => ({ ...value, price: event.target.value }))}/></label><label className={styles.field}>العملة<select name="currency" value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label></div>
      <div className={styles.formGrid}><label className={styles.field}>تصنيف المنتج<select name="categoryCode" value={form.categoryCode} disabled={categoryLoading || !!categoryError} required onChange={(event) => setForm((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">اختر تخصصًا دقيقًا</option><CategorySelectOptions categories={categories} allowRoots={false}/></select></label><label className={styles.field}>التوفر<select name="availability" value={form.availability} onChange={(event) => setForm((value) => ({ ...value, availability: event.target.value }))}><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label></div>
      <label className={styles.field}>صور الإعلان — حتى 5 صور<input name="productImage" type="file" accept="image/jpeg,image/png,image/webp" multiple required={!assets.length}/></label>
      <p className={styles.notice}>الصور المحفوظة: {assets.length} من 5. الصورة الأولى هي الرئيسية. تُعرض الصور كاملة دون قص، ولا ينشئ النشر طلبًا أو دفعة.</p>
      <ActionButton type="submit" disabled={saving || !!existingDraftId || categoryLoading || !!categoryError}>{saving ? 'جارٍ الحفظ والرفع…' : 'حفظ وإرسال للمراجعة'}</ActionButton>
    </fieldset></Surface>}
  </div></PageShell>;
}
