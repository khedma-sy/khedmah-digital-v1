'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, type AdvertisingPolicy, type PublicBusinessProfile } from '../../../lib/api-client';
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
  const [listingUsage, setListingUsage] = useState({ count: 0, limit: 3 });
  const [advertisingPolicy, setAdvertisingPolicy] = useState<AdvertisingPolicy>({ phase: 'free_launch', listingLimitPerUser: 3, paymentsEnabled: false, pricingPublished: false, checkoutEnabled: false, paidPlansStatus: 'planned' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ businessProfileId: '', titleAr: '', descriptionAr: '', price: '', currency: 'SYP', categoryCode: '', availability: 'in_stock', requiresPrescription: false, controlledItem: false });

  useEffect(() => {
    let active = true;
    void Promise.all([api.businesses.listMine(), api.products.listMine()]).then(([{ businesses: items }, { count, limit, advertisingPolicy: policy }]) => { if (active) { setBusinesses(items); setListingUsage({ count, limit }); setAdvertisingPolicy(policy); setForm((value) => ({ ...value, businessProfileId: items[0]?.id ?? '' })); } })
      .catch((cause) => { const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined; if (status === 401) router.replace('/auth/login?next=%2Fstore%2Fsell'); else setError('تعذر تحميل أنشطتك.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    if (form.controlledItem) { setError('لا تسمح خدمة بنشر أو طلب الأدوية والمواد المقيدة.'); setSaving(false); return; }
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
    <PageHeader eyebrow="الإعلانات المبوبة" title="عرض منتج للبيع" description="أضف منتجًا حقيقيًا مرتبطًا بنشاط موثوق. يتحقق النظام من الشروط وينشر الإعلان المطابق تلقائيًا." actions={<ActionLink href="/store/manage" variant="secondary">إعلاناتي</ActionLink>}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}{categoryError && <StatusMessage tone="danger">{categoryError}</StatusMessage>}
    {!businesses.length ? <Surface className={styles.empty}><h2>يلزم نشاط أولًا</h2><p>كل منتج يجب أن يكون مرتبطًا بنشاط تملكه.</p><ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink></Surface> : listingUsage.count >= listingUsage.limit ? <Surface className={styles.empty}><h2>اكتمل رصيد الإعلانات المجانية</h2><p>تتيح مرحلة الإطلاق {advertisingPolicy.listingLimitPerUser.toLocaleString('ar-SY-u-nu-latn')} إعلانات مجانية لكل مستخدم. التسعير والدفع قيد التجهيز ولم يُفعّل أي شراء بعد. ألغِ نشر إعلان غير مطلوب لتحرير مساحة جديدة مع الاحتفاظ بسجله.</p><ActionLink href="/store/manage">إدارة إعلاناتي</ActionLink></Surface> : <Surface as="form" className={styles.form} onSubmit={submit}>
      <label className={styles.field}>النشاط البائع<select value={form.businessProfileId} onChange={(event) => setForm((value) => ({ ...value, businessProfileId: event.target.value }))} required>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label>
      <label className={styles.field}>اسم المنتج<input value={form.titleAr} minLength={2} maxLength={160} required onChange={(event) => setForm((value) => ({ ...value, titleAr: event.target.value }))}/></label>
      <label className={styles.field}>الوصف<textarea rows={5} maxLength={2000} value={form.descriptionAr} onChange={(event) => setForm((value) => ({ ...value, descriptionAr: event.target.value }))}/></label>
      <div className={styles.formGrid}><label className={styles.field}>السعر<input type="number" min="1" step="0.01" value={form.price} required onChange={(event) => setForm((value) => ({ ...value, price: event.target.value }))}/></label><label className={styles.field}>العملة<select value={form.currency} onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))}><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label></div>
      <div className={styles.formGrid}><label className={styles.field}>تصنيف المنتج<select value={form.categoryCode} disabled={categoryLoading || !!categoryError} required onChange={(event) => setForm((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">اختر تخصصًا دقيقًا</option><CategorySelectOptions categories={categories} allowRoots={false}/></select></label><label className={styles.field}>التوفر<select value={form.availability} onChange={(event) => setForm((value) => ({ ...value, availability: event.target.value }))}><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label></div>
      {businesses.find((business) => business.id === form.businessProfileId)?.categoryCode === 'pharmacy' && <Surface><h3>ضوابط الصيدلية</h3><label><input type="checkbox" checked={form.requiresPrescription} onChange={(event) => setForm((value) => ({ ...value, requiresPrescription: event.target.checked }))}/> يحتاج وصفة ومراجعة صيدلي قبل التأكيد</label><label><input type="checkbox" checked={form.controlledItem} onChange={(event) => setForm((value) => ({ ...value, controlledItem: event.target.checked }))}/> دواء أو مادة مقيدة — يمنع النظام نشرها وطلبها</label></Surface>}
      <label className={styles.field}>صور الإعلان — حتى 5 صور<input name="productImage" type="file" accept="image/jpeg,image/png,image/webp" multiple required/></label>
      <p className={styles.notice}>لديك {advertisingPolicy.listingLimitPerUser.toLocaleString('ar-SY-u-nu-latn')} إعلانات مجانية خلال مرحلة الإطلاق. الصورة الأولى هي الرئيسية، وتُعرض الصور كاملة دون قص. استخدمت {listingUsage.count.toLocaleString('ar-SY-u-nu-latn')} من {listingUsage.limit.toLocaleString('ar-SY-u-nu-latn')} إعلانًا.</p>
      <ActionButton type="submit" disabled={saving || categoryLoading}>{saving ? 'جارٍ التحقق والنشر…' : 'تحقق وانشر الإعلان'}</ActionButton>
    </Surface>}
  </div></PageShell>;
}
