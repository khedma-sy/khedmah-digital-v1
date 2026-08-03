'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicServiceCatalogEntry } from '../../lib/api-client';

export default function ServiceCatalogPage() {
  const router = useRouter();
  const [services, setServices] = useState<PublicServiceCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadServices() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.serviceCatalog.listMine();
      setServices(data.services);
    } catch (err) {
      const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      if (statusCode === 404 || statusCode === 501) {
        setServices([]);
        setError('واجهة دليل الخدمات قيد الربط الخلفي حالياً.');
      } else {
        setError(err instanceof Error ? err.message : 'تعذر تحميل دليل الخدمات.');
      }
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
        <p>عرض خدمات الأعمال والمهنيين ضمن EO-009.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={loadServices}>
            {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
          </button>
          <Link className="foundation-action" href="/business-profiles">ملفات الأعمال</Link>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/locations">المواقع</Link>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {services.length === 0 && !isLoading ? (
          <p style={{ marginTop: '1rem' }}>لا توجد خدمات حالياً.</p>
        ) : (
          <ul className="foundation-list" aria-label="قائمة الخدمات">
            {services.map((service) => (
              <li key={service.id}>
                <strong>{service.title}</strong>
                <p>{service.serviceType} · {service.status} · {service.visibility}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
