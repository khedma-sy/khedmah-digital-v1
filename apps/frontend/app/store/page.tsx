'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import type { ProductListing } from '../../lib/api-client';
import { listStoreProducts, type StoreProductSort } from '../../lib/store-public-client';
import { useCategories } from '../../lib/use-categories';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { HierarchicalCategoryFilter } from '../components/hierarchical-category-filter';
import { ActionButton, ActionLink, EmptyState, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon, type PlatformIconName } from '../components/platform-icon';
import styles from './store.module.css';

type StoreCurrency = '' | ProductListing['currency'];
type StoreAvailability = '' | ProductListing['availability'];
type StoreFilters = {
  q: string;
  categoryCode: string;
  cityCode: string;
  availability: StoreAvailability;
  currency: StoreCurrency;
  minPrice: string;
  maxPrice: string;
  sort: StoreProductSort;
};
const EMPTY_FILTERS: StoreFilters = { q: '', categoryCode: '', cityCode: '', availability: '', currency: '', minPrice: '', maxPrice: '', sort: 'newest' };
const availabilityLabel = (value: ProductListing['availability']) => value === 'in_stock' ? 'متوفر' : value === 'made_to_order' ? 'حسب الطلب' : 'غير متوفر';
const sortLabel = (value: StoreProductSort) => value === 'price_asc' ? 'السعر من الأقل' : value === 'price_desc' ? 'السعر من الأعلى' : 'الأحدث';
const publishedAt = (value: string) => new Date(value).toLocaleDateString('ar-SY-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });

function StoreContent() {
  const router = useRouter();
  const params = useSearchParams();
  const basePath = '/store';
  const applied = readFilters(params);
  const requestKey = JSON.stringify([basePath, applied.q, applied.categoryCode, applied.cityCode, applied.availability, applied.currency, applied.minPrice, applied.maxPrice, applied.sort]);
  const currentKey = useRef(requestKey);
  currentKey.current = requestKey;
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [filters, setFilters] = useState<StoreFilters>(applied);
  const [filtersOpen, setFiltersOpen] = useState(hasAdvancedFilters(applied));
  const [result, setResult] = useState<{ key: string; products: ProductListing[]; error: string }>({ key: '', products: [], error: '' });
  const [requestLoading, setRequestLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const sequence = useRef(0);
  const isNavigating = pendingKey !== null && pendingKey !== requestKey;
  const waitingForMetadata = (!!applied.cityCode && citiesLoading) || (!!applied.categoryCode && categoriesLoading);
  const priceValidationError = validatePriceRange(applied);
  const validationError = priceValidationError || (applied.cityCode && citiesError ? 'تعذر التحقق من المدينة المحددة. أعد تحميل المدن دون تغيير اختيارك.'
    : applied.cityCode && !citiesLoading && !canonicalCityCode(applied.cityCode, cities) ? 'المدينة المحددة غير متاحة. عدّل المدينة أو امسح عوامل البحث.'
    : applied.categoryCode && categoriesError ? 'تعذر التحقق من التصنيف المحدد. أعد تحميل التصنيفات دون تغيير اختيارك.'
    : applied.categoryCode && !categoriesLoading && !categories.some(item => item.code === applied.categoryCode) ? 'التصنيف المحدد غير متاح. عدّل التصنيف أو امسح عوامل البحث.' : '');
  const error = isNavigating ? '' : validationError || (result.key === requestKey ? result.error : '');
  const loading = isNavigating || (!validationError && (waitingForMetadata || requestLoading || result.key !== requestKey));
  const products = !loading && !error && result.key === requestKey ? result.products : [];

  useEffect(() => {
    setFilters(applied);
    setFiltersOpen(hasAdvancedFilters(applied));
    setPendingKey(null);
    // requestKey is the stable serialization of applied filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const loaded = await listStoreProducts({
          q: applied.q || undefined,
          categoryCode: applied.categoryCode || undefined,
          cityCode: applied.cityCode || undefined,
          availability: applied.availability || undefined,
          currency: applied.currency || undefined,
          minPrice: applied.minPrice === '' ? undefined : Number(applied.minPrice),
          maxPrice: applied.maxPrice === '' ? undefined : Number(applied.maxPrice),
          sort: applied.sort
        });
        if (active()) setResult({ key: requestKey, products: loaded, error: '' });
      } catch (cause) {
        if (active()) setResult({ key: requestKey, products: [], error: cause instanceof Error ? cause.message : 'تعذر تحميل المنتجات.' });
      } finally { if (active()) setRequestLoading(false); }
    }
    void load();
    return () => { sequence.current += 1; };
  }, [requestKey, waitingForMetadata, validationError, isNavigating, retryCount]);

  function syncUrl(next: StoreFilters) {
    const normalized = normalizeFilters(next);
    const query = new URLSearchParams();
    if (normalized.q) query.set('q', normalized.q);
    if (normalized.categoryCode) query.set('categoryCode', normalized.categoryCode);
    if (normalized.cityCode) query.set('cityCode', normalized.cityCode);
    if (normalized.availability) query.set('availability', normalized.availability);
    if (normalized.currency) query.set('currency', normalized.currency);
    if (normalized.minPrice !== '') query.set('minPrice', normalized.minPrice);
    if (normalized.maxPrice !== '') query.set('maxPrice', normalized.maxPrice);
    if (normalized.sort !== 'newest') query.set('sort', normalized.sort);
    const href = query.size ? `${basePath}?${query}` : basePath;
    const targetKey = JSON.stringify([basePath, normalized.q, normalized.categoryCode, normalized.cityCode, normalized.availability, normalized.currency, normalized.minPrice, normalized.maxPrice, normalized.sort]);
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

  function search(event: FormEvent) {
    event.preventDefault();
    const filterError = validatePriceRange(filters);
    if (filterError) { setResult({ key: requestKey, products: [], error: filterError }); return; }
    syncUrl(filters);
  }
  function clearFilters() { setFilters(EMPTY_FILTERS); setFiltersOpen(false); syncUrl(EMPTY_FILTERS); }
  function changeCurrency(currency: StoreCurrency) {
    setFilters((current) => currency ? { ...current, currency } : { ...current, currency: '', minPrice: '', maxPrice: '', sort: 'newest' });
  }
  function browseCategory(categoryCode: string) {
    const next = { ...filters, categoryCode };
    setFilters(next);
    syncUrl(next);
  }

  const hasFilters = Boolean(filters.q || filters.categoryCode || filters.cityCode || filters.availability || filters.currency || filters.minPrice || filters.maxPrice || filters.sort !== 'newest'
    || applied.q || applied.categoryCode || applied.cityCode || applied.availability || applied.currency || applied.minPrice || applied.maxPrice || applied.sort !== 'newest');
  const advancedFilterCount = countAdvancedFilters(filters);
  const rootCategories = categories.filter((category) => !category.parentCode).slice(0, 8);

  return <PageShell className={styles.page} label="متجر خدمة">
    <section className={styles.marketplace}>
      <header className={styles.hero}>
        <div className={styles.marketBrand}><span>متجر</span><strong>خدمة</strong></div>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>منتجات من أنشطة موثّقة</span>
          <h1>ابحث. قارن. تواصل.</h1>
          <p>استكشف المنتجات المحلية حسب التصنيف والمدينة والسعر، ثم تواصل مباشرة مع النشاط.</p>
        </div>
        <nav className={styles.heroActions} aria-label="إجراءات متجر خدمة">
          <ActionLink href="/store/manage" variant="secondary"><PlatformIcon name="storefront" size={17}/>منتجاتي</ActionLink>
          <ActionLink href="/store/sell"><PlatformIcon name="cart" size={17}/>أضف منتجًا</ActionLink>
        </nav>
      </header>

      <Surface className={styles.discoveryPanel}><form className={styles.toolbar} onSubmit={search} role="search" aria-label="البحث في المتجر" aria-busy={loading}>
        <div className={styles.searchBlock}>
          <label htmlFor="store-search">ماذا تبحث عنه؟</label>
          <div className={styles.searchControl}>
            <PlatformIcon name="search" size={20}/>
            <input id="store-search" type="search" autoComplete="off" value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="مثال: أثاث، هاتف أو مواد بناء"/>
            <ActionButton type="submit" disabled={loading}>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>
          </div>
        </div>
        <div className={styles.primaryFilters} aria-label="تحديد المجال والموقع">
          <HierarchicalCategoryFilter categories={categories} value={filters.categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(categoryCode) => setFilters((value) => ({ ...value, categoryCode }))}/>
          <label className={styles.field}>المدينة<select value={filters.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setFilters((value) => ({ ...value, cityCode: event.target.value }))}><option value="">كل المدن</option>{filters.cityCode && !cities.some(item => item.code === filters.cityCode) && <option value={filters.cityCode}>المدينة المحددة (غير متاحة حالياً)</option>}{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
        </div>
        <div className={styles.filterControls}>
          <button className={styles.filterToggle} type="button" aria-expanded={filtersOpen} aria-controls="store-advanced-filters" onClick={() => setFiltersOpen((open) => !open)}><PlatformIcon name="filter" size={17}/>خيارات إضافية{advancedFilterCount > 0 && <span>{advancedFilterCount.toLocaleString('ar-SY-u-nu-latn')}</span>}</button>
          {hasFilters && <button className={styles.clearButton} type="button" onClick={clearFilters}><PlatformIcon name="refresh" size={16}/>مسح الاختيارات</button>}
        </div>
        <div id="store-advanced-filters" className={styles.secondaryFilters} data-open={filtersOpen} aria-label="مرشحات المنتج والسعر">
          <label className={styles.field}>التوفر<select value={filters.availability} onChange={(event) => setFilters((value) => ({ ...value, availability: event.target.value as StoreAvailability }))}><option value="">كل الحالات</option><option value="in_stock">متوفر</option><option value="made_to_order">حسب الطلب</option><option value="out_of_stock">غير متوفر</option></select></label>
          <label className={styles.field}>العملة<select value={filters.currency} onChange={(event) => changeCurrency(event.target.value as StoreCurrency)}><option value="">كل العملات</option><option value="SYP">ليرة سورية</option><option value="USD">دولار أمريكي</option></select></label>
          <label className={styles.field}>السعر من<input type="number" min="0" step="0.01" inputMode="decimal" value={filters.minPrice} disabled={!filters.currency} onChange={(event) => setFilters((value) => ({ ...value, minPrice: event.target.value }))} placeholder={filters.currency ? 'الحد الأدنى' : 'اختر العملة'}/></label>
          <label className={styles.field}>السعر إلى<input type="number" min="0" step="0.01" inputMode="decimal" value={filters.maxPrice} disabled={!filters.currency} onChange={(event) => setFilters((value) => ({ ...value, maxPrice: event.target.value }))} placeholder={filters.currency ? 'الحد الأعلى' : 'اختر العملة'}/></label>
          <label className={styles.field}>الترتيب<select value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value as StoreProductSort }))}><option value="newest">الأحدث</option><option value="price_asc" disabled={!filters.currency}>السعر: الأقل أولًا</option><option value="price_desc" disabled={!filters.currency}>السعر: الأعلى أولًا</option></select></label>
        </div>
      </form></Surface>

      <nav className={styles.categoryRail} aria-label="تصفح المنتجات حسب التصنيف">
        <button type="button" data-active={!filters.categoryCode} onClick={() => browseCategory('')}><PlatformIcon name="grid" size={19}/><span>الكل</span></button>
        {rootCategories.map((category, index) => <button key={category.code} type="button" data-active={filters.categoryCode === category.code} data-tone={index % 3} onClick={() => browseCategory(category.code)}><PlatformIcon name={categoryIcon(index)} size={19}/><span>{category.nameAr}</span></button>)}
        <Link href="/categories"><PlatformIcon name="arrow" size={18}/><span>كل التصنيفات</span></Link>
      </nav>

      <div className={styles.trustLine} aria-label="مزايا متجر خدمة">
        <span><PlatformIcon name="check" size={15}/>أنشطة موثّقة</span>
        <span><PlatformIcon name="pin" size={15}/>نتائج حسب مدينتك</span>
        <span><PlatformIcon name="phone" size={15}/>تواصل مباشر</span>
      </div>
    </section>

    {categoriesError && <StatusMessage tone="warning">{categoriesError} <ActionButton type="button" variant="secondary" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton></StatusMessage>}
    {citiesError && <StatusMessage tone="warning">{citiesError} <ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton></StatusMessage>}
    {error && <StatusMessage tone="danger">{error}{!validationError && <ActionButton type="button" variant="secondary" onClick={() => setRetryCount(value => value + 1)}>إعادة تحميل المنتجات</ActionButton>}</StatusMessage>}

    <section className={styles.results} aria-labelledby="store-results-title">
      <div className={styles.resultsHeading}><div><span>نتائج موثوقة</span><h2 id="store-results-title">المنتجات المتاحة</h2></div>{!loading && products.length > 0 && <p className={styles.summary} aria-live="polite">{products.length.toLocaleString('ar-SY-u-nu-latn')} منتج مطابق · مرتبة حسب {sortLabel(applied.sort)}</p>}</div>
      {loading ? <SkeletonGrid count={6} label="جاري تحميل المنتجات"/> : error ? null : products.length ? <section className={styles.grid} aria-label="المنتجات المنشورة">{products.map((product) => <Surface as="article" className={styles.card} key={product.id}>
        <Link className={styles.image} href={`/store/products/${encodeURIComponent(product.id)}`} aria-label={`عرض ${product.titleAr}`}>{product.imageUrl ? <img src={product.imageUrl} alt={`صورة ${product.titleAr}`}/> : <span aria-hidden="true">خ</span>}</Link>
        <div className={styles.cardTop}><span className={styles.availability} data-available={product.availability === 'in_stock'}>{availabilityLabel(product.availability)}</span><span className={styles.verified}><PlatformIcon name="check" size={14}/>نشاط موثّق</span></div>
        <h2>{product.titleAr}</h2><strong className={styles.price}>{product.price.toLocaleString('ar-SY-u-nu-latn')} {product.currency}</strong>
        <p className={styles.seller}>{product.businessName ?? 'نشاط على خدمة'}</p>
        <div className={styles.meta}><span><PlatformIcon name="pin" size={14}/>{cityLabel(product.cityCode ?? '', cities)}</span><time dateTime={product.createdAt}>نُشر {publishedAt(product.createdAt)}</time></div>
        <ActionLink href={`/store/products/${encodeURIComponent(product.id)}`}>التفاصيل والتواصل <PlatformIcon name="arrow" size={16}/></ActionLink>
      </Surface>)}</section> : <div className={styles.emptyWrap}><EmptyState icon={<PlatformIcon name="storefront" size={30}/>} title={hasFilters ? 'لا توجد منتجات مطابقة' : 'كن أول من يعرض منتجًا في متجر خدمة'} description={hasFilters ? 'وسّع نطاق البحث أو امسح الاختيارات لعرض نتائج أكثر.' : 'ستظهر هنا المنتجات بعد اعتماد النشاط والمحتوى.'} actions={hasFilters ? <ActionButton type="button" variant="secondary" onClick={clearFilters}><PlatformIcon name="refresh" size={17}/>عرض كل المنتجات</ActionButton> : <ActionLink href="/store/sell"><PlatformIcon name="cart" size={17}/>أضف منتجًا</ActionLink>}/></div>}
      <p className={styles.safety}><PlatformIcon name="info" size={15}/>تحقق من المنتج وتفاصيله قبل الدفع أو الاستلام. لا توجد مدفوعات أو طلبات شراء داخل متجر خدمة حاليًا.</p>
    </section>
  </PageShell>;
}

