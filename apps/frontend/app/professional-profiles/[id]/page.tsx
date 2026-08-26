'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, MediaAsset, PublicProfessionalProfile, PublicServiceListing, TrustHistoryEntry, VerificationRequest } from '../../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { ContactInquiryForm } from '../../../components/contact-inquiry-form';
import { ProviderReportForm } from '../../../components/provider-report-form';



export default function ProfessionalProfileDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cities } = useSyrianCities();
  const [profile, setProfile] = useState<PublicProfessionalProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [trustHistory, setTrustHistory] = useState<TrustHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [profileData, serviceData, mediaData, verData, histData] = await Promise.all([
          api.professionals.getProfile(id),
          api.services.listForOwner(id, 'professional').catch(() => ({ services: [] })),
          api.professionals.getMedia(id).catch(() => ({ assets: [] })),
          api.professionals.getVerificationStatus(id).catch(() => ({ status: null })),
          api.professionals.getTrustHistory(id).catch(() => ({ history: [] }))
        ]);
        setProfile(profileData.professional);
        setServices(serviceData.services);
        setMedia(mediaData.assets);
        setVerification(verData.status);
        setTrustHistory(histData.history);
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

  const localizedCity = cityLabel(profile.cityCode, cities);
  const activeServices = services.filter((s) => s.status === 'active');
  const profileImage = media.find((a) => a.assetType === 'profile_image');
  const gallery = media.filter((a) => a.assetType === 'gallery');

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
              aria-hidden={!!profileImage}
              style={{ position: 'absolute', top: '-2.5rem', right: '1.5rem', fontSize: '1.75rem', background: '#e0f2fe', color: '#0369a1', overflow: 'hidden' }}
            >
              {profileImage
                ? <img src={profileImage.url} alt="صورة الملف المهني" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : profile.headlineAr.charAt(0)
              }
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
                  📍 {localizedCity} · {profile.countryCode.toUpperCase()}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              {profile.contactEligibility?.eligible && (
                <ContactInquiryForm
                  target={{ type: 'professional', id: profile.id }}
                  providerName={profile.headlineAr}
                />
              )}
              {profile.contactEligibility?.eligible && (
                <ProviderReportForm
                  target={{ type: 'professional', id: profile.id }}
                  providerName={profile.headlineAr}
                />
              )}
              <button type="button" onClick={() => router.back()} className="filter-action-secondary">
                ← رجوع
              </button>
              <Link href="/professional-profiles/search" className="filter-action-secondary" style={{ textDecoration: 'none' }}>
                تصفح المهنيين
              </Link>
            </div>
          </div>
        </div>

        {/* Verification status */}
        {verification && (
          <div style={{ background: verification.status === 'approved' ? 'var(--accent-light)' : 'var(--surface)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '1rem 1.25rem', marginBlockEnd: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>
              {verification.status === 'approved' ? '✅' : verification.status === 'rejected' ? '❌' : '⏳'}
            </span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem' }}>
                {verification.status === 'approved' ? 'الملف موثّق' : verification.status === 'rejected' ? 'طلب التوثيق مرفوض' : 'طلب التوثيق قيد المراجعة'}
              </p>
              {verification.notes && <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>{verification.notes}</p>}
            </div>
          </div>
        )}

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

        {/* Gallery */}
        {gallery.length > 0 && (
          <section aria-label="معرض الصور" style={{ marginBlockEnd: '1.5rem' }}>
            <h2 style={{ marginBlockEnd: '1rem' }}>الصور ({gallery.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))', gap: '0.75rem' }}>
              {gallery.map((img) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt="صورة من المعرض"
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '0.75rem', border: '1px solid var(--border)' }}
                />
              ))}
            </div>
          </section>
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
                    </div>
                    {service.descriptionAr && (
                      <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.6, margin: '0.25rem 0 0' }}>
                        {service.descriptionAr}
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

        {/* Trust history */}
        {trustHistory.length > 0 && (
          <section aria-label="سجل الثقة" style={{ marginBlockEnd: '1.5rem' }}>
            <div className="section-card">
              <h2>سجل الثقة</h2>
              <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                {trustHistory.map((entry) => (
                  <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    <span>
                      {entry.oldStatus ? `${entry.oldStatus} → ` : ''}{entry.newStatus}
                      {entry.reason && <span style={{ color: 'var(--muted)', marginRight: '0.5rem' }}>· {entry.reason}</span>}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>{new Date(entry.createdAt).toLocaleDateString('ar-SY')}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
