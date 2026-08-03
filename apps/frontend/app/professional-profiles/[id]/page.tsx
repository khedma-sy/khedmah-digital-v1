'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile, PublicServiceListing } from '../../../lib/api-client';

const CITY_LABELS: Record<string, string> = {
  damascus: 'دمشق',
  aleppo: 'حلب',
  homs: 'حمص',
  latakia: 'اللاذقية',
  hama: 'حماة',
  tartus: 'طرطوس',
  'deir-ez-zor': 'دير الزور',
};

function AvailBadge({ av }: { av: string }) {
  if (av === 'available') return <span className="badge badge-available">🟢 متاح للعمل</span>;
  if (av === 'busy') return <span className="badge badge-busy">🟡 مشغول</span>;
  return <span className="badge badge-unavailable">🔴 غير متاح</span>;
}

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
      <main id="foundation-content" className="page-shell">
        <div className="page-content">
          <div className="skeleton" style={{ height: '14rem', borderRadius: '1rem', marginBlockEnd: '1.5rem' }} />
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-text" style={{ width: '50%' }} />
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main id="foundation-content" className="page-shell">
        <div className="page-content">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">⚠️</span>
            <h2>تعذر التحميل</h2>
            <p>{error || 'لم يتم العثور على الملف المهني.'}</p>
            <Link href="/professional-profiles/search" className="filter-action" style={{ textDecoration: 'none', display: 'inline-block', marginTop: '0.5rem' }}>
              البحث عن مهنيين
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const cityLabel = CITY_LABELS[profile.cityCode] ?? profile.cityCode;
  const activeServices = services.filter((s) => s.status === 'active');

  return (
    <main id="foundation-content" className="page-shell" aria-label="الملف المهني">
      <div className="page-content">
        {/* Header card */}
        <div className="profile-header-card" style={{ position: 'relative', paddingTop: 0, overflow: 'hidden' }}>
          {/* Cover */}
          <div className="profile-cover" style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)' }}>
            <div className="profile-cover-placeholder" aria-hidden="true">👤</div>
          </div>

          <div style={{ position: 'relative', paddingTop: '3.5rem', paddingRight: '1.5rem' }}>
            <div
              className="profile-avatar"
              aria-hidden="true"
              style={{ position: 'absolute', top: '-2.5rem', right: '1.5rem', fontSize: '1.75rem', background: '#e0f2fe', color: '#0369a1' }}
            >
              {profile.headlineAr.charAt(0)}
            </div>
          </div>

          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: '0 0 0.4rem', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}>{profile.headlineAr}</h1>
                {profile.headlineEn && (
                  <p style={{ margin: '0 0 0.35rem', color: 'var(--muted)', direction: 'ltr', fontSize: '0.9375rem' }}>
                    {profile.headlineEn}
                  </p>
                )}
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9rem' }}>
                  📍 {cityLabel} · {profile.countryCode.toUpperCase()}
                </p>
              </div>
              <AvailBadge av={profile.availability} />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => router.back()} className="filter-action-secondary">
                ← رجوع
              </button>
              <Link href="/professional-profiles/search" className="filter-action-secondary" style={{ textDecoration: 'none' }}>
                تصفح المهنيين
              </Link>
            </div>
          </div>
        </div>

        {/* Bio */}
        {(profile.bioAr || profile.bioEn) && (
          <div className="section-card">
            <h2>النبذة التعريفية</h2>
            {profile.bioAr && <p style={{ lineHeight: 1.8 }}>{profile.bioAr}</p>}
            {profile.bioEn && (
              <p style={{ color: 'var(--muted)', direction: 'ltr', marginTop: '0.75rem', lineHeight: 1.7, fontSize: '0.9rem' }}>
                {profile.bioEn}
              </p>
            )}
          </div>
        )}

        {/* Skills */}
        {profile.skills.length > 0 && (
          <div className="section-card">
            <h2>المهارات والتخصصات</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {profile.skills.map((skill) => (
                <span key={skill} className="skill-tag">{skill}</span>
              ))}
            </div>
          </div>
        )}

        {/* Services */}
        {activeServices.length > 0 && (
          <section aria-label="الخدمات">
            <div className="section-header">
              <h2>الخدمات ({activeServices.length})</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))', gap: '1rem' }}>
              {activeServices.map((service) => (
                <article className="card" key={service.id}>
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <h3 className="card-title">{service.titleAr}</h3>
                      <span className="badge badge-pending" style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        {service.priceType === 'fixed' ? 'سعر ثابت' : service.priceType === 'hourly' ? 'بالساعة' : 'قابل للتفاوض'}
                      </span>
                    </div>
                    {service.descriptionAr && (
                      <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.6, margin: '0.25rem 0 0' }}>
                        {service.descriptionAr}
                      </p>
                    )}
                    {service.price != null && (
                      <p style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.0625rem', margin: '0.5rem 0 0' }}>
                        {service.price.toLocaleString('ar-SY')} {service.priceCurrency ?? 'SYP'}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {services.length === 0 && (
          <div className="empty-state" style={{ padding: '2rem', background: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
            <span className="empty-state-icon" aria-hidden="true">📋</span>
            <h2>لا توجد خدمات</h2>
            <p>لم يُضف هذا المهني خدمات بعد.</p>
          </div>
        )}
      </div>
    </main>
  );
}