function normalizeFilters(filters: StoreFilters): StoreFilters {
  return { ...filters, q: filters.q.trim(), categoryCode: filters.categoryCode.trim(), cityCode: filters.cityCode.trim(), minPrice: filters.minPrice.trim(), maxPrice: filters.maxPrice.trim() };
}
function validatePriceRange(filters: StoreFilters): string {
  if ((filters.minPrice !== '' || filters.maxPrice !== '' || filters.sort !== 'newest') && !filters.currency) return 'اختر العملة قبل تحديد السعر أو ترتيب النتائج حسبه.';
  const min = filters.minPrice === '' ? undefined : Number(filters.minPrice);
  const max = filters.maxPrice === '' ? undefined : Number(filters.maxPrice);
  if (min !== undefined && (!Number.isFinite(min) || min < 0)) return 'الحد الأدنى للسعر غير صالح.';
  if (max !== undefined && (!Number.isFinite(max) || max < 0)) return 'الحد الأعلى للسعر غير صالح.';
  if (min !== undefined && max !== undefined && min > max) return 'الحد الأدنى للسعر لا يمكن أن يتجاوز الحد الأعلى.';
  return '';
}
function countAdvancedFilters(filters: StoreFilters): number {
  return Number(Boolean(filters.availability)) + Number(Boolean(filters.currency)) + Number(filters.minPrice !== '') + Number(filters.maxPrice !== '') + Number(filters.sort !== 'newest');
}
function hasAdvancedFilters(filters: StoreFilters): boolean { return countAdvancedFilters(filters) > 0; }
function readFilters(query: Pick<URLSearchParams, 'get'>): StoreFilters {
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
function readCurrency(value: string | null): StoreCurrency { return value === 'SYP' || value === 'USD' ? value : ''; }
function readAvailability(value: string | null): StoreAvailability { return value === 'in_stock' || value === 'out_of_stock' || value === 'made_to_order' ? value : ''; }
function readSort(value: string | null): StoreProductSort { return value === 'price_asc' || value === 'price_desc' ? value : 'newest'; }
function readPrice(value: string | null): string { return value && /^\d{1,12}(?:\.\d{1,2})?$/.test(value) ? value : ''; }
function categoryIcon(index: number): PlatformIconName { return (['car', 'home', 'technology', 'storefront', 'briefcase', 'building', 'leaf', 'travel'] as PlatformIconName[])[index % 8] ?? 'briefcase'; }

export default function StorePage() {
  return <Suspense fallback={<PageShell className={styles.page}><SkeletonGrid count={6} label="جاري تحميل المنتجات"/></PageShell>}><StoreContent /></Suspense>;
}
