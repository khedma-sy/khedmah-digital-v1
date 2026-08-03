'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, PublicDiscoveryResult } from '../../lib/api-client';

export default function SearchPage() {
  const [results, setResults] = useState<PublicDiscoveryResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [term, setTerm] = useState('');

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await api.search.businesses(term);
      setResults(data.results);
    } catch (err) {
      const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 404 || statusCode === 501) {
        setResults([]);
        setError('واجهة البحث قيد الربط الخلفي حالياً.');
      } else {
        setError(err instanceof Error ? err.message : 'تعذر تنفيذ البحث.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="البحث">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>البحث</h1>
        <p>بحث عام في ملفات الأعمال المنشورة ضمن EO-009.</p>
        <form onSubmit={submitSearch} noValidate style={{ display: 'grid', gap: '0.75rem' }}>
          <label>
            عبارة البحث
            <input
              name="term"
              type="text"
              required
              minLength={2}
              value={term}
              onChange={(event) => setTerm(event.currentTarget.value)}
            />
          </label>
          <button className="foundation-action" type="submit" aria-busy={isLoading} disabled={isLoading}>
            {isLoading ? 'جاري البحث...' : 'بحث'}
          </button>
        </form>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link className="foundation-action" href="/business-profiles">ملفات الأعمال</Link>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/service-catalog">دليل الخدمات</Link>
          <Link className="foundation-action" href="/locations">المواقع</Link>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {results.length === 0 && !isLoading ? (
          <p style={{ marginTop: '1rem' }}>لا توجد نتائج حالياً.</p>
        ) : (
          <ul className="foundation-list" aria-label="نتائج البحث">
            {results.map((result, index) => (
              <li key={`${result.businessName}-${index}`}>
                <strong>{result.businessName}</strong>
                <p>{result.businessCategoryReference} · {result.businessLocationReference}</p>
                <p>{result.businessDescription}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
