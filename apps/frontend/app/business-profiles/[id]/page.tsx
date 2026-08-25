'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, BusinessBranch, BusinessSocialLink, MediaAsset, OpeningHours, PublicBusinessProfile, PublicServiceListing, VerificationRequest } from '../../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { ContactInquiryForm } from '../../../components/contact-inquiry-form';
import { ProviderQrAction } from './provider-qr-action';

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'مطعم',
  shop: 'محل',
  workshop: 'ورشة',
  service_business: 'خدمات',
  retail_business: 'تجزئة',
  factory: 'مصنع',
  supplier_business: 'توريد',
  company: 'شركة',
  doctor: 'طبيب',
  lawyer: 'محامي',
};



const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const SOCIAL_ICONS: Record<string, string> = {
  facebook: '📘',
  instagram: '📸',
  twitter: '🐦',
  whatsapp: '💬',
  telegram: '✈️',
  linkedin: '💼',
  youtube: '▶️',
  tiktok: '🎵',
};

function TrustBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return <span className="badge badge-approved" aria-label="ملف معتمد">✓ معتمد</span>;
  }
  if (status === 'suspended') {
    return <span className="badge badge-suspended" aria-label="ملف موقوف">✗ موقوف</span>;
  }
  return <span className="badge badge-pending" aria-label="قيد المراجعة">⏳ قيد المراجعة</span>;
}

function PriceType({ type }: { type: string }) {
  if (type === 'fixed') return <span className="badge badge-approved">سعر ثابت</span>;
  if (type === 'hourly') return <span className="badge badge-pending">بالساعة</span>;
  return <span className="badge badge-unavailable">قابل للتفاوض</span>;
}

