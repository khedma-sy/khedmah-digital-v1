'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicLocationRecord } from '../../lib/api-client';

export default function LocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<PublicLocationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadLocations() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.locations.listMine();
      setLocations(data.locations);
    } catch (err) {
      const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      if (statusCode === 404 || statusCode === 501) {
        setLocations([]);
        setError('واجهة المواقع قيد الربط الخلفي حالياً.');
      } else {
        setError(err instanceof Error ? err.message : 'تعذر تحميل المواقع.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main id="foundation-content" className="identity-shell" aria-label="المواقع">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>المواقع</h1>
        <p>إدارة المواقع المرتبطة بالملفات والخدمات.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={loadLocations}>
            {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
          </button>
          <Link className="foundation-action" href="/business-profiles">ملفات الأعمال</Link>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/service-catalog">دليل الخدمات</Link>
          <Link className="foundation-action" href="/search">البحث</Link>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {locations.length === 0 && !isLoading ? (
          <p style={{ marginTop: '1rem' }}>لا توجد مواقع حالياً.</p>
        ) : (
          <ul className="foundation-list" aria-label="قائمة المواقع">
            {locations.map((location) => (
              <li key={location.id}>
                <strong>{location.label}</strong>
                <p>{location.locationType} · {location.status} · {location.visibility}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
