'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicBusinessProfile, PublicServiceListing } from '../../../lib/api-client';

export default function BusinessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [bizData, svcData] = await Promise.all([
          api.businesses.getPublic(id),
          api.services.listForOwner(id, 'business').catch(() => ({ services: [] }))
        ]);
        setBusiness(bizData.business);
        setServices(svcData.services);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر التحميل.');
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [id]);

  const trustLabel = (s: string) => ({ approved: '✓ معتمد', suspended: '✗ موقوف', pending: '⏳ قيد المراجعة' }[s] ?? s);
  const priceLabel = (s: string) => ({ fixed: 'سعر ثابت', hourly: 'بالساعة', negotiable: 'قابل للتفاوض' }[s] ?? s);

  if (isLoading) {
    return (
      <main id="foundation-content" className="identity-shell">
        <section className="identity-card"><p>جاري التحميل...</p></section>
      </main>
    );
  }

  if (error || !business) {
    return (
      <main id="foundation-content" className="identity-shell">
        <section className="identity-card">
          <p className="form-error" role="alert">{error || 'لم يتم العثور على الصفحة.'}</p>
          <Link href="/search" className="foundation-action" style={{ marginBlockStart: '1rem', textDecoration: 'none' }}>العودة للبحث</Link>
        </section>
      </main>
    );
  }

  return (
    <main id="foundation-content" className="operations-shell" aria-label={`صفحة ${business.name}`}>
      <header className="operations-header">
        <div>
          <p className="eyebrow">{business.categoryCode} · {business.cityCode}</p>
          <h1>{business.name}</h1>
          <span className="status-badge">{trustLabel(business.trustStatus)}</span>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.65rem 0.85rem', font: 'inherit', cursor: 'pointer' }}
          >
            ← رجوع
          </button>
          <Link href={`/businesses`} className="foundation-action" style={{ marginBlockStart: 0 }}>أعمالي</Link>
        </nav>
      </header>

      <section className="operations-summary" aria-label="معلومات العمل">
        {business.phone && (
          <article>
            <strong>{business.phone}</strong>
            <span>الهاتف</span>
          </article>
        )}
        {business.email && (
          <article>
            <strong style={{ fontSize: '1rem' }}>{business.email}</strong>
            <span>البريد الإلكتروني</span>
          </article>
        )}
        {business.website && (
          <article>
            <strong style={{ fontSize: '1rem' }}>
              <a href={business.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                {business.website}
              </a>
            </strong>
            <span>الموقع الإلكتروني</span>
          </article>
        )}
        <article>
          <strong>{business.visibility === 'public' ? 'عام' : 'خاص'}</strong>
          <span>الظهور</span>
        </article>
      </section>

      {(business.descriptionAr || business.descriptionEn) && (
        <section style={{ background: 'white', borderRadius: '1rem', padding: '1.25rem', border: '1px solid var(--border)', marginBlockEnd: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem' }}>الوصف</h2>
          {business.descriptionAr && <p>{business.descriptionAr}</p>}
          {business.descriptionEn && <p style={{ color: '#52606d', direction: 'ltr' }}>{business.descriptionEn}</p>}
        </section>
      )}

      {services.length > 0 && (
        <section aria-label="الخدمات">
          <h2 style={{ fontSize: '1.125rem', marginBlockEnd: '0.75rem' }}>الخدمات ({services.length})</h2>
          <div className="operations-grid">
            {services.map((s) => (
              <article className="operations-panel" key={s.id}>
                <div className="panel-heading">
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{s.titleAr}</h3>
                  <span className="status-badge">{priceLabel(s.priceType)}</span>
                </div>
                {s.descriptionAr && <p>{s.descriptionAr}</p>}
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
    </main>
  );
}
