'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';

export default function BusinessProfilesPage() {
  const router = useRouter();
  const [businessProfiles, setBusinessProfiles] = useState<PublicBusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadBusinessProfiles() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.businessProfiles.listMine();
      setBusinessProfiles(data.businessProfiles);
    } catch (err) {
      const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      if (statusCode === 404 || statusCode === 501) {
        setBusinessProfiles([]);
        setError('واجهة ملفات الأعمال قيد الربط الخلفي حالياً.');
      } else {
        setError(err instanceof Error ? err.message : 'تعذر تحميل ملفات الأعمال.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadBusinessProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main id="foundation-content" className="identity-shell" aria-label="ملفات الأعمال">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>ملفات الأعمال</h1>
        <p>طبقة عرض ملفات الأعمال ضمن EO-009.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={loadBusinessProfiles}>
            {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
          </button>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/service-catalog">دليل الخدمات</Link>
          <Link className="foundation-action" href="/locations">المواقع</Link>
          <Link className="foundation-action" href="/search">البحث</Link>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {businessProfiles.length === 0 && !isLoading ? (
          <p style={{ marginTop: '1rem' }}>لا توجد ملفات أعمال حالياً.</p>
        ) : (
          <ul className="foundation-list" aria-label="قائمة ملفات الأعمال">
            {businessProfiles.map((profile) => (
              <li key={profile.id}>
                <strong>{profile.displayName}</strong>
                <p>{profile.categoryRef} · {profile.status} · {profile.visibility}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
