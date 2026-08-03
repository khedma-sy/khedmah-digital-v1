'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';

function TrustBadge({ status }: { status: string }) {
  if (status === 'approved') return <span className="badge badge-approved">✓ معتمد</span>;
  if (status === 'suspended') return <span className="badge badge-suspended">✗ موقوف</span>;
  return <span className="badge badge-pending">⏳ قيد المراجعة</span>;
}

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
    <main id="foundation-content" className="page-shell" aria-label="ملفات الأعمال">
      <div className="page-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBlockEnd: '1.5rem' }}>
          <div>
            <p className="eyebrow">خدمة الرقمية</p>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.75rem, 5vw, 3rem)' }}>ملفات الأعمال</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1rem' }}>إدارة ملفات أعمالك وعرضها للعملاء.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Link href="/business-profiles/new" className="filter-action" style={{ textDecoration: 'none' }}>+ إنشاء ملف</Link>
            <Link href="/search?type=business" className="filter-action-secondary" style={{ textDecoration: 'none' }}>تصفح الأعمال</Link>
          </div>
        </header>

        {error && <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p>}

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-card" />
            ))}
          </div>
        ) : businessProfiles.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">🏢</span>
            <h2>لا توجد ملفات أعمال</h2>
            <p>لم تُنشئ أي ملف عمل بعد. أنشئ ملفك الأول وابدأ ظهورك على المنصة.</p>
            <Link href="/business-profiles/new" className="filter-action" style={{ textDecoration: 'none', marginTop: '0.5rem' }}>
              إنشاء أول ملف
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: '1rem' }}>
            {businessProfiles.map((profile) => (
              <article className="card" key={profile.id}>
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <h2 className="card-title">{profile.name}</h2>
                    <TrustBadge status={profile.trustStatus} />
                  </div>
                  <p className="card-meta">
                    {profile.categoryCode} · {profile.cityCode} ·{' '}
                    {profile.visibility === 'public' ? 'عام' : 'خاص'}
                  </p>
                  {profile.descriptionAr && (
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: '0.25rem 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {profile.descriptionAr}
                    </p>
                  )}
                  {(profile.phone || profile.email) && (
                    <p className="card-meta" style={{ marginTop: '0.35rem' }}>
                      {profile.phone && `📞 ${profile.phone}`}
                      {profile.phone && profile.email && ' · '}
                      {profile.email && `✉ ${profile.email}`}
                    </p>
                  )}
                </div>
                <div className="card-footer">
                  <Link
                    href={`/business-profiles/${profile.id}`}
                    className="foundation-action"
                    style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center', display: 'block', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                  >
                    عرض الملف
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
