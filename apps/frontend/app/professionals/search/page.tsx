'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, PublicProfessionalProfile } from '../../../lib/api-client';

export default function ProfessionalSearchPage() {
  const [q, setQ] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [availability, setAvailability] = useState('');
  const [results, setResults] = useState<PublicProfessionalProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await api.professionals.search({ q: q || undefined, cityCode: cityCode || undefined, availability: availability || undefined });
      setResults(data.professionals);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر البحث.');
    } finally {
      setIsLoading(false);
    }
  }

  const availabilityLabel = (a: string) => ({ available: '🟢 متاح', busy: '🟡 مشغول', unavailable: '🔴 غير متاح' }[a] ?? a);

  return (
    <main id="foundation-content" className="operations-shell" aria-label="البحث عن مهنيين">
      <header className="operations-header">
        <div>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1>البحث عن مهنيين</h1>
          <p>ابحث عن المهنيين المتاحين على المنصة.</p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/professionals" className="foundation-action" style={{ marginBlockStart: 0 }}>ملفي المهني</Link>
          <Link href="/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث الشامل</Link>
        </nav>
      </header>

      {error ? <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p> : null}

      <form onSubmit={handleSearch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))', gap: '0.75rem', marginBlockEnd: '1.5rem' }}>
        <label>
          بحث
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="عنوان، مهارة..."
          />
        </label>
        <label>
          المدينة
          <select
            value={cityCode}
            onChange={(e) => setCityCode(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}
          >
            <option value="">كل المدن</option>
            <option value="damascus">دمشق</option>
            <option value="aleppo">حلب</option>
            <option value="homs">حمص</option>
            <option value="latakia">اللاذقية</option>
            <option value="hama">حماة</option>
            <option value="deir-ez-zor">دير الزور</option>
            <option value="tartus">طرطوس</option>
          </select>
        </label>
        <label>
          التوفر
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '0.875rem', padding: '0.875rem 1rem', font: 'inherit' }}
          >
            <option value="">الكل</option>
            <option value="available">متاح</option>
            <option value="busy">مشغول</option>
            <option value="unavailable">غير متاح</option>
          </select>
        </label>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="submit" className="foundation-action" aria-busy={isLoading} disabled={isLoading} style={{ marginBlockStart: 0, width: '100%' }}>
            {isLoading ? 'جاري البحث...' : 'بحث'}
          </button>
        </div>
      </form>

      {searched && results.length === 0 && (
        <p style={{ color: '#52606d', padding: '1rem 0' }}>لا توجد نتائج مطابقة.</p>
      )}

      {results.length > 0 && (
        <div className="operations-grid">
          {results.map((p) => (
            <article className="operations-panel" key={p.id}>
              <div className="panel-heading">
                <h2 style={{ margin: 0, fontSize: '1.0625rem' }}>{p.headlineAr}</h2>
                <span className="status-badge">{availabilityLabel(p.availability)}</span>
              </div>
              {p.headlineEn && <p style={{ color: '#52606d', direction: 'ltr', fontSize: '0.9rem' }}>{p.headlineEn}</p>}
              <p style={{ fontSize: '0.875rem', color: '#52606d' }}>{p.cityCode} · {p.countryCode}</p>
              {p.skills.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBlockEnd: '0.5rem' }}>
                  {p.skills.slice(0, 5).map((s) => (
                    <span key={s} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <Link href={`/professionals/${p.id}`} className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center', fontSize: '0.875rem' }}>
                عرض الملف
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
