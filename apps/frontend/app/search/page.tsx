'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, type PublicBusinessProfile, type PublicProfessionalProfile, type PublicServiceListing } from '../../lib/api-client';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { useCategories } from '../../lib/use-categories';
import { PlatformIcon } from '../components/platform-icon';
import { CategorySelectOptions } from '../components/category-select-options';
import { ServiceProductHeader } from '../components/service-product-header';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import styles from '../discovery.module.css';

type TabType = 'all' | 'business' | 'professional' | 'service';
const PAGE_SIZE = 12;
const tabs: [TabType, string][] = [['all', 'الكل'], ['business', 'الأنشطة'], ['professional', 'المهنيون'], ['service', 'الخدمات']];
const priceLabel = (type: string) => type === 'fixed' ? 'سعر ثابت' : type === 'hourly' ? 'بالساعة' : 'قابل للتفاوض';
const availabilityLabel = (value: string) => value === 'available' ? 'متاح' : value === 'busy' ? 'مشغول' : 'حسب الموعد';
const responseLabel = (minutes?: number) => minutes === undefined ? undefined : minutes < 60 ? `يرد عادة خلال ${minutes} دقيقة` : `يرد عادة خلال ${Math.ceil(minutes / 60)} ساعة`;

function SearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { cities, isLoading: citiesLoading, error: citiesError, retry: retryCities } = useSyrianCities();
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cityCode, setCityCode] = useState(params.get('cityCode') ?? '');
  const [categoryCode, setCategoryCode] = useState(params.get('categoryCode') ?? '');
  const [tab, setTab] = useState<TabType>((params.get('type') as TabType) ?? 'all');
  const [page, setPage] = useState(Math.max(1, Number(params.get('page')) || 1));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [professionals, setProfessionals] = useState<PublicProfessionalProfile[]>([]);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [total, setTotal] = useState(0);

  function syncUrl(nextState = { q, cityCode, categoryCode, tab, page }) {
    const next = new URLSearchParams();
    if (nextState.q) next.set('q', nextState.q);
    if (nextState.cityCode) next.set('cityCode', nextState.cityCode);
    if (nextState.categoryCode && nextState.tab !== 'professional') next.set('categoryCode', nextState.categoryCode);
    if (nextState.tab !== 'all') next.set('type', nextState.tab);
    if (nextState.page > 1) next.set('page', String(nextState.page));
    router.replace(next.size ? `/search?${next}` : '/search');
  }

  async function search(next: { tab: TabType; page: number; cityCode: string; q: string; categoryCode: string }) {
    setIsLoading(true); setError('');
    try {
      let resultCount = 0;
      if (next.tab === 'professional') {
        const data = await api.professionals.search({ q: next.q || undefined, cityCode: next.cityCode || undefined, page: next.page });
        setProfessionals(data.professionals); setBusinesses([]); setServices([]); setTotal(data.professionals.length);
        resultCount = data.professionals.length;
      } else if (next.tab === 'service') {
        const data = await api.services.search({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, page: next.page });
        setServices(data.services); setBusinesses([]); setProfessionals([]); setTotal(data.total);
        resultCount = data.total;
      } else if (next.tab === 'business') {
        const data = await api.businesses.search({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, page: next.page });
        setBusinesses(data.businesses); setServices([]); setProfessionals([]); setTotal(data.total);
        resultCount = data.total;
      } else {
        const data = await api.search.query({ q: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, page: next.page, type: 'all' });
        setBusinesses(data.businesses); setServices(data.services); setProfessionals([]); setTotal(data.total);
        resultCount = data.total;
      }
      void api.analytics.recordSearch({ query: next.q || undefined, categoryCode: next.categoryCode || undefined, cityCode: next.cityCode || undefined, resultsCount: resultCount }).catch(() => undefined);
      setSearched(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إكمال البحث.'); }
    finally { setIsLoading(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); const next = { q, cityCode, categoryCode: tab === 'professional' ? '' : categoryCode, tab, page: 1 }; setPage(1); syncUrl(next); void search(next); }
  function changeTab(nextTab: TabType) { const nextCategoryCode = nextTab === 'professional' ? '' : categoryCode; setTab(nextTab); setCategoryCode(nextCategoryCode); setPage(1); const next = { q, cityCode, categoryCode: nextCategoryCode, tab: nextTab, page: 1 }; syncUrl(next); if (searched) void search(next); }
  function clear() {
    setQ('');
    setCityCode('');
    setCategoryCode('');
    setPage(1);
    setBusinesses([]);
    setProfessionals([]);
    setServices([]);
    setTotal(0);
    setError('');
    setSearched(false);
    router.replace('/search');
  }
  function goToPage(nextPage: number) { const next = { q, cityCode, categoryCode, tab, page: nextPage }; setPage(nextPage); syncUrl(next); void search(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  useEffect(() => {
    const rawCity = params.get('cityCode');
    const nextTab = (params.get('type') as TabType) ?? 'all';
    const requestedCategoryCode = params.get('categoryCode') ?? '';
    const next = { q: params.get('q') ?? '', cityCode: canonicalCityCode(rawCity, cities), categoryCode: nextTab === 'professional' ? '' : requestedCategoryCode, tab: nextTab, page: Math.max(1, Number(params.get('page')) || 1) };
    if (next.q || next.cityCode || next.categoryCode || params.get('type')) { setQ(next.q); setCityCode(next.cityCode); setCategoryCode(next.categoryCode); setTab(next.tab); setPage(next.page); void search(next); }
    if (requestedCategoryCode && nextTab === 'professional') syncUrl(next);
    if (rawCity && cities.length && !next.cityCode) router.replace('/search');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, params]);

  const categoryName = (code: string) => categories.find((item) => item.code === code)?.nameAr
    ?? businesses.find((item) => item.categoryCode === code)?.categoryNameAr
    ?? services.find((item) => item.categoryCode === code)?.categoryNameAr
    ?? 'تصنيف محفوظ سابقاً';
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const noResults = !businesses.length && !professionals.length && !services.length;

  return <PageShell className={`service-search-page ${styles.page} ${styles.searchProduct}`} label="اكتشف">
    <ServiceProductHeader title="اكتشف" label="البحث تحت مظلة خدمة" tone="blue"/>
    <PageHeader eyebrow="بحث موحد" title="اكتشف الخدمة المناسبة" description="اكتب ما تحتاجه وحدد المدينة أو التصنيف، ثم قارن النتائج الموثقة." actions={<ActionLink href="/map" variant="secondary"><PlatformIcon name="pin" size={17}/> بالقرب مني</ActionLink>} />
    <Surface as="section" className={styles.searchWorkspace}>
      <div className={styles.tabs} role="tablist" aria-label="نوع النتائج">{tabs.map(([value,label]) => <button type="button" key={value} className={styles.tab} role="tab" aria-selected={tab === value} onClick={() => changeTab(value)}>{label}</button>)}</div>
      <form className={styles.form} onSubmit={submit} role="search" aria-label="البحث في خدمة" aria-busy={isLoading}>
        <div className={`${styles.field} ${styles.queryField}`}><label htmlFor="q">ما الخدمة التي تحتاجها؟</label><input id="q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مثال: طبيب أسنان، نجار، مطعم" /></div>
        <div className={styles.field}><label htmlFor="city">المدينة</label><select id="city" value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setCityCode(event.target.value)}><option value="">كل المدن</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></div>
        {tab !== 'professional' && <div className={styles.field}><label htmlFor="category">التصنيف</label><select id="category" value={categoryCode} disabled={categoriesLoading || !!categoriesError} onChange={(event) => setCategoryCode(event.target.value)}><option value="">كل التصنيفات</option><CategorySelectOptions categories={categories} /></select></div>}
        <div className={styles.formActions}><ActionButton type="submit" disabled={isLoading}><PlatformIcon name="search" size={17}/>{isLoading ? 'جاري البحث' : 'اعرض النتائج'}</ActionButton>{(q || cityCode || categoryCode) && <ActionButton type="button" variant="secondary" onClick={clear}>مسح</ActionButton>}</div>
      </form>
    </Surface>
    {citiesError && <StatusMessage tone="danger">{citiesError} <button type="button" onClick={() => void retryCities()}>إعادة المحاولة</button></StatusMessage>}
    {tab === 'professional' && <StatusMessage>بحث المهنيين متاح بالكلمة والمدينة. تصنيف النشاط مخصص حالياً للأنشطة والخدمات.</StatusMessage>}
    {tab !== 'professional' && categoriesError && <StatusMessage tone="danger">تعذر تحميل التصنيفات. يمكنك متابعة البحث بالكلمة أو المدينة.</StatusMessage>}
    {error && <div role="alert"><StatusMessage tone="danger">{error}</StatusMessage></div>}
    {isLoading && <SkeletonGrid count={6} label="جاري البحث في الأنشطة والخدمات" />}
    {!isLoading && searched && <><p className={styles.resultSummary} aria-live="polite">{total ? `${total} نتيجة مطابقة${page > 1 ? ` — الصفحة ${page}` : ''}` : 'لم نعثر على نتيجة مطابقة'}</p>
      {businesses.length > 0 && <ResultSection title={tab === 'all' ? 'الأنشطة' : undefined}>{businesses.map((item) => <Surface as="article" className={styles.card} key={item.id}><div className={styles.cardTop}><div><h3>{item.name}</h3><p className={styles.meta}>{categoryName(item.categoryCode)}</p></div>{item.trustStatus === 'approved' && <span className={styles.badge}><PlatformIcon name="check" size={14}/> موثّق</span>}</div><div className={styles.providerFacts}><span><PlatformIcon name="pin" size={14}/>{cityLabel(item.cityCode,cities)}{item.distanceKm !== undefined ? ` · ${item.distanceKm.toFixed(1)} كم` : ''}</span>{item.availability && <span className={item.availability === 'available' ? styles.available : undefined}>{availabilityLabel(item.availability)}</span>}{item.rating !== undefined && <span aria-label={`التقييم ${item.rating.toFixed(1)} من 5`}>★ {item.rating.toFixed(1)}</span>}{responseLabel(item.responseSpeedMinutes) && <span><PlatformIcon name="refresh" size={14}/>{responseLabel(item.responseSpeedMinutes)}</span>}</div>{item.descriptionAr && <p className={styles.description}>{item.descriptionAr}</p>}<div className={styles.cardAction}><ActionLink href={`/business-profiles/${item.id}`}>عرض الملف والتواصل <PlatformIcon name="arrow" size={16}/></ActionLink></div></Surface>)}</ResultSection>}
      {professionals.length > 0 && <ResultSection title="المهنيون">{professionals.map((item) => <Surface as="article" className={styles.card} key={item.id}><div className={styles.cardTop}><h3>{item.headlineAr}</h3><span className={styles.badge}>{availabilityLabel(item.availability)}</span></div><p className={styles.meta}><PlatformIcon name="pin" size={14}/> {cityLabel(item.cityCode,cities)}</p><div className={styles.tags}>{item.skills.slice(0,4).map((skill) => <span className={styles.tag} key={skill}>{skill}</span>)}</div><div className={styles.cardAction}><ActionLink href={`/professional-profiles/${item.id}`}>عرض الملف <PlatformIcon name="arrow" size={16}/></ActionLink></div></Surface>)}</ResultSection>}
      {services.length > 0 && <ResultSection title={tab === 'all' ? 'الخدمات' : undefined}>{services.map((s) => <Surface as="article" className={styles.card} key={s.id}><div className={styles.cardTop}><h3>{s.titleAr}</h3><span className={styles.badge}>{priceLabel(s.priceType)}</span></div><p className={styles.meta}>{categoryName(s.categoryCode)}</p>{s.descriptionAr && <p className={styles.description}>{s.descriptionAr}</p>}{s.price != null && <p className={styles.price}>{s.price.toLocaleString('ar-SY-u-nu-latn')} {s.priceCurrency ?? 'SYP'}</p>}<div className={styles.cardAction}><ActionLink href={s.ownerType === 'business' ? `/business-profiles/${s.ownerId}` : `/professional-profiles/${s.ownerId}`}>عرض مقدم الخدمة <PlatformIcon name="arrow" size={16}/></ActionLink></div></Surface>)}</ResultSection>}
      {noResults && <EmptyState icon={<PlatformIcon name="search" size={38}/>} title="لا يوجد مزود منشور بهذه المواصفات حاليًا" description={tab === 'professional' ? 'وسّع المدينة أو جرّب تخصصًا قريبًا؛ لن نعرض ملفًا وهميًا.' : 'وسّع المدينة أو التصنيف، أو تابع البحث بالقرب منك؛ لن نعرض نتائج وهمية.'} actions={<><ActionButton type="button" variant="secondary" onClick={clear}>توسيع البحث</ActionButton><ActionLink href={`/map?q=${encodeURIComponent(q)}`} variant="secondary">بالقرب مني</ActionLink></>} />}
      {totalPages > 1 && <nav className={styles.pagination} aria-label="صفحات النتائج"><button disabled={page <= 1} onClick={() => goToPage(page-1)}>السابق</button>{Array.from({length:Math.min(totalPages,7)},(_,index)=>index+1).map((value)=><button key={value} aria-current={value===page?'page':undefined} onClick={()=>goToPage(value)}>{value}</button>)}<button disabled={page >= totalPages} onClick={() => goToPage(page+1)}>التالي</button></nav>}
    </>}
    {!searched && !isLoading && <div className={styles.initialState}><EmptyState icon={<PlatformIcon name="search" size={38}/>} title="ابدأ البحث" description={tab === 'professional' ? 'اكتب تخصصًا أو اختر مدينة لاستعراض المهنيين.' : 'اكتب خدمة أو اختر مدينة وتصنيفًا لاستعراض النتائج الحقيقية.'} actions={tab === 'professional' ? undefined : <ActionLink href="/categories" variant="secondary">استكشف التصنيفات</ActionLink>} /></div>}
  </PageShell>;
}
function ResultSection({ title, children }: { title?: string; children: ReactNode }) { return <section className={styles.section}>{title && <h2>{title}</h2>}<div className={styles.grid}>{children}</div></section>; }
export default function SearchPage() { return <Suspense fallback={<PageShell className={`service-search-page ${styles.page} ${styles.searchProduct}`}><SkeletonGrid count={6}/></PageShell>}><SearchContent/></Suspense>; }
