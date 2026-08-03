'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';

const CITIES = [
  { code: 'damascus', label: 'دمشق' },
  { code: 'aleppo', label: 'حلب' },
  { code: 'homs', label: 'حمص' },
  { code: 'latakia', label: 'اللاذقية' },
  { code: 'hama', label: 'حماة' },
  { code: 'deir-ez-zor', label: 'دير الزور' },
  { code: 'tartus', label: 'طرطوس' },
];

function AvailBadge({ av }: { av: string }) {
  if (av === 'available') return <span className="badge badge-available">🟢 متاح</span>;
  if (av === 'busy') return <span className="badge badge-busy">🟡 مشغول</span>;
  return <span className="badge badge-unavailable">🔴 غير متاح</span>;
}

export default function ProfessionalProfileSearchPage() {
  const [q, setQ] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [availability, setAvailability] = useState('');
  const [results, setResults] = useState<PublicProfessionalProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await api.professionals.search({
        q: q || undefined,
        cityCode: cityCode || undefined,
        availability: availability || undefined
      });
      setResults(data.professionals);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر البحث.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="page-shell" aria-label="البحث عن مهنيين">
      <div className="page-content">
        <header style={{ marginBlockEnd: '1.5rem' }}>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1 style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.75rem, 5vw, 3rem)' }}>البحث عن مهنيين</h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1rem' }}>ابحث عن الأطباء والمحامين والمهندسين والمستقلين.</p>
        </header>

        <form onSubmit={handleSearch} className="filter-bar" role="search" aria-label="بحث عن مهنيين">
          <div className="filter-group" style={{ flex: '2 1 180px' }}>
            <label htmlFor="q">بحث</label>
            <input
              id="q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="عنوان، مهارة، تخصص..."
            />
          </div>
          <div className="filter-group" style={{ flex: '1 1 130px' }}>
            <label htmlFor="city">المدينة</label>
            <select id="city" value={cityCode} onChange={(e) => setCityCode(e.target.value)}>
              <option value="">كل المدن</option>
              {CITIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <div className="filter-group" style={{ flex: '1 1 130px' }}>
            <label htmlFor="avail">التوفر</label>
            <select id="avail" value={availability} onChange={(e) => setAvailability(e.target.value)}>
              <option value="">الكل</option>
              <option value="available">متاح</option>
              <option value="busy">مشغول</option>
              <option value="unavailable">غير متاح</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button type="submit" className="filter-action" aria-busy={isLoading} disabled={isLoading}>
              {isLoading ? 'جاري...' : 'بحث'}
            </button>
            {(q || cityCode || availability) && (
              <button
                type="button"
                className="filter-action-secondary"
                onClick={() => { setQ(''); setCityCode(''); setAvailability(''); }}
              >
                مسح
              </button>
            )}
          </div>
        </form>

        {error && <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p>}

        {isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
          </div>
        )}

        {!isLoading && searched && results.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">🔍</span>
            <h2>لا توجد نتائج</h2>
            <p>جرّب تغيير المدينة أو كلمة البحث.</p>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <>
            <p className="result-count">{results.length} مهني</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
              {results.map((profile) => (
                <article className="card" key={profile.id}>
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <h2 className="card-title">{profile.headlineAr}</h2>
                      <AvailBadge av={profile.availability} />
                    </div>
                    {profile.headlineEn && (
                      <p style={{ color: 'var(--muted)', direction: 'ltr', fontSize: '0.875rem', margin: 0 }}>
                        {profile.headlineEn}
                      </p>
                    )}
                    <p className="card-meta">
                      📍 {CITIES.find((c) => c.code === profile.cityCode)?.label ?? profile.cityCode} · {profile.countryCode.toUpperCase()}
                    </p>
                    {profile.skills.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {profile.skills.slice(0, 5).map((s) => (
                          <span key={s} className="skill-tag">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="card-footer">
                    <Link
                      href={`/professional-profiles/${profile.id}`}
                      className="foundation-action"
                      style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center', display: 'block', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      عرض الملف
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {!searched && !isLoading && (
          <div className="empty-state" style={{ paddingTop: '3rem' }}>
            <span className="empty-state-icon" aria-hidden="true">👥</span>
            <h2>ابحث عن مهنيين</h2>
            <p>أدخل كلمة بحث أو اختر مدينة للعثور على المهنيين المتاحين.</p>
          </div>
        )}
      </div>
    </main>
  );
}
