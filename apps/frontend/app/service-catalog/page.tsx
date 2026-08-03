'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, PublicServiceListing } from '../../lib/api-client';

export default function ServiceCatalogPage() {
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [categoryCode, setCategoryCode] = useState('');

  async function loadServices(nextCategoryCode = categoryCode) {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.services.search({ categoryCode: nextCategoryCode || undefined });
      setServices(data.services);
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

  return (
    <main id="foundation-content" className="identity-shell" aria-label="دليل الخدمات">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>دليل الخدمات</h1>
        <p>عرض الخدمات العامة الصالحة للظهور من ملفات الأعمال والملفات المهنية المؤهلة.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={() => void loadServices()}>
            {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
          </button>
          <Link className="foundation-action" href="/business-profiles">ملفات الأعمال</Link>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/locations">المواقع</Link>
        </div>
        <label style={{ display: 'grid', gap: '0.35rem', marginTop: '1rem' }}>
          تصفية حسب التصنيف
          <input
            type="text"
            value={categoryCode}
            onChange={(event) => setCategoryCode(event.target.value)}
            placeholder="restaurant"
          />
        </label>
        <button
          className="foundation-action"
          type="button"
          aria-busy={isLoading}
          disabled={isLoading}
          onClick={() => void loadServices(categoryCode)}
        >
          تطبيق التصفية
        </button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {services.length === 0 && !isLoading ? (
          <p style={{ marginTop: '1rem' }}>لا توجد خدمات حالياً.</p>
        ) : (
          <ul className="foundation-list" aria-label="قائمة الخدمات">
            {services.map((service) => (
              <li key={service.id}>
                <strong>{service.titleAr}</strong>
                <p>{service.categoryCode} · {service.priceType} · {service.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
