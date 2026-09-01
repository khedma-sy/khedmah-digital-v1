'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
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

  useEffect(() => {
    let active = true;
    void Promise.all([api.products.listMine(), api.media.listForOwner('product_listing', id)])
      .then(([{ products }, media]) => {
        if (!active) return;
        setAssets(media.filter((asset) => asset.assetType === 'product_image'));
        const found = products.find((item) => item.id === id) ?? null;
        setProduct(found);
        if (found) setForm({
          titleAr: found.titleAr,
          descriptionAr: found.descriptionAr ?? '',
          price: String(found.price),
          currency: found.currency,
          categoryCode: found.categoryCode,
          availability: found.availability
        });
      })
      .catch((cause) => {
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) router.replace(`/auth/login?next=${encodeURIComponent(`/store/manage/${id}/edit`)}`);
        else setError('تعذر تحميل المنتج.');
      });
    return () => { active = false; };
  }, [id, router]);

  async function deleteImage(asset: UploadedMediaAsset) {
    setSaving(true); setError('');
    try {
      await api.media.delete(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حذف صورة المنتج.');
    } finally { setSaving(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const images = Array.from((event.currentTarget.elements.namedItem('productImage') as HTMLInputElement).files ?? []);
    const currentImageCount = assets.length;
    if (currentImageCount + images.length > 5 || images.some((image) => !allowedTypes.includes(image.type as typeof allowedTypes[number]) || image.size <= 0 || image.size > 5 * 1024 * 1024)) {
      setError(`يمكن أن يحتوي الإعلان على خمس صور كحد أقصى، وبحد 5 ميغابايت للصورة. لديك حاليًا ${currentImageCount}.`);
      setSaving(false);
      return;
    }
    if (!currentImageCount && !images.length) {
      setError('أضف صورة المنتج قبل إعادة إرساله.');
      setSaving(false);
      return;
    }
    try {
      await api.products.update(id, { ...form, price: Number(form.price) });
      for (const [offset, image] of images.entries()) await api.media.uploadProduct(id, { filename: image.name, mimeType: image.type as typeof allowedTypes[number], sizeBytes: image.size, content: await readFile(image), sortOrder: currentImageCount + offset });
      await api.products.submit(id);
      router.push('/store/manage');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تعديل المنتج.');
    } finally {
      setSaving(false);
    }
  }

  if (product === undefined && !error) return <PageShell label="تعديل المنتج"><SkeletonGrid count={3}/></PageShell>;
  if (!product) return <PageShell label="تعديل المنتج"><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="المنتج غير موجود ضمن منتجاتك" description={error || 'تحقق من الرابط أو عد إلى قائمة منتجاتك.'} actions={<ActionLink href="/store/manage">منتجاتي</ActionLink>}/></PageShell>;

  return <PageShell className={styles.page} label="تعديل المنتج"><div className={styles.formShell}>
    <PageHeader eyebrow="مساحة البائع" title="تعديل المنتج وإعادة إرساله" description="أي تعديل يعيد المنتج إلى المراجعة قبل ظهوره للعامة." backHref="/store/manage"/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {categoryError && <StatusMessage tone="danger">{categoryError}</StatusMessage>}
    <Surface as="form" className={styles.form} onSubmit={submit}>
      <label className={styles.field}>اسم المنتج<input value={form.titleAr} minLength={2} maxLength={160} required onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))}/></label>
      <label className={styles.field}>الوصف<textarea rows={5} maxLength={2000} value={form.descriptionAr} onChange={(event) => setForm((value) => ({ ...value, descriptionAr: event.target.value }))}/></label>
      <div className={styles.formGrid}>
        <label className={styles.field}>السعر<input type="number" min="1" step="0.01" value={form.price} required onChange={(event) => setForm((value) => ({ ...value, price: event.target.value }))}/></label>
        <label className={styles.field}>العملة<select value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.field}>تصنيف المنتج<select value={form.categoryCode} disabled={categoryLoading || !!categoryError} required onChange={(event) => setForm((value) => ({ ...value, categoryCode: event.target.value }))}><CategorySelectOptions categories={categories} allowRoots={false}/></select></label>
        <label className={styles.field}>التوفر<select value={form.availability} onChange={(event) => setForm((value) => ({ ...value, availability: event.target.value }))}><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label>
      </div>
      {assets.length > 0 && <div className={styles.editorImages} aria-label="صور المنتج الحالية">{assets.map((asset) => <figure key={asset.id}>
        {asset.publicUrl && <img src={asset.publicUrl} alt={asset.filename}/>}<figcaption><span>{asset.filename}</span><button type="button" onClick={() => void deleteImage(asset)} disabled={saving}>حذف واستبدال</button></figcaption>
      </figure>)}</div>}
      <label className={styles.field}>إضافة صور (اختياري)<input name="productImage" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={assets.length >= 5}/></label>
      <p className={styles.notice}>لديك {assets.length} من 5 صور. يمكنك حذف الصورة المرفوضة ثم رفع بديل، وتُعرض الصور كاملة دون قص.</p>
      <ActionButton type="submit" disabled={saving || categoryLoading}>{saving ? 'جارٍ الحفظ…' : 'حفظ وإعادة الإرسال'}</ActionButton>
    </Surface>
  </div></PageShell>;
}
