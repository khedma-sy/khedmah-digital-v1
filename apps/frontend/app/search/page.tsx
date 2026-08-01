'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, PublicBusinessProfile, PublicServiceListing } from '../../lib/api-client';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const results = await api.search.query({ q: q || undefined, cityCode: cityCode || undefined, categoryCode: categoryCode || undefined });
      setBusinesses(results.businesses);
      setServices(results.services);
      setTotal(results.total);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر البحث.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="operations-shell" aria-label="البحث العام">
      <header className="operations-header">
        <div>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1>البحث</h1>
          <p>ابحث عن الأعمال والخدمات.</p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/" className="foundation-action" style={{ marginBlockStart: 0 }}>الرئيسية</Link>
          <Link href="/businesses" className="foundation-action" style={{ marginBlockStart: 0 }}>الأعمال</Link>
          <Link href="/professionals" className="foundation-action" style={{ marginBlockStart: 0 }}>المهنيون</Link>
        </nav>
      </header>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBlockEnd: '1.5rem', background: 'white', borderRadius: '1rem', padding: '1.25rem', border: '1px solid var(--border)' }}>
        <div style={{ flex: '2 1 200px', display: 'grid', gap: '0.35rem' }}>
          <label htmlFor="q" style={{ fontWeight: 700, fontSize: '0.875rem' }}>كلمة البحث</label>
          <input
            id="q"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مطعم، نجار، محامي..."
            style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem 1rem', font: 'inherit' }}
          />
        </div>
        <div style={{ flex: '1 1 140px', display: 'grid', gap: '0.35rem' }}>
          <label htmlFor="city" style={{ fontWeight: 700, fontSize: '0.875rem' }}>المدينة</label>
          <input
            id="city"
            type="text"
            value={cityCode}
            onChange={(e) => setCityCode(e.target.value)}
            placeholder="damascus"
            style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem 1rem', font: 'inherit' }}
          />
        </div>
        <div style={{ flex: '1 1 140px', display: 'grid', gap: '0.35rem' }}>
          <label htmlFor="cat" style={{ fontWeight: 700, fontSize: '0.875rem' }}>التصنيف</label>
          <input
            id="cat"
            type="text"
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            placeholder="restaurant"
            style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.75rem 1rem', font: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="submit"
            className="foundation-action"
            style={{ marginBlockStart: 0 }}
            aria-busy={isLoading}
            disabled={isLoading}
          >
            {isLoading ? 'جاري البحث...' : 'بحث'}
          </button>
        </div>
      </form>

      {error ? <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p> : null}

      {searched && (
        <p style={{ marginBlockEnd: '1rem', color: '#52606d' }}>
          تم العثور على {total} نتيجة
        </p>
      )}

      {businesses.length > 0 && (
        <section aria-label="الأعمال">
          <h2 style={{ fontSize: '1.25rem', marginBlockEnd: '0.75rem' }}>الأعمال ({businesses.length})</h2>
          <div className="operations-grid" style={{ marginBlockEnd: '2rem' }}>
            {businesses.map((b) => (
              <article className="operations-panel" key={b.id}>
                <div className="panel-heading">
                  <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{b.name}</h3>
                  <span className="status-badge">{b.categoryCode}</span>
                </div>
                <p>{b.descriptionAr ?? 'لا يوجد وصف.'}</p>
                <p style={{ fontSize: '0.875rem', color: '#52606d' }}>{b.cityCode} · {b.countryCode}</p>
                <Link href={`/businesses/${b.id}`} className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center' }}>
                  عرض الصفحة
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {services.length > 0 && (
        <section aria-label="الخدمات">
          <h2 style={{ fontSize: '1.25rem', marginBlockEnd: '0.75rem' }}>الخدمات ({services.length})</h2>
          <div className="operations-grid">
            {services.map((s) => (
              <article className="operations-panel" key={s.id}>
                <div className="panel-heading">
                  <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{s.titleAr}</h3>
                  <span className="status-badge">{s.priceType}</span>
                </div>
                <p>{s.descriptionAr ?? 'لا يوجد وصف.'}</p>
                {s.price != null && (
                  <p style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {s.price} {s.priceCurrency ?? 'SYP'}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {searched && businesses.length === 0 && services.length === 0 && (
        <p style={{ textAlign: 'center', padding: '2rem', color: '#52606d' }}>
          لا توجد نتائج. جرّب كلمة بحث مختلفة.
        </p>
      )}
    </main>
  );
}
