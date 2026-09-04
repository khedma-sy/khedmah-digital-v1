'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { api, type ProductListing } from '../../lib/api-client';
import { useCategories } from '../../lib/use-categories';
import { cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { HierarchicalCategoryFilter } from '../components/hierarchical-category-filter';
import { ActionButton, ActionLink, EmptyState, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './store.module.css';

type StoreCurrency = '' | ProductListing['currency'];
type StoreAvailability = '' | ProductListing['availability'];
type StoreSort = 'newest' | 'price_asc' | 'price_desc';
type StoreFilters = {
  q: string;
  categoryCode: string;
  cityCode: string;
  availability: StoreAvailability;
  currency: StoreCurrency;
  minPrice: string;
  maxPrice: string;
  sort: StoreSort;
};

const EMPTY_FILTERS: StoreFilters = {
  q: '', categoryCode: '', cityCode: '', availability: '', currency: '', minPrice: '', maxPrice: '', sort: 'newest'
};

const availabilityLabel = (value: ProductListing['availability']) => value === 'in_stock' ? 'متوفر' : value === 'made_to_order' ? 'حسب الطلب' : 'غير متوفر';
const sortLabel = (value: StoreSort) => value === 'price_asc' ? 'السعر من الأقل' : value === 'price_desc' ? 'السعر من الأعلى' : 'الأحدث';
const publishedAt = (value: string) => new Date(value).toLocaleDateString('ar-SY', { day: 'numeric', month: 'short', year: 'numeric' });

export default function StorePage() {
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [filters, setFilters] = useState<StoreFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(next: StoreFilters) {
    const filterError = validatePriceRange(next);
    if (filterError) { setProducts([]); setError(filterError); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const response = await api.products.list({
        q: next.q.trim() || undefined,
        categoryCode: next.categoryCode || undefined,
        cityCode: next.cityCode || undefined,
        availability: next.availability || undefined,
        currency: next.currency || undefined,
        minPrice: next.minPrice === '' ? undefined : Number(next.minPrice),
        maxPrice: next.maxPrice === '' ? undefined : Number(next.maxPrice),
        sort: next.sort
      });
      setProducts(response.products);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الإعلانات.');
    } finally { setLoading(false); }
  }

  function syncUrl(next: StoreFilters) {
    const query = new URLSearchParams();
    if (next.q.trim()) query.set('q', next.q.trim());
    if (next.categoryCode) query.set('categoryCode', next.categoryCode);
    if (next.cityCode) query.set('cityCode', next.cityCode);
    if (next.availability) query.set('availability', next.availability);
    if (next.currency) query.set('currency', next.currency);
    if (next.minPrice !== '') query.set('minPrice', next.minPrice);
    if (next.maxPrice !== '') query.set('maxPrice', next.maxPrice);
    if (next.sort !== 'newest') query.set('sort', next.sort);
    window.history.replaceState(null, '', query.size ? `/classifieds?${query}` : '/classifieds');
  }

  useEffect(() => {
    const initial = readFilters(new URLSearchParams(window.location.search));
    setFilters(initial);
    setFiltersOpen(hasAdvancedFilters(initial));
    void load(initial);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    const filterError = validatePriceRange(filters);
    if (filterError) { setError(filterError); return; }
    syncUrl(filters);
    void load(filters);
  }

  function clear() {
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
    syncUrl(EMPTY_FILTERS);
    void load(EMPTY_FILTERS);
  }

  function changeCurrency(currency: StoreCurrency) {
    setFilters((current) => currency ? { ...current, currency } : { ...current, currency: '', minPrice: '', maxPrice: '', sort: 'newest' });
  }

  const hasFilters = Boolean(filters.q || filters.categoryCode || filters.cityCode || filters.availability || filters.currency || filters.minPrice || filters.maxPrice || filters.sort !== 'newest');
  const advancedFilterCount = countAdvancedFilters(filters);

  return <PageShell className={styles.page} label="الإعلانات المبوبة">
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>سوق خدمة المحلي</span>
        <h1>ماذا تبحث عنه اليوم؟</h1>
        <p>إعلانات من أنشطة معتمدة، بتفاصيل واضحة وتواصل مباشر مع البائع.</p>
        <div className={styles.trustLine} aria-label="مزايا إعلانات خدمة">
          <span><PlatformIcon name="check" size={15}/>أنشطة موثّقة</span>
          <span><PlatformIcon name="pin" size={15}/>بحث حسب المدينة</span>
          <span><PlatformIcon name="phone" size={15}/>تواصل مباشر</span>
        </div>
      </div>
      <nav className={styles.heroActions} aria-label="إجراءات المتجر">
        <ActionLink href="/store/sell"><PlatformIcon name="tag" size={17}/>أضف إعلانك</ActionLink>
        <ActionLink href="/store/manage" variant="secondary"><PlatformIcon name="storefront" size={17}/>إعلاناتي</ActionLink>
      </nav>
    </header>

    <Surface className={styles.discoveryPanel}><form className={styles.toolbar} onSubmit={search} role="search" aria-label="البحث في الإعلانات" aria-busy={loading}>
      <div className={styles.searchBlock}>
        <label htmlFor="store-search">ابحث في الإعلانات</label>
        <div className={styles.searchControl}>
          <PlatformIcon name="search" size={20}/>
          <input id="store-search" type="search" autoComplete="off" value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="مثال: أثاث، هاتف أو مواد بناء"/>
          <ActionButton type="submit" disabled={loading}>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>
        </div>
      </div>

      <div className={styles.primaryFilters} aria-label="تحديد المجال والموقع">
        <HierarchicalCategoryFilter categories={categories} value={filters.categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(categoryCode) => setFilters((value) => ({ ...value, categoryCode }))}/>
        <label className={styles.field}>المدينة<select value={filters.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setFilters((value) => ({ ...value, cityCode: event.target.value }))}><option value="">كل المدن</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
      </div>

      <div className={styles.filterControls}>
        <button className={styles.filterToggle} type="button" aria-expanded={filtersOpen} aria-controls="store-advanced-filters" onClick={() => setFiltersOpen((open) => !open)}>
          <PlatformIcon name="filter" size={17}/>
          خيارات إضافية
          {advancedFilterCount > 0 && <span>{advancedFilterCount.toLocaleString('ar-SY')}</span>}
        </button>
        {hasFilters && <button className={styles.clearButton} type="button" onClick={clear}><PlatformIcon name="refresh" size={16}/>مسح الاختيارات</button>}
      </div>

      <div id="store-advanced-filters" className={styles.secondaryFilters} data-open={filtersOpen} aria-label="مرشحات الإعلان والسعر">
        <label className={styles.field}>التوفر<select value={filters.availability} onChange={(event) => setFilters((value) => ({ ...value, availability: event.target.value as StoreAvailability }))}><option value="">كل الحالات</option><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label>
        <label className={styles.field}>العملة<select value={filters.currency} onChange={(event) => changeCurrency(event.target.value as StoreCurrency)}><option value="">كل العملات</option><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label>
        <label className={styles.field}>السعر من<input type="number" min="0" step="0.01" inputMode="decimal" value={filters.minPrice} disabled={!filters.currency} onChange={(event) => setFilters((value) => ({ ...value, minPrice: event.target.value }))} placeholder={filters.currency ? 'الحد الأدنى' : 'اختر العملة'}/></label>
        <label className={styles.field}>السعر إلى<input type="number" min="0" step="0.01" inputMode="decimal" value={filters.maxPrice} disabled={!filters.currency} onChange={(event) => setFilters((value) => ({ ...value, maxPrice: event.target.value }))} placeholder={filters.currency ? 'الحد الأعلى' : 'اختر العملة'}/></label>
        <label className={styles.field}>الترتيب<select value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value as StoreSort }))}><option value="newest">الأحدث</option><option value="price_asc" disabled={!filters.currency}>السعر: الأقل أولًا</option><option value="price_desc" disabled={!filters.currency}>السعر: الأعلى أولًا</option></select></label>
      </div>
    </form></Surface>
    {categoriesError && <StatusMessage tone="warning">تعذر تحميل التصنيفات. <button type="button" onClick={() => void retryCategories()}>إعادة المحاولة</button></StatusMessage>}
    {citiesError && <StatusMessage tone="warning">تعذر تحميل المدن. <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></StatusMessage>}
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    <section className={styles.results} aria-labelledby="store-results-title">
      <div className={styles.resultsHeading}><div><span>نتائج موثوقة</span><h2 id="store-results-title">الإعلانات المتاحة</h2></div>{!loading && products.length > 0 && <p className={styles.summary} aria-live="polite">{products.length.toLocaleString('ar-SY')} إعلان مطابق · مرتبة حسب {sortLabel(filters.sort)}</p>}</div>
    {loading ? <SkeletonGrid count={6} label="جاري تحميل الإعلانات"/> : products.length ? <section className={styles.grid} aria-label="الإعلانات المنشورة">{products.map((product) => <Surface as="article" className={styles.card} key={product.id}>
      <Link className={styles.image} href={`/store/products/${product.id}`} aria-label={`عرض ${product.titleAr}`}>{product.imageUrl ? <img src={product.imageUrl} alt={`صورة ${product.titleAr}`}/> : <span aria-hidden="true">خ</span>}</Link>
      <div className={styles.cardTop}><span className={styles.availability} data-available={product.availability === 'in_stock'}>{availabilityLabel(product.availability)}</span><span className={styles.verified}><PlatformIcon name="check" size={14}/>نشاط موثّق</span></div>
      <p className={styles.seller}>{product.businessName ?? 'نشاط على خدمة'}</p>
      <div className={styles.meta}><span><PlatformIcon name="pin" size={14}/>{cityLabel(product.cityCode ?? '', cities)}</span><time dateTime={product.createdAt}>نُشر {publishedAt(product.createdAt)}</time></div>
      <h2>{product.titleAr}</h2><strong className={styles.price}>{product.price.toLocaleString('ar-SY')} {product.currency}</strong>
      <ActionLink href={`/store/products/${product.id}`}>التفاصيل والتواصل <PlatformIcon name="arrow" size={16}/></ActionLink>
    </Surface>)}</section> : <div className={styles.emptyWrap}><EmptyState icon={<PlatformIcon name="storefront" size={34}/>} title={hasFilters ? 'لا توجد إعلانات بهذه المواصفات' : 'لم تُنشر إعلانات معتمدة بعد'} description={hasFilters ? 'غيّر بعض خيارات البحث أو وسّع المدينة ونطاق السعر للوصول إلى نتائج أكثر.' : 'ستظهر هنا الإعلانات المنشورة من الأنشطة الموثّقة فور اعتمادها.'} actions={<>{hasFilters && <ActionButton type="button" variant="secondary" onClick={clear}><PlatformIcon name="refresh" size={17}/>عرض جميع الإعلانات</ActionButton>}<ActionLink href="/categories" variant="secondary">استكشف الأنشطة</ActionLink></>} /></div>}
    </section>
  </PageShell>;
}

