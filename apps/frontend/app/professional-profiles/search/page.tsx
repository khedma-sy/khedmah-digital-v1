'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from '../../discovery.module.css';
import { discoveryPage } from '../../../lib/discovery-context';

const PAGE_SIZE = 20;
type SearchState = { q: string; cityCode: string; availability: string; page: number };

function ProfessionalSearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const appliedQuery = (params.get('q') ?? '').trim();
  const appliedCity = (params.get('cityCode') ?? '').trim();
  const appliedAvailability = (params.get('availability') ?? '').trim();
  const page = discoveryPage(params.get('page'));
  // page=1 records an explicit empty search; the bare route remains a landing.
  const requested = !!(appliedQuery || appliedCity || appliedAvailability || params.get('page'));
  const requestKey = JSON.stringify([appliedQuery, appliedCity, appliedAvailability, page, requested]);
  const { cities, isLoading: citiesLoading, error: citiesError, retry } = useSyrianCities();
  const [q, setQ] = useState(appliedQuery);
  const [cityCode, setCityCode] = useState(appliedCity);
  const [availability, setAvailability] = useState(appliedAvailability);
  const [retryCount, setRetryCount] = useState(0);
  const [requestLoading, setRequestLoading] = useState(false);
  const sequence = useRef(0);
  const [result, setResult] = useState<{ key: string; profiles: PublicProfessionalProfile[]; error: string }>({ key: '', profiles: [], error: '' });
  const waitingForMetadata = !!appliedCity && citiesLoading;
  const validationError = appliedCity && citiesError ? 'تعذر التحقق من المدينة المحددة. أعد تحميل المدن دون تغيير اختيارك.'
    : appliedCity && !citiesLoading && !canonicalCityCode(appliedCity, cities) ? 'المدينة المحددة غير متاحة. اختر مدينة أخرى أو امسح عوامل البحث.'
    : appliedAvailability && !['available', 'busy', 'unavailable'].includes(appliedAvailability) ? 'حالة التوفر المحددة غير متاحة. اختر حالة أخرى أو امسح عوامل البحث.' : '';
  const isLoading = requested && !validationError && (waitingForMetadata || requestLoading || result.key !== requestKey);
  const error = validationError || (result.key === requestKey ? result.error : '');
  const searched = requested && !waitingForMetadata && !error && result.key === requestKey;
  const results = searched ? result.profiles : [];

  useEffect(() => {
    setQ(appliedQuery); setCityCode(appliedCity); setAvailability(appliedAvailability);
  }, [appliedQuery, appliedCity, appliedAvailability, page, requested]);

  useEffect(() => {
    const requestId = ++sequence.current;
    if (!requested || waitingForMetadata || validationError) {
      setRequestLoading(false);
      return () => { sequence.current += 1; };
    }
    setRequestLoading(true);
    async function runSearch() {
      try {
        const data = await api.professionals.search({ q: appliedQuery || undefined, cityCode: appliedCity || undefined,
          availability: appliedAvailability || undefined, page });
        if (requestId === sequence.current) setResult({ key: requestKey, profiles: data.professionals, error: '' });
      } catch (cause) {
        if (requestId === sequence.current) setResult({ key: requestKey, profiles: [], error: cause instanceof Error ? cause.message : 'تعذر البحث عن المهنيين.' });
      } finally {
        if (requestId === sequence.current) setRequestLoading(false);
      }
    }
    void runSearch();
    return () => { sequence.current += 1; };
  }, [appliedQuery, appliedCity, appliedAvailability, page, requested, requestKey, waitingForMetadata, validationError, retryCount]);

  function syncUrl(next: SearchState) {
    const search = new URLSearchParams(params.toString());
    for (const key of ['q', 'cityCode', 'availability', 'page']) search.delete(key);
    if (next.q.trim()) search.set('q', next.q.trim());
    if (next.cityCode) search.set('cityCode', next.cityCode);
    if (next.availability) search.set('availability', next.availability);
    const nextPage = discoveryPage(String(next.page));
    if (nextPage > 1 || !search.get('q') && !next.cityCode && !next.availability) search.set('page', String(nextPage));
    const href = `/professional-profiles/search?${search}`;
    const nextKey = JSON.stringify([next.q.trim(), next.cityCode, next.availability, nextPage, true]);
    if (nextKey === requestKey) setRetryCount((value) => value + 1);
    else router.push(href, { scroll: false });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setQ(q.trim());
    syncUrl({ q, cityCode, availability, page: 1 });
  }

  function clear() {
    setQ(''); setCityCode(''); setAvailability('');
    router.push('/professional-profiles/search', { scroll: false });
  }

  function goToPage(nextPage: number) {
    syncUrl({ q: appliedQuery, cityCode: appliedCity, availability: appliedAvailability, page: nextPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const canGoNext = results.length === PAGE_SIZE;

  return <PageShell className={styles.page} label="البحث عن مهنيين">
    <PageHeader eyebrow="دليل المهنيين" title="ابحث عن مهني مناسب" description="ابحث بالكلمة والمدينة وحالة التوفر، ثم افتح الملف العام لمراجعة الخبرة والمهارات." actions={<ActionLink href="/professional-profiles" variant="secondary">ملفي المهني</ActionLink>} />
    <Surface as="form" className={styles.form} onSubmit={submit} aria-label="بحث عن مهنيين" aria-busy={isLoading}>
      <div className={styles.field}><label htmlFor="professional-q">المهنة أو المهارة</label><input id="professional-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مثال: كهربائي، مصمم، محاسب" /></div>
      <div className={styles.field}><label htmlFor="professional-city">المدينة</label><select id="professional-city" value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setCityCode(event.target.value)}><option value="">كل المدن</option>{cityCode && !cities.some((city) => city.code === cityCode) && <option value={cityCode}>المدينة المحددة (غير متاحة حالياً)</option>}{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="professional-availability">التوفر</label><select id="professional-availability" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">الكل</option>{availability && !['available', 'busy', 'unavailable'].includes(availability) && <option value={availability}>حالة غير متاحة</option>}<option value="available">متاح</option><option value="busy">مشغول</option><option value="unavailable">غير متاح</option></select></div>
      <div className={styles.formActions}><ActionButton type="submit" disabled={isLoading}><PlatformIcon name="search" size={17}/>{isLoading ? 'جاري البحث' : 'بحث'}</ActionButton>{(q || cityCode || availability || requested) && <ActionButton type="button" variant="secondary" onClick={clear}>مسح</ActionButton>}</div>
    </Surface>

    {citiesError && <StatusMessage tone="danger">{citiesError} <button type="button" onClick={() => void retry()}>إعادة المحاولة</button></StatusMessage>}
    {error && <StatusMessage tone="danger">{error} {!validationError && <ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</ActionButton>}</StatusMessage>}
    {isLoading && <SkeletonGrid count={6} label="جاري البحث عن المهنيين" />}

    {!isLoading && searched && results.length === 0 && <EmptyState icon={<PlatformIcon name="search" size={34}/>} title="لا توجد نتائج مطابقة" description="غيّر كلمة البحث أو المدينة أو حالة التوفر، ثم حاول مجددًا." actions={<ActionButton type="button" variant="secondary" onClick={clear}>مسح عوامل البحث</ActionButton>} />}

    {!isLoading && results.length > 0 && <>
      <p className={styles.resultSummary} aria-live="polite">{results.length.toLocaleString('ar-SY')} مهني في الصفحة {page.toLocaleString('ar-SY')}</p>
      <section className={styles.grid} aria-label="نتائج المهنيين">{results.map((profile) => <Surface as="article" className={styles.card} key={profile.id}>
        <div className={styles.cardTop}><h2>{profile.headlineAr}</h2><span className={styles.badge}>{profile.availability === 'available' ? 'متاح' : profile.availability === 'busy' ? 'مشغول' : 'غير متاح'}</span></div>
        <p className={styles.meta}><PlatformIcon name="pin" size={14}/> {cityLabel(profile.cityCode, cities)} · {profile.countryCode}</p>
        {profile.skills.length > 0 && <div className={styles.tags}>{profile.skills.slice(0, 4).map((skill) => <span className={styles.tag} key={skill}>{skill}</span>)}</div>}
        <div className={styles.cardAction}><ActionLink href={`/professional-profiles/${profile.id}`}>عرض الملف <PlatformIcon name="arrow" size={16}/></ActionLink></div>
      </Surface>)}</section>
    </>}
    {!isLoading && searched && (page > 1 || canGoNext) && <nav className={styles.pagination} aria-label="صفحات نتائج المهنيين"><button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>السابق</button><span aria-current="page">الصفحة {page.toLocaleString('ar-SY')}</span><button type="button" disabled={!canGoNext} onClick={() => goToPage(page + 1)}>التالي</button></nav>}

    {!requested && !isLoading && <EmptyState icon={<PlatformIcon name="user" size={34}/>} title="اعثر على المهني المناسب" description="ابدأ بكلمة بحث، أو اختر مدينة وحالة توفر لاستعراض المهنيين المعتمدين." />}
  </PageShell>;
}

export default function ProfessionalProfileSearchPage() {
  return <Suspense fallback={<PageShell className={styles.page}><SkeletonGrid count={6} label="جاري تجهيز البحث" /></PageShell>}><ProfessionalSearchContent /></Suspense>;
}
