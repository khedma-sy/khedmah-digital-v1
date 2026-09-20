'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, type PublicBusinessProfile, type PublicProfessionalProfile, type PublicServiceListing } from '../../lib/api-client';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { useCategories } from '../../lib/use-categories';
import { readSearchState, searchHref, searchPagination, searchStateKey, type SearchTab } from '../../lib/search-context';
import { mapHref } from '../../lib/map-context';
import { PlatformIcon } from '../components/platform-icon';
import { CategorySelectOptions } from '../components/category-select-options';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import styles from '../discovery.module.css';

const tabs: [SearchTab, string][] = [['all', 'الأنشطة والخدمات'], ['business', 'الأنشطة'], ['professional', 'المهنيون'], ['service', 'الخدمات']];
const priceLabel = (type: string) => type === 'fixed' ? 'سعر ثابت' : type === 'hourly' ? 'بالساعة' : 'قابل للتفاوض';
const availabilityLabel = (value: string) => value === 'available' ? 'متاح' : value === 'busy' ? 'مشغول' : 'حسب الموعد';

function paginationPages(current: number, totalPages: number) {
  const visibleCount = Math.min(totalPages, 7);
  const half = Math.floor(visibleCount / 2);
  const start = Math.max(1, Math.min(current - half, totalPages - visibleCount + 1));
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}

function SearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const applied = readSearchState(params);
  const { q: appliedQuery, cityCode: appliedCity, categoryCode: appliedCategory, tab, page, requested } = applied;
  const requestKey = searchStateKey(applied);
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const { categories, isLoading: categoriesLoading, error: categoriesError, retry: retryCategories } = useCategories();
  // Draft fields never change the filters belonging to already displayed results.
  const [q, setQ] = useState(appliedQuery);
  const [cityCode, setCityCode] = useState(appliedCity);
  const [categoryCode, setCategoryCode] = useState(appliedCategory);
  const [retryCount, setRetryCount] = useState(0);
  const [requestLoading, setRequestLoading] = useState(false);
  const sequence = useRef(0);
  const currentKey = useRef(requestKey);
  currentKey.current = requestKey;
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const isNavigating = pendingKey !== null && pendingKey !== requestKey;
  const [result, setResult] = useState<{
    key: string; businesses: PublicBusinessProfile[]; professionals: PublicProfessionalProfile[];
    services: PublicServiceListing[]; total: number; error: string;
  }>({ key: '', businesses: [], professionals: [], services: [], total: 0, error: '' });
  const { businesses, professionals, services, total } = result;
  const rawCity = appliedCity;
  const invalidCity = !!rawCity && !citiesLoading && !citiesError && !canonicalCityCode(rawCity, cities);
  const invalidCategory = !!appliedCategory && !categoriesLoading && !categoriesError
    && !categories.some(({ code }) => code === appliedCategory);
  const waitingForMetadata = (!!appliedCity && citiesLoading) || (!!appliedCategory && categoriesLoading);
  const validationError = appliedCity && citiesError ? 'تعذر التحقق من المدينة المحددة. أعد تحميل المدن دون تغيير اختيارك.'
    : invalidCity ? 'المدينة المحددة غير متاحة. اختر مدينة أخرى أو امسح عوامل البحث.'
    : appliedCategory && categoriesError ? 'تعذر التحقق من التصنيف المحدد. أعد تحميل التصنيفات دون تغيير اختيارك.'
    : invalidCategory ? 'التصنيف المحدد غير متاح. اختر تصنيفاً آخر أو امسح عوامل البحث.' : '';
  const isLoading = isNavigating || (requested && !validationError && (waitingForMetadata || requestLoading || result.key !== requestKey));
  const error = isNavigating ? '' : validationError || (result.key === requestKey ? result.error : '');
  const searched = requested && !isNavigating && !waitingForMetadata && !error && result.key === requestKey;

  useEffect(() => { setPendingKey(null); }, [requestKey]);

  useEffect(() => {
    setQ(appliedQuery); setCityCode(appliedCity); setCategoryCode(appliedCategory);
  }, [appliedQuery, appliedCity, appliedCategory, tab, page, requested]);

  const rawTab = params.get('type');
  const legacyCategory = params.get('category');
  const canonicalCategory = params.get('categoryCode');
  const normalizationHref = (legacyCategory !== null || (rawTab && rawTab !== tab)
    || (tab === 'professional' && canonicalCategory !== null)) ? searchHref(applied, params) : '';
  useEffect(() => {
    // Spelling-only cleanup does not create history or restart an identical query.
    if (normalizationHref) router.replace(normalizationHref, { scroll: false });
  }, [normalizationHref, router]);

  useEffect(() => {
    const requestId = ++sequence.current;
    const active = () => requestId === sequence.current && requestKey === currentKey.current;
    if (!requested || waitingForMetadata || validationError || isNavigating) {
      setRequestLoading(false);
      return () => { sequence.current += 1; };
    }
    setRequestLoading(true);
    const next = { q: appliedQuery, cityCode: appliedCity, categoryCode: appliedCategory, tab, page };
    // The applied URL is the sole request owner; buttons only navigate or retry.
    async function runSearch() {
      try {
        let nextBusinesses: PublicBusinessProfile[] = [];
        let nextProfessionals: PublicProfessionalProfile[] = [];
        let nextServices: PublicServiceListing[] = [];
        let nextTotal = 0;
        if (next.tab === 'professional') {
          const data = await api.professionals.search({ q: next.q || undefined, cityCode: next.cityCode || undefined, page: next.page });
          nextProfessionals = data.professionals;
        } else if (next.tab === 'service') {
          const data = await api.services.search({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, page: next.page });
          nextServices = data.services; nextTotal = data.total;
        } else if (next.tab === 'business') {
          const data = await api.businesses.search({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, page: next.page });
          nextBusinesses = data.businesses; nextTotal = data.total;
        } else {
          const data = await api.search.query({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, page: next.page, type: 'all' });
          nextBusinesses = data.businesses; nextServices = data.services; nextTotal = data.total;
        }
        if (!active()) return;
        setResult({ key: requestKey, businesses: nextBusinesses, professionals: nextProfessionals, services: nextServices, total: nextTotal, error: '' });
      } catch (cause) {
        if (active()) setResult({ key: requestKey, businesses: [], professionals: [], services: [], total: 0,
          error: cause instanceof Error ? cause.message : 'تعذر إكمال البحث.' });
      } finally {
        if (active()) setRequestLoading(false);
      }
    }
    void runSearch();
    return () => { sequence.current += 1; };
  }, [appliedQuery, appliedCity, appliedCategory, tab, page, requested, requestKey, waitingForMetadata, validationError, isNavigating, retryCount]);

  function syncUrl(nextState: { q: string; cityCode: string; categoryCode: string; tab: SearchTab; page: number }) {
    const href = searchHref(nextState, params);
    const target = readSearchState(new URLSearchParams(href.split('?')[1]));
    sequence.current += 1;
    setPendingKey(searchStateKey(target));
    if (searchStateKey(target) === requestKey) {
      if (`/search?${params}` !== href) router.replace(href, { scroll: false });
      setRetryCount((value) => value + 1);
    } else router.push(href, { scroll: false });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    syncUrl({ q, cityCode, categoryCode: tab === 'professional' ? '' : categoryCode, tab, page: 1 });
  }
  function changeTab(nextTab: SearchTab) {
    const nextCategoryCode = nextTab === 'professional' ? '' : categoryCode;
    syncUrl({ q, cityCode, categoryCode: nextCategoryCode, tab: nextTab, page: 1 });
  }
  function clear() {
    sequence.current += 1;
    setPendingKey(searchStateKey(readSearchState(new URLSearchParams())));
    setQ(''); setCityCode(''); setCategoryCode('');
    router.push('/search', { scroll: false });
  }
  function goToPage(nextPage: number) {
    // Pagination belongs to the applied filters, not unsubmitted edits.
    syncUrl({ q: appliedQuery, cityCode: appliedCity, categoryCode: appliedCategory, tab, page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const categoryName = (code: string) => categories.find((item) => item.code === code)?.nameAr
    ?? businesses.find((item) => item.categoryCode === code)?.categoryNameAr
    ?? services.find((item) => item.categoryCode === code)?.categoryNameAr
    ?? 'تصنيف محفوظ سابقاً';
  const { totalPages, canNext } = searchPagination(tab, page, total, {
    businesses: businesses.length, services: services.length, professionals: professionals.length
  });
  const visiblePages = totalPages === null ? [] : paginationPages(page, totalPages);
  const noResults = !businesses.length && !professionals.length && !services.length;

  return <PageShell className={styles.page} label="اكتشاف الخدمات">
    <PageHeader title="اكتشف الخدمة المناسبة" description="ابحث في الأنشطة والخدمات والمهنيين بالكلمة والمنطقة، وصفِّ الأنشطة والخدمات بالتصنيف." actions={<ActionLink href={mapHref(applied)} variant="secondary"><PlatformIcon name="pin" size={17}/> الأنشطة على الخريطة</ActionLink>} />
    <Surface as="div"><form className={styles.form} onSubmit={submit} role="search" aria-label="البحث في خدمة" aria-busy={isLoading}>
      <div className={styles.field}><label htmlFor="q">ما الخدمة التي تحتاجها؟</label><input id="q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مثال: طبيب أسنان، نجار، مطعم" /></div>
      <div className={styles.field}><label htmlFor="city">المدينة</label><select id="city" value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setCityCode(event.target.value)}><option value="">كل المدن</option>{cityCode && !cities.some((city) => city.code === cityCode) && <option value={cityCode}>المدينة المحددة (غير متاحة حالياً)</option>}{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></div>
      {tab !== 'professional' && <div className={styles.field}><label htmlFor="category">التصنيف</label><select id="category" value={categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setCategoryCode(event.target.value)}><option value="">كل التصنيفات</option>{categoryCode && !categories.some((category) => category.code === categoryCode) && <option value={categoryCode}>التصنيف المحدد (غير متاح حالياً)</option>}<CategorySelectOptions categories={categories} /></select></div>}
      <div className={styles.formActions}><ActionButton type="submit" disabled={isLoading}><PlatformIcon name="search" size={17}/>{isLoading ? 'جاري البحث' : 'بحث'}</ActionButton>{(q || cityCode || categoryCode) && <ActionButton type="button" variant="secondary" onClick={clear}>مسح</ActionButton>}</div>
    </form></Surface>
    {citiesError && <StatusMessage tone="danger">{citiesError} <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></StatusMessage>}
    {tab === 'professional' && <StatusMessage>بحث المهنيين متاح بالكلمة والمدينة. تصنيف النشاط مخصص حالياً للأنشطة والخدمات.</StatusMessage>}
    {tab !== 'professional' && categoriesError && <StatusMessage tone="danger">تعذر تحميل التصنيفات. <button type="button" onClick={() => void retryCategories()}>إعادة المحاولة</button></StatusMessage>}
    <div className={styles.tabs} role="tablist" aria-label="نوع النتائج">{tabs.map(([value,label]) => <button key={value} className={styles.tab} role="tab" aria-selected={tab === value} onClick={() => changeTab(value)}>{label}</button>)}</div>
    {error && <div role="alert"><StatusMessage tone="danger">{error} {!validationError && <ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</ActionButton>}</StatusMessage></div>}
    {isLoading && <SkeletonGrid count={6} label="جاري البحث في الأنشطة والخدمات" />}
    {!isLoading && searched && <><p className={styles.resultSummary} aria-live="polite">{tab === 'professional' ? `${professionals.length} نتيجة في هذه الصفحة — الصفحة ${page}` : total ? `${total} نتيجة مطابقة${page > 1 ? ` — الصفحة ${page}` : ''}` : 'لم نعثر على نتيجة مطابقة'}</p>
      {businesses.length > 0 && <ResultSection title={tab === 'all' ? 'الأنشطة' : undefined}>{businesses.map((item) => <Surface as="article" className={styles.card} key={item.id}><div className={styles.cardTop}><h3>{item.name}</h3><span className={styles.badge}><PlatformIcon name="check" size={14}/>{item.trustStatus === 'approved' ? 'معتمد' : 'قيد المراجعة'}</span></div><p className={styles.meta}>{categoryName(item.categoryCode)} · {cityLabel(item.cityCode,cities)}</p>{item.descriptionAr && <p className={styles.description}>{item.descriptionAr}</p>}<div className={styles.cardAction}><ActionLink href={`/business-profiles/${encodeURIComponent(item.id)}`}>عرض النشاط <PlatformIcon name="arrow" size={16}/></ActionLink></div></Surface>)}</ResultSection>}
      {professionals.length > 0 && <ResultSection title="المهنيون">{professionals.map((item) => <Surface as="article" className={styles.card} key={item.id}><div className={styles.cardTop}><h3>{item.headlineAr}</h3><span className={styles.badge}>{availabilityLabel(item.availability)}</span></div><p className={styles.meta}><PlatformIcon name="pin" size={14}/> {cityLabel(item.cityCode,cities)}</p><div className={styles.tags}>{item.skills.slice(0,4).map((skill) => <span className={styles.tag} key={skill}>{skill}</span>)}</div><div className={styles.cardAction}><ActionLink href={`/professional-profiles/${encodeURIComponent(item.id)}`}>عرض الملف <PlatformIcon name="arrow" size={16}/></ActionLink></div></Surface>)}</ResultSection>}
      {services.length > 0 && <ResultSection title={tab === 'all' ? 'الخدمات' : undefined}>{services.map((s) => <Surface as="article" className={styles.card} key={s.id}><div className={styles.cardTop}><h3>{s.titleAr}</h3><span className={styles.badge}>{priceLabel(s.priceType)}</span></div><p className={styles.meta}>{categoryName(s.categoryCode)}</p>{s.descriptionAr && <p className={styles.description}>{s.descriptionAr}</p>}{s.price != null && <p className={styles.price}>{s.price.toLocaleString('ar-SY')} {s.priceCurrency ?? 'SYP'}</p>}<div className={styles.cardAction}><ActionLink href={s.ownerType === 'business' ? `/business-profiles/${encodeURIComponent(s.ownerId)}` : `/professional-profiles/${encodeURIComponent(s.ownerId)}`}>عرض مقدم الخدمة <PlatformIcon name="arrow" size={16}/></ActionLink></div></Surface>)}</ResultSection>}
      {noResults && <EmptyState icon={<PlatformIcon name="search" size={38}/>} title="لا توجد نتائج مطابقة" description={tab === 'professional' ? 'جرّب كلمة أخرى أو وسّع المدينة.' : 'جرّب كلمة أخرى أو وسّع المدينة والتصنيف.'} actions={<ActionButton type="button" variant="secondary" onClick={clear}>مسح عوامل البحث</ActionButton>} />}
      {(page > 1 || canNext) && <nav className={styles.pagination} aria-label="صفحات النتائج"><button disabled={page <= 1} onClick={() => goToPage(page-1)}>السابق</button>{totalPages === null && <span>الصفحة {page.toLocaleString('ar-SY')}</span>}{visiblePages.map((value)=><button key={value} aria-current={value===page?'page':undefined} onClick={()=>goToPage(value)}>{value}</button>)}<button disabled={!canNext} onClick={() => goToPage(page+1)}>التالي</button></nav>}
    </>}
    {!requested && !isLoading && <EmptyState icon={<PlatformIcon name="search" size={38}/>} title="كل ما تحتاجه أقرب إليك" description={tab === 'professional' ? 'ابدأ بكلمة بحث أو اختر مدينة لاستعراض المهنيين.' : 'ابدأ بكلمة بحث، أو اختر مدينة وتصنيفاً لاستعراض الأنشطة والخدمات المنشورة.'} actions={tab === 'professional' ? undefined : <ActionLink href="/categories" variant="secondary">استكشف التصنيفات</ActionLink>} />}
  </PageShell>;
}
function ResultSection({ title, children }: { title?: string; children: ReactNode }) { return <section className={styles.section}>{title && <h2>{title}</h2>}<div className={styles.grid}>{children}</div></section>; }
export default function SearchPage() { return <Suspense fallback={<PageShell className={styles.page}><SkeletonGrid count={6}/></PageShell>}><SearchContent/></Suspense>; }