function validatePriceRange(filters: StoreFilters): string {
  if ((filters.minPrice !== '' || filters.maxPrice !== '' || filters.sort !== 'newest') && !filters.currency) return 'اختر العملة قبل تحديد السعر أو ترتيب النتائج حسبه.';
  const min = filters.minPrice === '' ? undefined : Number(filters.minPrice);
  const max = filters.maxPrice === '' ? undefined : Number(filters.maxPrice);
  if (min !== undefined && (!Number.isFinite(min) || min < 0)) return 'الحد الأدنى للسعر غير صالح.';
  if (max !== undefined && (!Number.isFinite(max) || max < 0)) return 'الحد الأعلى للسعر غير صالح.';
  if (min !== undefined && max !== undefined && min > max) return 'يجب ألا يتجاوز الحد الأدنى الحد الأعلى للسعر.';
  return '';
}

function countAdvancedFilters(filters: StoreFilters): number {
  return [filters.availability, filters.currency, filters.minPrice, filters.maxPrice, filters.sort !== 'newest'].filter(Boolean).length;
}

function hasAdvancedFilters(filters: StoreFilters): boolean {
  return countAdvancedFilters(filters) > 0;
}

function readFilters(query: URLSearchParams): StoreFilters {
  const currency = readCurrency(query.get('currency'));
  const requestedSort = readSort(query.get('sort'));
  return {
    q: query.get('q')?.trim() ?? '',
    categoryCode: query.get('categoryCode')?.trim() ?? '',
    cityCode: query.get('cityCode')?.trim() ?? '',
    availability: readAvailability(query.get('availability')),
    currency,
    minPrice: currency ? readPrice(query.get('minPrice')) : '',
    maxPrice: currency ? readPrice(query.get('maxPrice')) : '',
    sort: currency ? requestedSort : 'newest'
  };
}

function readAvailability(value: string | null): StoreAvailability {
  return value === 'in_stock' || value === 'out_of_stock' || value === 'made_to_order' ? value : '';
}

function readCurrency(value: string | null): StoreCurrency {
  return value === 'SYP' || value === 'USD' ? value : '';
}

function readSort(value: string | null): StoreSort {
  return value === 'price_asc' || value === 'price_desc' ? value : 'newest';
}

function readPrice(value: string | null): string {
  if (!value) return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999999999999 ? String(parsed) : '';
}
