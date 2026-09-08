'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, type ProductListing, type UploadedMediaAsset } from '../../../../../lib/api-client';
import { useCategories } from '../../../../../lib/use-categories';
import { CategorySelectOptions } from '../../../../components/category-select-options';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../../../components/ui-primitives';
import { PlatformIcon } from '../../../../components/platform-icon';
import styles from '../../../store.module.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('read_failed'));
  reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
  reader.readAsDataURL(file);
});

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { categories, isLoading: categoryLoading, error: categoryError } = useCategories();
  const [product, setProduct] = useState<ProductListing | null>();
  const [assets, setAssets] = useState<UploadedMediaAsset[]>([]);
  const [form, setForm] = useState({ titleAr: '', descriptionAr: '', price: '', currency: 'SYP', categoryCode: '', availability: 'in_stock' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [requiresReload, setRequiresReload] = useState(false);
  const lifecycle = useRef(0);
  const operationPending = useRef(false);

  useEffect(() => {
    const generation = ++lifecycle.current;
    operationPending.current = false;
    setProduct(undefined); setAssets([]); setSaving(false); setError(''); setLoadError(''); setRequiresReload(false);
    void Promise.all([api.products.listMine(), api.media.listForOwner('product_listing', id)])
      .then(([{ products }, media]) => {
        if (generation !== lifecycle.current) return;
        const found = products.find((item) => item.id === id) ?? null;
        setProduct(found);
        setAssets(media.filter((asset) => asset.assetType === 'product_image'));
        if (found) setForm({ titleAr: found.titleAr, descriptionAr: found.descriptionAr ?? '', price: String(found.price),
          currency: found.currency, categoryCode: found.categoryCode, availability: found.availability });
      })
      .catch((cause: unknown) => {
        if (generation !== lifecycle.current) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) router.replace(`/auth/login?next=${encodeURIComponent(`/store/manage/${id}/edit`)}`);
        else setLoadError('تعذر تحميل المنتج وصوره. تحقق من الاتصال ثم أعد المحاولة.');
      });
    return () => { lifecycle.current += 1; };
  }, [id, router, reloadCount]);

  async function recoverImages(generation: number) {
    try {
      const current = await api.media.listForOwner('product_listing', id);
      if (generation === lifecycle.current) setAssets(current.filter((asset) => asset.assetType === 'product_image'));
    } catch {
      if (generation === lifecycle.current) {
        setRequiresReload(true);
        setError('تعذر التحقق من الصور المحفوظة. حمّل النسخة الحالية قبل محاولة الحفظ مجدداً.');
      }
    }
  }

  async function deleteImage(asset: UploadedMediaAsset) {
    if (operationPending.current || requiresReload || product?.id !== id) return;
    operationPending.current = true;
    const generation = lifecycle.current;
    setSaving(true); setError('');
    try {
      await api.media.delete(asset.id);
      if (generation === lifecycle.current) setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (cause) {
      if (generation !== lifecycle.current) return;
      setError(cause instanceof Error ? cause.message : 'تعذر حذف صورة المنتج.');
      await recoverImages(generation);
    } finally {
      if (generation === lifecycle.current) { operationPending.current = false; setSaving(false); }
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (operationPending.current || requiresReload || product?.id !== id) return;
    const imageInput = event.currentTarget.elements.namedItem('productImage') as HTMLInputElement;
    const images = Array.from(imageInput.files ?? []);
    const currentImageCount = assets.length;
    if (currentImageCount + images.length > 5 || images.some((image) => !allowedTypes.includes(image.type as typeof allowedTypes[number]) || image.size <= 0 || image.size > 5 * 1024 * 1024)) {
      setError(`يمكن أن يحتوي الإعلان على خمس صور كحد أقصى، وبحد 5 ميغابايت للصورة. لديك حاليًا ${currentImageCount}.`);
      return;
    }
    if (!currentImageCount && !images.length) { setError('أضف صورة المنتج قبل إعادة إرساله.'); return; }
    operationPending.current = true;
    const generation = lifecycle.current;
    setSaving(true); setError('');
    // The captured files are processed once; retry requires selecting only unfinished files.
    imageInput.value = '';
    try {
      const { product: saved } = await api.products.update(id, { ...form, price: Number(form.price), expectedContentRevision: product.contentRevision });
      if (generation !== lifecycle.current) return;
      setProduct(saved);
      for (const [offset, image] of images.entries()) {
        const content = await readFile(image);
        if (generation !== lifecycle.current) return;
        const uploaded = await api.media.uploadProduct(id, { filename: image.name, mimeType: image.type as typeof allowedTypes[number], sizeBytes: image.size, content, sortOrder: currentImageCount + offset });
        if (generation !== lifecycle.current) return;
        setAssets((current) => [...current, uploaded]);
      }
      await api.products.submit(id);
      if (generation === lifecycle.current) router.push('/store/manage');
    } catch (cause) {
      if (generation !== lifecycle.current) return;
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 409) {
        setRequiresReload(true);
        setError('تغيرت بيانات المنتج أو صوره أثناء العمل. مسودتك ما زالت ظاهرة؛ راجعها قبل تحميل النسخة الحالية.');
      } else {
        setError('لم تكتمل عملية الحفظ والإرسال. ستظهر الصور المحفوظة؛ أعد اختيار الصور التي لم تُرفع فقط ثم حاول مجدداً.');
        await recoverImages(generation);
      }
    } finally {
      if (generation === lifecycle.current) { operationPending.current = false; setSaving(false); }
    }
  }

  if (product === undefined || product && product.id !== id) return <PageShell label="تعديل المنتج">{loadError
    ? <><StatusMessage tone="danger">{loadError}</StatusMessage><ActionButton type="button" onClick={() => setReloadCount((value) => value + 1)}>إعادة المحاولة</ActionButton></>
    : <SkeletonGrid count={3}/>}</PageShell>;
  if (!product) return <PageShell label="تعديل المنتج"><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="المنتج غير موجود ضمن منتجاتك" description="تحقق من الرابط أو عد إلى قائمة منتجاتك." actions={<ActionLink href="/store/manage">منتجاتي</ActionLink>}/></PageShell>;

  return <PageShell className={styles.page} label="تعديل المنتج"><div className={styles.formShell}>
    <PageHeader eyebrow="مساحة البائع" title="تعديل المنتج وإعادة إرساله" description="أي تعديل يعيد المنتج إلى المراجعة قبل ظهوره للعامة." backHref="/store/manage"/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}{requiresReload && <ActionButton type="button" variant="secondary" disabled={saving} onClick={() => setReloadCount((value) => value + 1)}>تحميل النسخة الحالية بدل المسودة</ActionButton>}
    {categoryError && <StatusMessage tone="danger">{categoryError}</StatusMessage>}
    <Surface as="form" className={styles.form} onSubmit={submit} aria-busy={saving}><fieldset className={styles.formFields} disabled={saving || requiresReload}>
      <label className={styles.field}>اسم المنتج<input name="titleAr" value={form.titleAr} minLength={2} maxLength={160} required onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))}/></label>
      <label className={styles.field}>الوصف<textarea rows={5} maxLength={2000} name="descriptionAr" value={form.descriptionAr} onChange={(event) => setForm((value) => ({ ...value, descriptionAr: event.target.value }))}/></label>
      <div className={styles.formGrid}>
        <label className={styles.field}>السعر<input type="number" min="1" step="0.01" name="price" value={form.price} required onChange={(event) => setForm((value) => ({ ...value, price: event.target.value }))}/></label>
        <label className={styles.field}>العملة<select name="currency" value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.field}>تصنيف المنتج<select name="categoryCode" value={form.categoryCode} disabled={categoryLoading || !!categoryError} required onChange={(event) => setForm((value) => ({ ...value, categoryCode: event.target.value }))}><CategorySelectOptions categories={categories} allowRoots={false}/></select></label>
        <label className={styles.field}>التوفر<select name="availability" value={form.availability} onChange={(event) => setForm((value) => ({ ...value, availability: event.target.value }))}><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label>
      </div>
      {assets.length > 0 && <div className={styles.editorImages} aria-label="صور المنتج الحالية">{assets.map((asset) => <figure key={asset.id}>
        {asset.publicUrl && <img src={asset.publicUrl} alt={asset.filename}/>}<figcaption><span>{asset.filename}</span><button type="button" onClick={() => void deleteImage(asset)} disabled={saving}>حذف واستبدال</button></figcaption>
      </figure>)}</div>}
      <label className={styles.field}>إضافة صور (اختياري)<input name="productImage" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={assets.length >= 5}/></label>
      <p className={styles.notice}>لديك {assets.length} من 5 صور. يمكنك حذف الصورة المرفوضة ثم رفع بديل، وتُعرض الصور كاملة دون قص.</p>
      <ActionButton type="submit" disabled={saving || requiresReload || categoryLoading || !!categoryError}>{saving ? 'جارٍ الحفظ…' : 'حفظ وإعادة الإرسال'}</ActionButton>
    </fieldset></Surface>
  </div></PageShell>;
}
