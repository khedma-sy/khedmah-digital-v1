'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';

const CATEGORIES = [
  { code: '', label: 'الكل' },
  { code: 'restaurant', label: 'مطاعم' },
  { code: 'shop', label: 'محلات' },
  { code: 'workshop', label: 'ورش' },
  { code: 'service_business', label: 'خدمات' },
  { code: 'doctor', label: 'طبيب' },
  { code: 'lawyer', label: 'محامي' },
  { code: 'engineer', label: 'مهندس' },
  { code: 'consultant', label: 'مستشار' },
  { code: 'freelancer', label: 'مستقل' },
];

function PriceTypeLabel({ type }: { type: string }) {
  if (type === 'fixed') return <span className="badge badge-approved">سعر ثابت</span>;
  if (type === 'hourly') return <span className="badge badge-pending">بالساعة</span>;
  return <span className="badge badge-unavailable">قابل للتفاوض</span>;
}

export default function ServiceCatalogPage() {
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [total, setTotal] = useState(0);

  async function loadServices(catCode = activeCategory) {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.services.search({ categoryCode: catCode || undefined });
      setServices(data.services);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل دليل الخدمات.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCategory(code: string) {
    setActiveCategory(code);
    void loadServices(code);
  }

  return (
    <main id="foundation-content" className="page-shell" aria-label="دليل الخدمات">
      <div className="page-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBlockEnd: '1.5rem' }}>
          <div>
            <p className="eyebrow">خدمة الرقمية</p>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.75rem, 5vw, 3rem)' }}>دليل الخدمات</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1rem' }}>
              تصفح الخدمات المتاحة من الأعمال والمهنيين المعتمدين.
            </p>
          </div>
          <Link href="/business-profiles/new" className="filter-action" style={{ textDecoration: 'none' }}>
            + أضف خدمة
          </Link>
        </header>

        {/* Category filter tabs */}
        <nav className="type-tabs" aria-label="تصفية الخدمات">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.code}
              type="button"
              className={`type-tab${activeCategory === cat.code ? ' active' : ''}`}
              onClick={() => handleCategory(cat.code)}
              disabled={isLoading}
            >
              {cat.label}
            </button>
          ))}
        </nav>

        {error && <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p>}

        {!isLoading && services.length > 0 && (
          <p className="result-count">{total} خدمة متاحة</p>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div aria-busy="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-card" style={{ height: '11rem' }} />
            ))}
          </div>
        )}

        {/* Services grid */}
        {!isLoading && services.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))', gap: '1rem' }}>
            {services.map((service) => (
              <article className="card" key={service.id}>
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <h2 className="card-title">{service.titleAr}</h2>
                    <PriceTypeLabel type={service.priceType} />
                  </div>
                  <p className="card-meta">
                    {CATEGORIES.find((c) => c.code === service.categoryCode)?.label ?? service.categoryCode} ·{' '}
                    {service.ownerType === 'business' ? 'عمل' : 'مهني'}
                  </p>
                  {service.descriptionAr && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: '0.25rem 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {service.descriptionAr}
                    </p>
                  )}
                  {service.price != null && (
                    <p style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.0625rem', margin: '0.5rem 0 0' }}>
                      {service.price.toLocaleString('ar-SY')} {service.priceCurrency ?? 'SYP'}
                    </p>
                  )}
                </div>
                <div className="card-footer">
                  <Link
                    href={service.ownerType === 'business' ? `/business-profiles/${service.ownerId}` : `/professional-profiles/${service.ownerId}`}
                    style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}
                  >
                    عرض الملف ←
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && services.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">🛠</span>
            <h2>لا توجد خدمات</h2>
            <p>
              {activeCategory
                ? 'لا توجد خدمات في هذا التصنيف حالياً.'
                : 'لم يُضف أحد خدمات بعد.'}
            </p>
            {activeCategory && (
              <button type="button" className="filter-action" onClick={() => handleCategory('')}>
                عرض كل الخدمات
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
