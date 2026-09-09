'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { api, type ProductListing } from '../../lib/api-client';
import { useCategories } from '../../lib/use-categories';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { CategorySelectOptions } from '../components/category-select-options';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './store.module.css';

const availability = (value: ProductListing['availability']) => value === 'in_stock' ? 'متوفر' : value === 'made_to_order' ? 'حسب الطلب' : 'غير متوفر';
type StoreFilters = { q: string; categoryCode: string; cityCode: string };
const EMPTY_FILTERS: StoreFilters = { q: '', categoryCode: '', cityCode: '' };

function StoreContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // /classifieds currently reuses the product catalog, not an independent Ads API.
  // Keep that limitation explicit and never silently navigate its searches to /store.
  const basePath = pathname === '/classifieds' ? '/classifieds' : '/store';
  const isClassifieds = basePath === '/classifieds';
  const applied: StoreFilters = {
    q: (params.get('q') ?? '').trim(),
    categoryCode: (params.get('categoryCode') ?? '').trim(),
    cityCode: (params.get('cityCode') ?? '').trim()
  };
  const requestKey = JSON.stringify([basePath, applied.q, applied.categoryCode, applied.cityCode]);
  const currentKey = useRef(requestKey);
  currentKey.current = requestKey;
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [filters, setFilters] = useState<StoreFilters>(applied);
  const [result, setResult] = useState<{ key: string; products: ProductListing[]; error: string }>({ key: '', products: [], error: '' });
  const [requestLoading, setRequestLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const sequence = useRef(0);
  const isNavigating = pendingKey !== null && pendingKey !== requestKey;
  const waitingForMetadata = (!!applied.cityCode && citiesLoading) || (!!applied.categoryCode && categoriesLoading);
  const validationError = applied.cityCode && citiesError ? 'تعذر التحقق من المدينة المحددة. أعد تحميل المدن دون تغيير اختيارك.'
    : applied.cityCode && !citiesLoading && !canonicalCityCode(applied.cityCode, cities) ? 'المدينة المحددة غير متاحة. عدّل المدينة أو امسح عوامل البحث.'
    : applied.categoryCode && categoriesError ? 'تعذر التحقق من التصنيف المحدد. أعد تحميل التصنيفات دون تغيير اختيارك.'
    : applied.categoryCode && !categoriesLoading && !categories.some(item => item.code === applied.categoryCode) ? 'التصنيف المحدد غير متاح. عدّل التصنيف أو امسح عوامل البحث.' : '';
  const error = isNavigating ? '' : validationError || (result.key === requestKey ? result.error : '');
  const loading = isNavigating || (!validationError && (waitingForMetadata || requestLoading || result.key !== requestKey));
  const products = !loading && !error && result.key === requestKey ? result.products : [];

  useEffect(() => {
    setFilters(applied); setPendingKey(null);
  }, [requestKey]);

  useEffect(() => {
    const request = ++sequence.current;
    const active = () => request === sequence.current && requestKey === currentKey.current;
    if (waitingForMetadata || validationError || isNavigating) {
      setRequestLoading(false);
      return () => { sequence.current += 1; };
    }
    setRequestLoading(true);
    async function load() {
      try {
        const data = await api.products.list({ q: applied.q || undefined, categoryCode: applied.categoryCode || undefined, cityCode: applied.cityCode || undefined });
        if (!Array.isArray(data.products)) throw new Error('تعذر قراءة قائمة المنتجات. أعد المحاولة.');
        if (active()) setResult({ key: requestKey, products: data.products, error: '' });
      } catch (cause) {
        if (active()) setResult({ key: requestKey, products: [], error: cause instanceof Error ? cause.message : 'تعذر تحميل المنتجات.' });
      } finally { if (active()) setRequestLoading(false); }
    }
    void load();
    return () => { sequence.current += 1; };
  }, [requestKey, waitingForMetadata, validationError, isNavigating, retryCount]);

  function syncUrl(next: StoreFilters) {
    const q = next.q.trim(), categoryCode = next.categoryCode.trim(), cityCode = next.cityCode.trim();
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (categoryCode) query.set('categoryCode', categoryCode);
    if (cityCode) query.set('cityCode', cityCode);
    const href = query.size ? `${basePath}?${query}` : basePath;
    const targetKey = JSON.stringify([basePath, q, categoryCode, cityCode]);
    if (targetKey === requestKey) {
      if (requestLoading) return;
      if ((params.size ? `${basePath}?${params}` : basePath) !== href) router.replace(href, { scroll: false });
      setRetryCount(value => value + 1);
      return;
    }
    sequence.current += 1;
    setPendingKey(targetKey);
    router.push(href, { scroll: false });
  }
  function search(event: FormEvent) { event.preventDefault(); syncUrl(filters); }
  function clearFilters() { setFilters(EMPTY_FILTERS); syncUrl(EMPTY_FILTERS); }
  const hasFilters = !!(filters.q || filters.categoryCode || filters.cityCode || applied.q || applied.categoryCode || applied.cityCode);

  return <PageShell className={styles.page} label={isClassifieds ? 'الإعلانات المبوبة' : 'متجر خدمة'}>
    <PageHeader eyebrow={isClassifieds ? 'عروض الأنشطة المحلية' : 'منتجات الأنشطة المحلية'} title={isClassifieds ? 'الإعلانات المبوبة' : 'متجر خدمة'} description="استكشف المنتجات والعروض المنشورة، ثم تواصل مباشرة مع النشاط. لا توجد مدفوعات أو طلبات شراء داخل هذه الصفحة." actions={<><ActionLink href="/store/sell">عرض منتج للبيع</ActionLink><ActionLink href="/store/manage" variant="secondary">منتجاتي</ActionLink></>} />
    {isClassifieds && <StatusMessage>تعرض هذه الصفحة حالياً عروض منتجات المتجر. إنشاء الإعلانات المستقلة وحصتها ليس مفعّلاً بعد؛ إضافة منتج لا تعني نشر إعلان مستقل.</StatusMessage>}
    <Surface as="form" className={styles.toolbar} onSubmit={search} role="search" aria-label={isClassifieds ? 'البحث في عروض الإعلانات' : 'البحث في المتجر'} aria-busy={loading}>
      <label className={styles.field}>ابحث عن منتج<input name="q" value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="مثال: لحوم، أثاث، هاتف"/></label>
      <label className={styles.field}>التصنيف<select name="categoryCode" value={filters.categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setFilters((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">كل التصنيفات</option>{filters.categoryCode && !categories.some(item => item.code === filters.categoryCode) && <option value={filters.categoryCode}>التصنيف المحدد (غير متاح حالياً)</option>}<CategorySelectOptions categories={categories}/></select></label>
      <label className={styles.field}>المدينة<select name="cityCode" value={filters.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setFilters((value) => ({ ...value, cityCode: event.target.value }))}><option value="">كل المدن</option>{filters.cityCode && !cities.some(item => item.code === filters.cityCode) && <option value={filters.cityCode}>المدينة المحددة (غير متاحة حالياً)</option>}{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
      <ActionButton type="submit" disabled={loading}><PlatformIcon name="search" size={17}/>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>
      {hasFilters && <ActionButton type="button" variant="secondary" onClick={clearFilters}>مسح</ActionButton>}
    </Surface>
    {categoriesError && <StatusMessage tone="warning">{categoriesError} <ActionButton type="button" variant="secondary" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton></StatusMessage>}
    {citiesError && <StatusMessage tone="warning">{citiesError} <ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton></StatusMessage>}
    {error && <StatusMessage tone="danger">{error}{!validationError && <ActionButton type="button" variant="secondary" onClick={() => setRetryCount(value => value + 1)}>إعادة تحميل المنتجات</ActionButton>}</StatusMessage>}
    {loading ? <SkeletonGrid count={6} label="جاري تحميل المنتجات"/> : error ? null : products.length ? <section className={styles.grid} aria-label="المنتجات المنشورة">{products.map((product) => <Surface as="article" className={styles.card} key={product.id}>
      <Link className={styles.image} href={`/store/products/${encodeURIComponent(product.id)}`}>{product.imageUrl ? <img src={product.imageUrl} alt={product.titleAr}/> : <span aria-hidden="true">خ</span>}</Link>
      <div className={styles.meta}><span>{product.businessName}</span><span>·</span><span>{cityLabel(product.cityCode ?? '', cities)}</span><span>·</span><span>{availability(product.availability)}</span></div>
      <h2>{product.titleAr}</h2><strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>
      <ActionLink href={`/store/products/${encodeURIComponent(product.id)}`}>عرض المنتج</ActionLink>
    </Surface>)}</section> : <EmptyState icon={<PlatformIcon name="briefcase" size={34}/>} title="لا توجد منتجات مطابقة" description="غيّر البحث أو كن أول نشاط يعرض منتجًا في هذا التصنيف." actions={<ActionLink href="/store/sell">عرض منتج للبيع</ActionLink>} />}
  </PageShell>;
}

export default function StorePage() {
  return <Suspense fallback={<PageShell className={styles.page}><SkeletonGrid count={6} label="جاري تحميل المنتجات"/></PageShell>}><StoreContent /></Suspense>;
}
