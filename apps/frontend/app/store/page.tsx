'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api, type ProductListing } from '../../lib/api-client';
import { useCategories } from '../../lib/use-categories';
import { cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { CategorySelectOptions } from '../components/category-select-options';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './store.module.css';

const availability = (value: ProductListing['availability']) => value === 'in_stock' ? 'متوفر' : value === 'made_to_order' ? 'حسب الطلب' : 'غير متوفر';

export default function StorePage() {
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [filters, setFilters] = useState({ q: '', categoryCode: '', cityCode: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true); setError('');
    try { setProducts((await api.products.list({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined })).products); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحميل المنتجات.'); }
    finally { setLoading(false); }
  }
  function syncUrl(next: typeof filters) {
    const query = new URLSearchParams();
    if (next.q.trim()) query.set('q', next.q.trim());
    if (next.categoryCode) query.set('categoryCode', next.categoryCode);
    if (next.cityCode) query.set('cityCode', next.cityCode);
    window.history.replaceState(null, '', query.size ? `/classifieds?${query}` : '/classifieds');
  }
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const initial = {
      q: query.get('q')?.trim() ?? '',
      categoryCode: query.get('categoryCode')?.trim() ?? '',
      cityCode: query.get('cityCode')?.trim() ?? ''
    };
    setFilters(initial);
    void load(initial);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);
  function search(event: FormEvent) { event.preventDefault(); syncUrl(filters); void load(filters); }
  function clear() { const next = { q: '', categoryCode: '', cityCode: '' }; setFilters(next); syncUrl(next); void load(next); }
  const hasFilters = Boolean(filters.q || filters.categoryCode || filters.cityCode);

  return <PageShell className={styles.page} label="الإعلانات المبوبة">
    <PageHeader eyebrow="سوق الأنشطة المحلية" title="المتاجر والإعلانات" description="ابحث عن منتج حقيقي منشور من نشاط معتمد، ثم راجع التفاصيل وتواصل مباشرة مع البائع." actions={<><ActionLink href="/store/sell"><PlatformIcon name="tag" size={17}/>أضف منتجًا</ActionLink><ActionLink href="/store/manage" variant="secondary"><PlatformIcon name="storefront" size={17}/>إعلاناتي</ActionLink></>} />
    <Surface><form className={styles.toolbar} onSubmit={search} role="search" aria-label="البحث في الإعلانات" aria-busy={loading}>
      <label className={styles.field}>ابحث عن منتج<input type="search" autoComplete="off" value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="مثال: لحوم، أثاث، هاتف"/></label>
      <label className={styles.field}>التصنيف<select value={filters.categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setFilters((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">كل التصنيفات</option><CategorySelectOptions categories={categories}/></select></label>
      <label className={styles.field}>المدينة<select value={filters.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setFilters((value) => ({ ...value, cityCode: event.target.value }))}><option value="">كل المدن</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
      <div className={styles.toolbarActions}><ActionButton type="submit" disabled={loading}><PlatformIcon name="search" size={17}/>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>{hasFilters && <ActionButton type="button" variant="secondary" onClick={clear}>مسح</ActionButton>}</div>
    </form></Surface>
    {categoriesError && <StatusMessage tone="warning">تعذر تحميل التصنيفات. <button type="button" onClick={() => void retryCategories()}>إعادة المحاولة</button></StatusMessage>}
    {citiesError && <StatusMessage tone="warning">تعذر تحميل المدن. <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></StatusMessage>}
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {loading ? <SkeletonGrid count={6} label="جاري تحميل المنتجات"/> : products.length ? <><p className={styles.summary} aria-live="polite">{products.length.toLocaleString('ar-SY')} إعلان مطابق</p><section className={styles.grid} aria-label="المنتجات المنشورة">{products.map((product) => <Surface as="article" className={styles.card} key={product.id}>
      <Link className={styles.image} href={`/store/products/${product.id}`} aria-label={`عرض ${product.titleAr}`}>{product.imageUrl ? <img src={product.imageUrl} alt={`صورة ${product.titleAr}`}/> : <span aria-hidden="true">خ</span>}</Link>
      <div className={styles.cardTop}><span className={styles.availability} data-available={product.availability === 'in_stock'}>{availability(product.availability)}</span><span>{product.businessName ?? 'نشاط على خدمة'}</span></div>
      <div className={styles.meta}><span><PlatformIcon name="pin" size={14}/>{cityLabel(product.cityCode ?? '', cities)}</span></div>
      <h2>{product.titleAr}</h2><strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>
      <ActionLink href={`/store/products/${product.id}`}>التفاصيل والتواصل</ActionLink>
    </Surface>)}</section></> : <EmptyState icon={<PlatformIcon name="storefront" size={34}/>} title={hasFilters?'لا توجد منتجات بهذه المواصفات':'لم تُنشر منتجات معتمدة بعد'} description={hasFilters?'امسح بعض المرشحات أو وسّع المدينة للوصول إلى نتائج أكثر.':'ابدأ باستكشاف الأنشطة المحلية، أو كن أول صاحب نشاط ينشر منتجًا.'} actions={<>{hasFilters && <ActionButton type="button" variant="secondary" onClick={clear}><PlatformIcon name="refresh" size={17}/>عرض جميع المنتجات</ActionButton>}<ActionLink href="/categories" variant="secondary">استكشف الأنشطة</ActionLink><ActionLink href="/store/sell">أضف منتجًا</ActionLink></>} />}
  </PageShell>;
}