export default function BusinessProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cities } = useSyrianCities();
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [hours, setHours] = useState<OpeningHours[]>([]);
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [socialLinks, setSocialLinks] = useState<BusinessSocialLink[]>([]);
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareMsg, setShareMsg] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [businessData, serviceData, mediaData, hoursData, branchData, socialData, verData] = await Promise.all([
          api.businesses.getPublic(id),
          api.services.listForOwner(id, 'business').catch(() => ({ services: [] })),
          api.businesses.getMedia(id).catch(() => ({ assets: [] })),
          api.businesses.getOpeningHours(id).catch(() => ({ hours: [] })),
          api.businesses.getBranches(id).catch(() => ({ branches: [] })),
          api.businesses.getSocialLinks(id).catch(() => ({ links: [] })),
          api.businesses.getVerificationStatus(id).catch(() => ({ status: null }))
        ]);
        setBusiness(businessData.business);
        setServices(serviceData.services);
        setMedia(mediaData.assets);
        setHours(hoursData.hours);
        setBranches(branchData.branches);
        setSocialLinks(socialData.links);
        setVerification(verData.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر التحميل.');
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [id]);

  function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      void navigator.share({ title: business?.name ?? '', url });
    } else {
      void navigator.clipboard.writeText(url).then(() => {
        setShareMsg('تم نسخ الرابط!');
        setTimeout(() => setShareMsg(''), 2000);
      });
    }
  }

  if (isLoading) {
    return (
      <main id="foundation-content" className="page-shell">
        <div className="page-content">
          <div className="skeleton" style={{ height: '14rem', borderRadius: '1rem', marginBlockEnd: '1.5rem' }} />
          <div className="skeleton skeleton-heading" />
          <div className="skeleton skeleton-text" style={{ width: '40%' }} />
        </div>
      </main>
    );
  }

  if (error || !business) {
    return (
      <main id="foundation-content" className="page-shell">
        <div className="page-content">
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">⚠️</span>
            <h2>تعذر التحميل</h2>
            <p>{error || 'لم يتم العثور على ملف العمل.'}</p>
            <Link href="/search" className="filter-action" style={{ textDecoration: 'none', display: 'inline-block', marginTop: '0.5rem' }}>
              العودة للبحث
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const logo = media.find((a) => a.assetType === 'logo');
  const cover = media.find((a) => a.assetType === 'cover');
  const gallery = media.filter((a) => a.assetType === 'gallery');
  const categoryLabel = CATEGORY_LABELS[business.categoryCode] ?? business.categoryCode;
  const localizedCity = cityLabel(business.cityCode, cities);
  const activeServices = services.filter((s) => s.status === 'active');

  // Phase E: Structured data (JSON-LD)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    description: business.descriptionAr ?? business.descriptionEn,
    telephone: business.phone,
    email: business.email,
    url: business.website,
    address: business.addressAr ? { '@type': 'PostalAddress', streetAddress: business.addressAr, addressCountry: business.countryCode } : undefined,
    geo: business.lat && business.lng ? { '@type': 'GeoCoordinates', latitude: business.lat, longitude: business.lng } : undefined,
    image: logo?.url
  };

  return (
    <main id="foundation-content" className="page-shell" aria-label={`ملف ${business.name}`}>
      {/* Phase E: Structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="page-content">
        {/* Cover */}
        <div style={{ borderRadius: '1rem', overflow: 'hidden', marginBlockEnd: '0', height: '12rem', background: 'var(--border)', position: 'relative' }}>
          {cover
            ? <img src={cover.url} alt="غلاف العمل" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div className="business-cover-placeholder" aria-hidden="true"><span>خدمة</span></div>
          }
          {business.isFeatured && (
            <span style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: '#FFD700', color: '#333', borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: '0.8rem', fontWeight: 700 }}>
              ⭐ مميز
            </span>
          )}
        </div>

        {/* Header */}
        <div className="profile-header-card" style={{ position: 'relative', paddingTop: '1rem' }}>
          {/* Logo */}
          <div style={{ position: 'absolute', top: '-2.5rem', right: '1.5rem', width: '5rem', height: '5rem', borderRadius: '1rem', border: '3px solid var(--surface)', overflow: 'hidden', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem' }}>
            {logo
              ? <img src={logo.url} alt="شعار العمل" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span aria-hidden="true">{business.name.charAt(0)}</span>
            }
          </div>

          <div style={{ padding: '3.5rem 1.5rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: '0 0 0.4rem', fontSize: 'clamp(1.4rem, 4vw, 2.25rem)' }}>{business.name}</h1>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9375rem' }}>
                  {categoryLabel} · {localizedCity} · {business.countryCode.toUpperCase()}
                </p>
                {business.addressAr && (
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>📍 {business.addressAr}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <TrustBadge status={business.trustStatus} />
                {business.visibility === 'public'
                  ? <span className="badge badge-available">عام</span>
                  : <span className="badge badge-unavailable">خاص</span>
                }
              </div>
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              {business.visibility === 'public' && business.trustStatus === 'approved' && (
                <ContactInquiryForm target={{ type: 'business', id: business.id }} providerName={business.name} />
              )}
              <button type="button" onClick={() => router.back()} className="filter-action-secondary">← رجوع</button>
              {business.phone && (
                <a href={`tel:${business.phone}`} className="filter-action-secondary" style={{ textDecoration: 'none' }}>📞 اتصل</a>
              )}
              {business.email && (
                <a href={`mailto:${business.email}`} className="filter-action-secondary" style={{ textDecoration: 'none' }}>✉ راسل</a>
              )}
              {business.website && (
                <a href={business.website} target="_blank" rel="noopener noreferrer" className="filter-action-secondary" style={{ textDecoration: 'none' }}>🌐 الموقع</a>
              )}
              <ProviderQrAction providerName={business.name} />
              <button type="button" onClick={handleShare} className="filter-action-secondary" style={{ position: 'relative' }}>
                🔗 مشاركة
                {shareMsg && <span style={{ position: 'absolute', top: '-2rem', right: 0, background: 'var(--foreground)', color: 'var(--surface)', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{shareMsg}</span>}
              </button>
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

        {/* Social links */}
        {socialLinks.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBlockEnd: '1.25rem' }}>
            {socialLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '999px', padding: '0.4rem 0.85rem', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', color: 'var(--foreground)' }}
                aria-label={`${link.platform}`}
              >
                {SOCIAL_ICONS[link.platform.toLowerCase()] ?? '🔗'} {link.platform}
              </a>
            ))}
          </div>
        )}

        {/* Description */}
        {(business.descriptionAr || business.descriptionEn) && (
          <div className="section-card" style={{ marginBlockEnd: '1.5rem' }}>
            <h2>عن العمل</h2>
            {business.descriptionAr && <p style={{ lineHeight: 1.8, margin: 0 }}>{business.descriptionAr}</p>}
            {business.descriptionEn && (
              <p style={{ color: 'var(--muted)', direction: 'ltr', marginTop: '0.75rem', lineHeight: 1.7, fontSize: '0.9rem', margin: '0.75rem 0 0' }}>
                {business.descriptionEn}
              </p>
            )}
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

        {/* Opening Hours */}
        {hours.length > 0 && (
          <section aria-label="أوقات العمل" style={{ marginBlockEnd: '1.5rem' }}>
            <div className="section-card">
              <h2>أوقات العمل</h2>
              <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                {hours.map((h) => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>{DAY_NAMES[h.dayOfWeek] ?? h.dayOfWeek}</span>
                    <span style={{ color: h.isClosed ? 'var(--muted)' : 'var(--foreground)' }}>
                      {h.isClosed ? 'مغلق' : `${h.openTime} — ${h.closeTime}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Google Maps */}
        {business.lat && business.lng && (
          <section aria-label="الموقع على الخريطة" style={{ marginBlockEnd: '1.5rem' }}>
            <h2 style={{ marginBlockEnd: '0.75rem' }}>الموقع</h2>
            <a
              href={`https://www.google.com/maps?q=${business.lat},${business.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', borderRadius: '1rem', overflow: 'hidden', border: '1px solid var(--border)', textDecoration: 'none' }}
              aria-label="افتح الموقع على خرائط جوجل"
            >
              <div style={{ background: 'var(--accent-light)', padding: '2rem', textAlign: 'center', color: 'var(--accent-dark)' }}>
                <p style={{ margin: 0, fontSize: '1.5rem' }}>🗺️</p>
                <p style={{ margin: '0.5rem 0 0', fontWeight: 700 }}>عرض الموقع على خرائط جوجل</p>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--muted)' }}>{business.lat.toFixed(5)}, {business.lng.toFixed(5)}</p>
              </div>
            </a>
          </section>
        )}

        {/* Branches */}
        {branches.length > 0 && (
          <section aria-label="الفروع" style={{ marginBlockEnd: '1.5rem' }}>
            <h2 style={{ marginBlockEnd: '0.75rem' }}>الفروع ({branches.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))', gap: '1rem' }}>
              {branches.map((branch) => (
                <div key={branch.id} className="card">
                  <div className="card-body">
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBlockEnd: '0.25rem' }}>
                      <h3 className="card-title" style={{ margin: 0 }}>{branch.nameAr}</h3>
                      {branch.isMain && <span className="badge badge-approved" style={{ fontSize: '0.7rem' }}>رئيسي</span>}
                    </div>
                    {branch.addressAr && <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>📍 {branch.addressAr}</p>}
                    {branch.phone && <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>📞 <a href={`tel:${branch.phone}`} style={{ color: 'var(--accent)' }}>{branch.phone}</a></p>}
                    {branch.lat && branch.lng && (
                      <a href={`https://www.google.com/maps?q=${branch.lat},${branch.lng}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--accent)', textDecoration: 'none' }}>
                        🗺️ الخريطة
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Services */}
        {activeServices.length > 0 && (
          <section aria-label="الخدمات" style={{ marginBlockEnd: '1.5rem' }}>
            <h2 style={{ marginBlockEnd: '0.75rem' }}>الخدمات ({activeServices.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))', gap: '1rem' }}>
              {activeServices.map((service) => (
                <article className="card" key={service.id}>
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <h3 className="card-title">{service.titleAr}</h3>
                      <PriceType type={service.priceType} />
                    </div>
                    <p className="card-meta">{CATEGORY_LABELS[service.categoryCode] ?? 'خدمة محلية'}</p>
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

      </div>
    </main>
  );
}
