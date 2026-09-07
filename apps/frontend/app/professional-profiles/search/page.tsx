'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from '../../discovery.module.css';

const PAGE_SIZE = 20;
type SearchState = { q: string; cityCode: string; availability: string; page: number };

function ProfessionalSearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { cities, isLoading: citiesLoading, error: citiesError, retry } = useSyrianCities();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [cityCode, setCityCode] = useState('');
  const [availability, setAvailability] = useState(params.get('availability') ?? '');
  const [page, setPage] = useState(() => Math.max(1, Number(params.get('page')) || 1));
  const [results, setResults] = useState<PublicProfessionalProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  function syncUrl(next: SearchState) {
    const search = new URLSearchParams();
    if (next.q) search.set('q', next.q);
    if (next.cityCode) search.set('cityCode', next.cityCode);
    if (next.availability) search.set('availability', next.availability);
    if (next.page > 1) search.set('page', String(next.page));
    router.replace(search.size ? `/professional-profiles/search?${search}` : '/professional-profiles/search');
  }

  async function runSearch(next: SearchState) {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.professionals.search({ q: next.q || undefined, cityCode: next.cityCode || undefined, availability: next.availability || undefined, page: next.page });
      setResults(data.professionals);
      setPage(data.page);
      setSearched(true);
    } catch (cause) {
      setResults([]);
      setError(cause instanceof Error ? cause.message : 'تعذر البحث عن المهنيين.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (citiesLoading) return;
    const rawCity = params.get('cityCode');
    const next: SearchState = {
      q: params.get('q') ?? '',
      cityCode: canonicalCityCode(rawCity, cities),
      availability: ['available', 'busy', 'unavailable'].includes(params.get('availability') ?? '') ? (params.get('availability') ?? '') : '',
      page: Math.max(1, Number(params.get('page')) || 1)
    };
    setQ(next.q);
    setCityCode(next.cityCode);
    setAvailability(next.availability);
    setPage(next.page);
    if (rawCity && !next.cityCode) {
      router.replace('/professional-profiles/search');
      return;
    }
    if (next.q || next.cityCode || next.availability || next.page > 1) void runSearch(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, citiesLoading, params, router]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { q: q.trim(), cityCode, availability, page: 1 };
    setQ(next.q);
    setPage(1);
    syncUrl(next);
    void runSearch(next);
  }

  function clear() {
    setQ('');
    setCityCode('');
    setAvailability('');
    setPage(1);
    setResults([]);
    setSearched(false);
    setError('');
    router.replace('/professional-profiles/search');
  }

  function goToPage(nextPage: number) {
    const next = { q, cityCode, availability, page: nextPage };
    setPage(nextPage);
    syncUrl(next);
    void runSearch(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const canGoNext = results.length === PAGE_SIZE;

  return <PageShell className={styles.page} label="البحث عن مهنيين">
    <PageHeader eyebrow="دليل المهنيين" title="ابحث عن مهني مناسب" description="ابحث بالكلمة والمدينة وحالة التوفر، ثم افتح الملف العام لمراجعة الخبرة والمهارات." actions={<ActionLink href="/professional-profiles" variant="secondary">ملفي المهني</ActionLink>} />
    <Surface as="form" className={styles.form} onSubmit={submit} aria-label="بحث عن مهنيين" aria-busy={isLoading}>
      <div className={styles.field}><label htmlFor="professional-q">المهنة أو المهارة</label><input id="professional-q" value={q} onChange={(event) => setQ(event.target.value)} placeholder="مثال: كهربائي، مصمم، محاسب" /></div>
      <div className={styles.field}><label htmlFor="professional-city">المدينة</label><select id="professional-city" value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(event) => setCityCode(event.target.value)}><option value="">كل المدن</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="professional-availability">التوفر</label><select id="professional-availability" value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="">الكل</option><option value="available">متاح</option><option value="busy">مشغول</option><option value="unavailable">غير متاح</option></select></div>
      <div className={styles.formActions}><ActionButton type="submit" disabled={isLoading}><PlatformIcon name="search" size={17}/>{isLoading ? 'جاري البحث' : 'بحث'}</ActionButton>{(q || cityCode || availability || searched) && <ActionButton type="button" variant="secondary" onClick={clear}>مسح</ActionButton>}</div>
    </Surface>

    {citiesError && <StatusMessage tone="danger">{citiesError} <button type="button" onClick={() => void retry()}>إعادة المحاولة</button></StatusMessage>}
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
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
      <nav className={styles.pagination} aria-label="صفحات نتائج المهنيين"><button type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>السابق</button><span aria-current="page">الصفحة {page.toLocaleString('ar-SY')}</span><button type="button" disabled={!canGoNext} onClick={() => goToPage(page + 1)}>التالي</button></nav>
    </>}

    {!searched && !isLoading && <EmptyState icon={<PlatformIcon name="user" size={34}/>} title="اعثر على المهني المناسب" description="ابدأ بكلمة بحث، أو اختر مدينة وحالة توفر لاستعراض المهنيين المعتمدين." />}
  </PageShell>;
}

export default function ProfessionalProfileSearchPage() {
  return <Suspense fallback={<PageShell className={styles.page}><SkeletonGrid count={6} label="جاري تجهيز البحث" /></PageShell>}><ProfessionalSearchContent /></Suspense>;
}
