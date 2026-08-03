'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile, PublicServiceListing } from '../../../lib/api-client';

export default function ProfessionalProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfessionalProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [profileData, serviceData] = await Promise.all([
          api.professionals.getProfile(id),
          api.services.listForOwner(id, 'professional').catch(() => ({ services: [] }))
        ]);
        setProfile(profileData.professional);
        setServices(serviceData.services);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر التحميل.');
      } finally {
        setIsLoading(false);
      }
    }

    void load();
  }, [id]);

  if (isLoading) {
    return (
      <main id="foundation-content" className="identity-shell">
        <section className="identity-card"><p>جاري التحميل...</p></section>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main id="foundation-content" className="identity-shell">
        <section className="identity-card">
          <p className="form-error" role="alert">{error || 'لم يتم العثور على الملف.'}</p>
          <Link href="/search" className="foundation-action" style={{ marginBlockStart: '1rem', textDecoration: 'none' }}>العودة للبحث</Link>
        </section>
      </main>
    );
  }

  return (
    <main id="foundation-content" className="operations-shell" aria-label="ملف مهني">
      <header className="operations-header">
        <div>
          <p className="eyebrow">{profile.cityCode} · {profile.countryCode}</p>
          <h1>{profile.headlineAr}</h1>
          <span className="status-badge">
            {profile.availability === 'available'
              ? '🟢 متاح'
              : profile.availability === 'busy'
                ? '🟡 مشغول'
                : '🔴 غير متاح'}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '0.65rem 0.85rem', font: 'inherit', cursor: 'pointer' }}
          >
            ← رجوع
          </button>
          <Link href="/professional-profiles/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث عن مهنيين</Link>
        </nav>
      </header>

      {profile.headlineEn && (
        <p style={{ direction: 'ltr', color: '#52606d', marginBlockEnd: '1rem', fontSize: '1.125rem' }}>{profile.headlineEn}</p>
      )}

      {profile.bioAr && (
        <section style={{ background: 'white', borderRadius: '1rem', padding: '1.25rem', border: '1px solid var(--border)', marginBlockEnd: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem' }}>النبذة التعريفية</h2>
          <p>{profile.bioAr}</p>
        </section>
      )}

      {profile.skills.length > 0 && (
        <section style={{ marginBlockEnd: '1.5rem' }}>
          <h2 style={{ fontSize: '1.125rem', marginBlockEnd: '0.75rem' }}>المهارات</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {profile.skills.map((skill) => (
              <span key={skill} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '0.35rem 0.85rem', fontSize: '0.875rem' }}>
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {services.length > 0 && (
        <section aria-label="الخدمات">
          <h2 style={{ fontSize: '1.125rem', marginBlockEnd: '0.75rem' }}>الخدمات ({services.length})</h2>
          <div className="operations-grid">
            {services.map((service) => (
              <article className="operations-panel" key={service.id}>
                <div className="panel-heading">
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{service.titleAr}</h3>
                  <span className="status-badge">{service.priceType}</span>
                </div>
                {service.descriptionAr && <p>{service.descriptionAr}</p>}
                {service.price != null && (
                  <p style={{ fontWeight: 700, color: 'var(--accent)' }}>
                    {service.price} {service.priceCurrency ?? 'SYP'}
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
