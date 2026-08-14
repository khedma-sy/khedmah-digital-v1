'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';
import { canonicalCityCode, cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';

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

  function updateUrl(nextCity = cityCode, nextPage = page) {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (nextCity) next.set('cityCode', nextCity);
    if (availability) next.set('availability', availability);
    if (nextPage > 1) next.set('page', String(nextPage));
    router.replace(next.size ? `/professional-profiles/search?${next}` : '/professional-profiles/search');
  }

  useEffect(() => {
    if (citiesLoading) return;
    const raw = params.get('cityCode');
    const canonical = canonicalCityCode(raw, cities);
    setCityCode(canonical);
    setPage(Math.max(1, Number(params.get('page')) || 1));
    if (raw && !canonical) router.replace('/professional-profiles/search');
  }, [cities, citiesLoading, params, router]);

  async function search(nextPage = page) {
    setIsLoading(true); setError('');
    try {
      const data = await api.professionals.search({ q: q || undefined, cityCode: cityCode || undefined, availability: availability || undefined, page: nextPage });
      setResults(data.professionals); setSearched(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر البحث.'); }
    finally { setIsLoading(false); }
  }

  function submit(event: React.FormEvent) { event.preventDefault(); setPage(1); updateUrl(cityCode, 1); void search(1); }
  function clear() { setQ(''); setCityCode(''); setAvailability(''); setPage(1); router.replace('/professional-profiles/search'); }

  return <main id="foundation-content" className="page-shell" aria-label="البحث عن مهنيين"><div className="page-content">
    <header style={{ marginBlockEnd: '1.5rem' }}><p className="eyebrow">خدمة الرقمية</p><h1>البحث عن مهنيين</h1><p>ابحث عن المهنيين حسب المدينة السورية المعتمدة.</p></header>
    <form onSubmit={submit} className="filter-bar" role="search" aria-label="بحث عن مهنيين">
      <div className="filter-group"><label htmlFor="professional-q">بحث</label><input id="professional-q" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="filter-group"><label htmlFor="professional-city">المدينة</label><select id="professional-city" value={cityCode} disabled={citiesLoading || !!citiesError} onChange={(e) => { setCityCode(e.target.value); setPage(1); updateUrl(e.target.value, 1); }}><option value="">كل المدن</option>{cities.map((city) => <option key={city.code} value={city.code}>{city.nameAr}</option>)}</select></div>
      <div className="filter-group"><label htmlFor="professional-availability">التوفر</label><select id="professional-availability" value={availability} onChange={(e) => setAvailability(e.target.value)}><option value="">الكل</option><option value="available">متاح</option><option value="busy">مشغول</option><option value="unavailable">غير متاح</option></select></div>
      <button type="submit" className="filter-action" disabled={isLoading}>{isLoading ? 'جاري...' : 'بحث'}</button>
      {(q || cityCode || availability) && <button type="button" className="filter-action-secondary" onClick={clear}>مسح</button>}
    </form>
    {citiesError && <p role="status" className="form-error">{citiesError} <button type="button" onClick={() => void retry()}>إعادة المحاولة</button></p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {!isLoading && searched && results.length === 0 && <div className="empty-state"><h2>لا توجد نتائج</h2><p>جرّب تغيير المدينة أو كلمة البحث.</p></div>}
    {!isLoading && results.length > 0 && <><p className="result-count">{results.length} مهني</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>{results.map((profile) => <article className="card" key={profile.id}><div className="card-body"><h2 className="card-title">{profile.headlineAr}</h2><p className="card-meta">📍 {cityLabel(profile.cityCode, cities)} · {profile.countryCode}</p></div><div className="card-footer"><Link href={`/professional-profiles/${profile.id}`} className="foundation-action">عرض الملف</Link></div></article>)}</div></>}
  </div></main>;
}

export default function ProfessionalProfileSearchPage() {
  return <Suspense fallback={<main className="page-shell"><p role="status">جاري تحميل البحث…</p></main>}><ProfessionalSearchContent /></Suspense>;
}
