'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { api, type PublicAdListing } from '../../lib/api-client';
import { AD_KIND_LABELS, CLASSIFIEDS_ENABLED, formatAdPrice } from '../../lib/classifieds';
import { useCategories } from '../../lib/use-categories';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { CategorySelectOptions } from '../components/category-select-options';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './classifieds.module.css';

type Filters = { q: string; categoryCode: string; cityCode: string };
const EMPTY: Filters = { q: '', categoryCode: '', cityCode: '' };

function ClassifiedsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const applied: Filters = {
    q: (params.get('q') ?? '').trim(),
    categoryCode: (params.get('categoryCode') ?? '').trim(),
    cityCode: (params.get('cityCode') ?? '').trim()
  };
  const requestKey = JSON.stringify(applied);
  const currentKey = useRef(requestKey);
  currentKey.current = requestKey;
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const [filters, setFilters] = useState<Filters>(applied);
  const [result, setResult] = useState<{ key: string; ads: PublicAdListing[]; error: string }>({ key: '', ads: [], error: '' });
  const [requestLoading, setRequestLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const sequence = useRef(0);
  const isNavigating = pendingKey !== null && pendingKey !== requestKey;
  const waitingForMetadata = (!!applied.cityCode && citiesLoading) || (!!applied.categoryCode && categoriesLoading);
  const validationError = applied.cityCode && citiesError ? 'تعذر التحقق من المدينة المحددة. أعد تحميل المدن دون تغيير اختيارك.'
    : applied.cityCode && !citiesLoading && !canonicalCityCode(applied.cityCode, cities) ? 'المدينة المحددة غير متاحة. عدّل المدينة أو امسح عوامل البحث.'
    : applied.categoryCode && categoriesError ? 'تعذر التحقق من التصنيف المحدد. أعد تحميل التصنيفات دون تغيير اختيارك.'
    : applied.categoryCode && !categoriesLoading && !categories.some((item) => item.code === applied.categoryCode) ? 'التصنيف المحدد غير متاح. عدّل التصنيف أو امسح عوامل البحث.' : '';
  const error = isNavigating ? '' : validationError || (result.key === requestKey ? result.error : '');
  const loading = isNavigating || (!validationError && (waitingForMetadata || requestLoading || result.key !== requestKey));
  const ads = !loading && !error && result.key === requestKey ? result.ads : [];

  useEffect(() => { setFilters(applied); setPendingKey(null); }, [requestKey]);

  useEffect(() => {
    const request = ++sequence.current;
    const active = () => request === sequence.current && requestKey === currentKey.current;
    if (waitingForMetadata || validationError || isNavigating) {
      setRequestLoading(false);
      return () => { sequence.current += 1; };
    }
    setRequestLoading(true);
    void api.classifieds.list({
      q: applied.q || undefined,
      categoryCode: applied.categoryCode || undefined,
      cityCode: applied.cityCode || undefined
    }).then((data) => {
      if (!Array.isArray(data.ads)) throw new Error('تعذر قراءة قائمة الإعلانات. أعد المحاولة.');
      if (active()) setResult({ key: requestKey, ads: data.ads, error: '' });
    }).catch((cause) => {
      if (active()) setResult({ key: requestKey, ads: [], error: cause instanceof Error ? cause.message : 'تعذر تحميل الإعلانات.' });
    }).finally(() => { if (active()) setRequestLoading(false); });
    return () => { sequence.current += 1; };
  }, [requestKey, waitingForMetadata, validationError, isNavigating, retryCount]);

  function syncUrl(next: Filters) {
    const q = next.q.trim();
    const categoryCode = next.categoryCode.trim();
    const cityCode = next.cityCode.trim();
    const query = new URLSearchParams();
    if (q) query.set('q', q);
    if (categoryCode) query.set('categoryCode', categoryCode);
    if (cityCode) query.set('cityCode', cityCode);
    const href = query.size ? `/classifieds?${query}` : '/classifieds';
    const targetKey = JSON.stringify({ q, categoryCode, cityCode });
    if (targetKey === requestKey) {
      if (!requestLoading) setRetryCount((value) => value + 1);
      return;
    }
    sequence.current += 1;
    setPendingKey(targetKey);
    router.push(href, { scroll: false });
  }

  function search(event: FormEvent) { event.preventDefault(); syncUrl(filters); }
  function clearFilters() { setFilters(EMPTY); syncUrl(EMPTY); }
  const hasFilters = !!(filters.q || filters.categoryCode || filters.cityCode || applied.q || applied.categoryCode || applied.cityCode);

  return <PageShell className={styles.page} label="إعلانات خدمة">
    <PageHeader eyebrow="إعلانات خدمة" title="الإعلانات المبوبة" description="اعثر على عروض وطلبات وخدمات محلية منشورة بعد المراجعة. التواصل مباشر مع المعلن، ولا توجد مدفوعات داخل هذه الصفحة." actions={<><ActionLink href="/classifieds/new">أضف إعلانًا</ActionLink><ActionLink href="/classifieds/manage" variant="secondary">إعلاناتي</ActionLink></>} />
    <Surface as="form" className={styles.toolbar} onSubmit={search} role="search" aria-label="البحث في إعلانات خدمة" aria-busy={loading}>
      <label className={styles.field}>ابحث<input name="q" value={filters.q} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} placeholder="مثال: سيارة، شقة، فني، مطلوب"/></label>
      <label className={styles.field}>التصنيف<select name="categoryCode" value={filters.categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setFilters((value) => ({ ...value, categoryCode: event.target.value }))}><option value="">كل التصنيفات</option>{filters.categoryCode && !categories.some((item) => item.code === filters.categoryCode) && <option value={filters.categoryCode}>التصنيف المحدد (غير متاح حاليًا)</option>}<CategorySelectOptions categories={categories}/></select></label>
      <label className={styles.field}>المدينة<select name="cityCode" value={filters.cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setFilters((value) => ({ ...value, cityCode: event.target.value }))}><option value="">كل المدن</option>{filters.cityCode && !cities.some((item) => item.code === filters.cityCode) && <option value={filters.cityCode}>المدينة المحددة (غير متاحة حاليًا)</option>}{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></label>
      <ActionButton type="submit" disabled={loading}><PlatformIcon name="search" size={17}/>{loading ? 'جاري البحث' : 'بحث'}</ActionButton>
      {hasFilters && <ActionButton type="button" variant="secondary" onClick={clearFilters}>مسح</ActionButton>}
    </Surface>
    {categoriesError && <StatusMessage tone="warning">{categoriesError} <ActionButton type="button" variant="secondary" onClick={() => void retryCategories()}>إعادة تحميل التصنيفات</ActionButton></StatusMessage>}
    {citiesError && <StatusMessage tone="warning">{citiesError} <ActionButton type="button" variant="secondary" onClick={() => void retryCities()}>إعادة تحميل المدن</ActionButton></StatusMessage>}
    {error && <StatusMessage tone="danger">{error}{!validationError && <ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة تحميل الإعلانات</ActionButton>}</StatusMessage>}
    {loading ? <SkeletonGrid count={6} label="جاري تحميل الإعلانات"/> : error ? null : ads.length ? <section className={styles.grid} aria-label="الإعلانات المنشورة">{ads.map((ad) => <Surface as="article" className={styles.card} key={ad.id}>
      <Link className={styles.image} href={`/classifieds/${encodeURIComponent(ad.id)}`}>{ad.imageUrls[0] ? <img src={ad.imageUrls[0]} alt={ad.titleAr}/> : <span aria-hidden="true">خ</span>}</Link>
      <div className={styles.meta}><span>{AD_KIND_LABELS[ad.kind]}</span>{ad.cityCode && <><span>·</span><span>{cityLabel(ad.cityCode, cities)}</span></>}</div>
      <h2>{ad.titleAr}</h2><strong className={styles.price}>{formatAdPrice(ad)}</strong>
      <ActionLink href={`/classifieds/${encodeURIComponent(ad.id)}`}>عرض الإعلان</ActionLink>
    </Surface>)}</section> : <EmptyState icon={<PlatformIcon name="briefcase" size={34}/>} title="لا توجد إعلانات مطابقة" description="غيّر البحث أو أضف إعلانك الأول." actions={<ActionLink href="/classifieds/new">أضف إعلانًا</ActionLink>} />}
  </PageShell>;
}

function DisabledClassifieds() {
  return <PageShell className={styles.page} label="إعلانات خدمة"><div className={styles.gate}>
    <PageHeader eyebrow="إعلانات خدمة" title="الإعلانات المبوبة" description="وحدة الإعلانات مستقلة عن متجر خدمة، ويجري تفعيلها على مراحل بعد اكتمال فحص قاعدة البيانات والمعاينة."/>
    <StatusMessage tone="warning">إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة.</StatusMessage>
  </div></PageShell>;
}

export default function ClassifiedsPage() {
  if (!CLASSIFIEDS_ENABLED) return <DisabledClassifieds/>;
  return <Suspense fallback={<PageShell className={styles.page}><SkeletonGrid count={6} label="جاري تحميل الإعلانات"/></PageShell>}><ClassifiedsContent/></Suspense>;
}
