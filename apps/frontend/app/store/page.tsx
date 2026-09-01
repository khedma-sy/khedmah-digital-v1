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
  const { categories } = useCategories();
  const { cities } = useSyrianCities();
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
  function search(event: FormEvent) { event.preventDefault(); void load(); }

  return <PageShell className={styles.page} label="الإعلانات المبوبة">
    <PageHeader eyebrow="إعلانات الأنشطة المحلية" title="الإعلانات المبوبة" description="استكشف المنتجات والعروض المنشورة، ثم تواصل مباشرة مع النشاط المعلن. لا توجد مدفوعات أو طلبات داخل المنصة." actions={<><ActionLink href="/store/sell">أضف إعلانًا</ActionLink><ActionLink href="/store/manage" variant="secondary">إعلاناتي</ActionLink></>} />
    <Surface as="form" className={styles.toolbar} onSubmit={search}>
      <label className={styles.field}>ابحث عن منتج<input value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="مثال: لحوم، أثاث، هاتف"/></label>
      <label className={styles.field}>التصنيف<select value={filters.categoryCode} onChange={(event) => setFilters((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">كل التصنيفات</option><CategorySelectOptions categories={categories}/></select></label>
      <label className={styles.field}>المدينة<select value={filters.cityCode} onChange={(event) => setFilters((value) => ({ ...value, cityCode: event.target.value }))}><option value="">كل المدن</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
      <ActionButton type="submit" disabled={loading}><PlatformIcon name="search" size={17}/>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>
    </Surface>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {loading ? <SkeletonGrid count={6} label="جاري تحميل المنتجات"/> : products.length ? <section className={styles.grid} aria-label="المنتجات المنشورة">{products.map((product) => <Surface as="article" className={styles.card} key={product.id}>
      <Link className={styles.image} href={`/store/products/${product.id}`}>{product.imageUrl ? <img src={product.imageUrl} alt={product.titleAr}/> : <span aria-hidden="true">خ</span>}</Link>
      <div className={styles.meta}><span>{product.businessName}</span><span>·</span><span>{cityLabel(product.cityCode ?? '', cities)}</span><span>·</span><span>{availability(product.availability)}</span></div>
      <h2>{product.titleAr}</h2><strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>
      <ActionLink href={`/store/products/${product.id}`}>عرض المنتج</ActionLink>
    </Surface>)}</section> : <EmptyState icon={<PlatformIcon name="briefcase" size={34}/>} title="لا توجد منتجات مطابقة" description="غيّر البحث أو كن أول نشاط يعرض منتجًا في هذا التصنيف." actions={<ActionLink href="/store/sell">عرض منتج للبيع</ActionLink>} />}
  </PageShell>;
}
