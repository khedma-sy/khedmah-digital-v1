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
      const data = await api.businesses.listMine();
      setBusinessProfiles(data.businesses);
    } catch (err) {
      const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'تعذر تحميل ملفات الأعمال.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadBusinessProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main id="foundation-content" className="operations-shell" aria-label="ملفات الأعمال">
      <header className="operations-header">
        <div>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1>ملفات الأعمال</h1>
          <p>إدارة ملفات أعمالك وربطها بالخدمات العامة المعتمدة.</p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/business-profiles/new" className="foundation-action" style={{ marginBlockStart: 0 }}>+ إنشاء ملف عمل</Link>
          <Link href="/service-catalog" className="foundation-action" style={{ marginBlockStart: 0 }}>دليل الخدمات</Link>
          <Link href="/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث</Link>
        </nav>
      </header>

      {error ? <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ padding: '2rem', color: '#52606d' }}>جاري التحميل...</p>
      ) : businessProfiles.length === 0 ? (
        <article className="operations-panel" style={{ maxWidth: '32rem' }}>
          <div className="panel-heading"><h2>لا توجد ملفات أعمال</h2></div>
          <p>لم تُنشئ أي ملف عمل بعد.</p>
          <Link href="/business-profiles/new" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none' }}>إنشاء أول ملف</Link>
        </article>
      ) : (
        <div className="operations-grid">
          {businessProfiles.map((profile) => (
            <article className="operations-panel" key={profile.id}>
              <div className="panel-heading">
                <h2>{profile.name}</h2>
                <span className="status-badge">{profile.trustStatus === 'approved' ? '✓ معتمد' : profile.trustStatus === 'suspended' ? '✗ موقوف' : '⏳ قيد المراجعة'}</span>
              </div>
              <p>{profile.descriptionAr ?? 'لا يوجد وصف.'}</p>
              <p style={{ fontSize: '0.875rem', color: '#52606d' }}>
                {profile.categoryCode} · {profile.cityCode} · {profile.visibility === 'public' ? 'عام' : 'خاص'}
              </p>
              <Link href={`/business-profiles/${profile.id}`} className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center' }}>
                عرض الملف
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
