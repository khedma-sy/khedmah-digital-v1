'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../../lib/api-client';
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

  useEffect(() => {
    let active = true;
    void api.businesses.listMine().then(({ businesses: items }) => { if (active) { setBusinesses(items); setForm((value) => ({ ...value, businessProfileId: items[0]?.id ?? '' })); } })
      .catch((cause) => { const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined; if (status === 401) router.replace('/auth/login?next=%2Fstore%2Fsell'); else setError('تعذر تحميل أنشطتك.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const images = Array.from((event.currentTarget.elements.namedItem('productImage') as HTMLInputElement).files ?? []);
    if (!images.length || images.length > 5 || images.some((image) => !allowedTypes.includes(image.type as typeof allowedTypes[number]) || image.size <= 0 || image.size > 5 * 1024 * 1024)) { setError('أضف من صورة إلى خمس صور بصيغة JPG أو PNG أو WebP، وبحد 5 ميغابايت للصورة.'); setSaving(false); return; }
    try {
      const { product } = await api.products.create({ ...form, price: Number(form.price) });
      for (const [sortOrder, image] of images.entries()) await api.media.uploadProduct(product.id, { filename: image.name, mimeType: image.type as typeof allowedTypes[number], sizeBytes: image.size, content: await readFile(image), sortOrder });
      await api.products.submit(product.id);
      router.push('/store/manage');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر حفظ المنتج.'); }
    finally { setSaving(false); }
  }

  if (loading) return <PageShell label="عرض منتج للبيع"><SkeletonGrid count={3}/></PageShell>;
  return <PageShell className={styles.page} label="عرض منتج للبيع"><div className={styles.formShell}>
    <PageHeader eyebrow="الإعلانات المبوبة" title="عرض منتج للبيع" description="أضف منتجًا حقيقيًا مرتبطًا بنشاطك. سيُراجع قبل ظهوره في الإعلانات." actions={<ActionLink href="/store/manage" variant="secondary">إعلاناتي</ActionLink>}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}{categoryError && <StatusMessage tone="danger">{categoryError}</StatusMessage>}
    {!businesses.length ? <Surface className={styles.empty}><h2>يلزم نشاط أولًا</h2><p>كل منتج يجب أن يكون مرتبطًا بنشاط تملكه.</p><ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink></Surface> : <Surface as="form" className={styles.form} onSubmit={submit}>
      <label className={styles.field}>النشاط البائع<select value={form.businessProfileId} onChange={(event) => setForm((value) => ({ ...value, businessProfileId: event.target.value }))} required>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label>
      <label className={styles.field}>اسم المنتج<input value={form.titleAr} minLength={2} maxLength={160} required onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))}/></label>
      <label className={styles.field}>الوصف<textarea rows={5} maxLength={2000} value={form.descriptionAr} onChange={(event) => setForm((value) => ({ ...value, descriptionAr: event.target.value }))}/></label>
      <div className={styles.formGrid}><label className={styles.field}>السعر<input type="number" min="1" step="0.01" value={form.price} required onChange={(event) => setForm((value) => ({ ...value, price: event.target.value }))}/></label><label className={styles.field}>العملة<select value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label></div>
      <div className={styles.formGrid}><label className={styles.field}>تصنيف المنتج<select value={form.categoryCode} disabled={categoryLoading || !!categoryError} required onChange={(event) => setForm((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">اختر تخصصًا دقيقًا</option><CategorySelectOptions categories={categories} allowRoots={false}/></select></label><label className={styles.field}>التوفر<select value={form.availability} onChange={(event) => setForm((value) => ({ ...value, availability: event.target.value }))}><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label></div>
      <label className={styles.field}>صور الإعلان — حتى 5 صور<input name="productImage" type="file" accept="image/jpeg,image/png,image/webp" multiple required/></label>
      <p className={styles.notice}>الصورة الأولى هي الرئيسية. تُعرض الصور كاملة دون قص، ولا ينشئ النشر طلبًا أو دفعة.</p>
      <ActionButton type="submit" disabled={saving || categoryLoading}>{saving ? 'جارٍ الحفظ والرفع…' : 'حفظ وإرسال للمراجعة'}</ActionButton>
    </Surface>}
  </div></PageShell>;
}
