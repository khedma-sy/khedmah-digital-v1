'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicBusinessProfile, PublicServiceListing } from '../../../lib/api-client';

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'مطعم',
  shop: 'محل',
  workshop: 'ورشة',
  service_business: 'خدمات',
  retail_business: 'تجزئة',
  factory: 'مصنع',
  supplier_business: 'توريد',
  company: 'شركة',
};

const CITY_LABELS: Record<string, string> = {
  damascus: 'دمشق',
  aleppo: 'حلب',
  homs: 'حمص',
  latakia: 'اللاذقية',
  hama: 'حماة',
  tartus: 'طرطوس',
  'deir-ez-zor': 'دير الزور',
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
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [businessData, serviceData] = await Promise.all([
          api.businesses.getPublic(id),
          api.services.listForOwner(id, 'business').catch(() => ({ services: [] }))
        ]);
        setBusiness(businessData.business);
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
          <div className="skeleton skeleton-text" style={{ width: '40%' }} />
          <div className="skeleton skeleton-text" style={{ width: '60%', marginTop: '1rem' }} />
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

  const categoryLabel = CATEGORY_LABELS[business.categoryCode] ?? business.categoryCode;
  const cityLabel = CITY_LABELS[business.cityCode] ?? business.cityCode;
  const activeServices = services.filter((s) => s.status === 'active');

  return (
    <main id="foundation-content" className="page-shell" aria-label={`ملف ${business.name}`}>
      <div className="page-content">
        {/* Header card with cover */}
        <div className="profile-header-card" style={{ position: 'relative', paddingTop: 0, overflow: 'hidden' }}>
          {/* Cover */}
          <div className="profile-cover">
            <div className="profile-cover-placeholder" aria-hidden="true">🏢</div>
          </div>

          {/* Avatar */}
          <div style={{ position: 'relative', paddingTop: '3.5rem', paddingRight: '1.5rem' }}>
            <div
              className="profile-avatar"
              aria-hidden="true"
              style={{ position: 'absolute', top: '-2.5rem', right: '1.5rem', fontSize: '1.75rem' }}
            >
              {business.name.charAt(0)}
            </div>
          </div>

          <div style={{ padding: '0 1.5rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ margin: '0 0 0.4rem', fontSize: 'clamp(1.5rem, 4vw, 2.25rem)' }}>{business.name}</h1>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.9375rem' }}>
                  {categoryLabel} · {cityLabel} · {business.countryCode.toUpperCase()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <TrustBadge status={business.trustStatus} />
                {business.visibility === 'public'
                  ? <span className="badge badge-available">عام</span>
                  : <span className="badge badge-unavailable">خاص</span>
                }
              </div>
            </div>

            {/* Back + CTA */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => router.back()}
                className="filter-action-secondary"
              >
                ← رجوع
              </button>
              <Link href="/search?type=business" className="filter-action-secondary" style={{ textDecoration: 'none' }}>
                تصفح الأعمال
              </Link>
            </div>
          </div>
        </div>

        {/* Contact info */}
        {(business.phone || business.email || business.website) && (
          <div className="info-grid" style={{ marginBlockEnd: '1.5rem' }}>
            {business.phone && (
              <div className="info-item">
                <span className="info-item-label">📞 الهاتف</span>
                <a href={`tel:${business.phone}`} className="info-item-value" style={{ color: 'var(--accent)' }}>
                  {business.phone}
                </a>
              </div>
            )}
            {business.email && (
              <div className="info-item">
                <span className="info-item-label">✉ البريد الإلكتروني</span>
                <a href={`mailto:${business.email}`} className="info-item-value" style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
                  {business.email}
                </a>
              </div>
            )}
            {business.website && (
              <div className="info-item">
                <span className="info-item-label">🌐 الموقع الإلكتروني</span>
                <a href={business.website} target="_blank" rel="noopener noreferrer" className="info-item-value" style={{ color: 'var(--accent)', fontSize: '0.875rem' }}>
                  {business.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        {(business.descriptionAr || business.descriptionEn) && (
          <div className="section-card">
            <h2>عن العمل</h2>
            {business.descriptionAr && <p style={{ lineHeight: 1.8 }}>{business.descriptionAr}</p>}
            {business.descriptionEn && (
              <p style={{ color: 'var(--muted)', direction: 'ltr', marginTop: '0.75rem', lineHeight: 1.7, fontSize: '0.9rem' }}>
                {business.descriptionEn}
              </p>
            )}
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
                      <PriceType type={service.priceType} />
                    </div>
                    <p className="card-meta">{service.categoryCode}</p>
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
                    {service.titleEn && (
                      <p style={{ color: 'var(--muted)', direction: 'ltr', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
                        {service.titleEn}
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
            <p>لم يُضف هذا العمل خدمات بعد.</p>
          </div>
        )}
      </div>
    </main>
  );
}
