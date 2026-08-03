'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../lib/api-client';

function AvailBadge({ av }: { av: string }) {
  if (av === 'available') return <span className="badge badge-available">🟢 متاح</span>;
  if (av === 'busy') return <span className="badge badge-busy">🟡 مشغول</span>;
  return <span className="badge badge-unavailable">🔴 غير متاح</span>;
}

export default function ProfessionalProfilesPage() {
  const router = useRouter();
  const [professionalProfile, setProfessionalProfile] = useState<PublicProfessionalProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProfessionalProfile() {
      try {
        const data = await api.professionals.getMine();
        setProfessionalProfile(data.professional);
      } catch (err) {
        const statusCode = err instanceof Error ? (err as Error & { statusCode?: number }).statusCode : undefined;
        if (statusCode === 401) {
          router.push('/auth/login');
          return;
        }
        if (statusCode !== 404) {
          setError(err instanceof Error ? err.message : 'تعذر تحميل الملف المهني.');
        }
      } finally {
        setIsLoading(false);
      }
    }

    void loadProfessionalProfile();
  }, []);

  return (
    <main id="foundation-content" className="page-shell" aria-label="الملفات المهنية">
      <div className="page-content">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBlockEnd: '1.5rem' }}>
          <div>
            <p className="eyebrow">خدمة الرقمية</p>
            <h1 style={{ margin: '0 0 0.35rem', fontSize: 'clamp(1.75rem, 5vw, 3rem)' }}>ملفي المهني</h1>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '1rem' }}>إدارة ملفك المهني وظهورك العام على المنصة.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Link href="/professional-profiles/new" className="filter-action" style={{ textDecoration: 'none' }}>
              {professionalProfile ? 'تعديل الملف' : '+ إنشاء ملف'}
            </Link>
            <Link href="/professional-profiles/search" className="filter-action-secondary" style={{ textDecoration: 'none' }}>تصفح المهنيين</Link>
          </div>
        </header>

        {error && <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p>}

        {isLoading ? (
          <div className="skeleton skeleton-card" style={{ maxWidth: '40rem' }} />
        ) : professionalProfile ? (
          <article className="card" style={{ maxWidth: '42rem' }}>
            <div className="card-body" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.375rem' }}>{professionalProfile.headlineAr}</h2>
                <AvailBadge av={professionalProfile.availability} />
              </div>
              {professionalProfile.headlineEn && (
                <p style={{ color: 'var(--muted)', direction: 'ltr', fontSize: '0.9375rem', margin: '0.35rem 0 0' }}>
                  {professionalProfile.headlineEn}
                </p>
              )}
              {professionalProfile.bioAr && (
                <p style={{ color: 'var(--muted)', fontSize: '0.9375rem', lineHeight: 1.7, margin: '0.75rem 0 0' }}>
                  {professionalProfile.bioAr}
                </p>
              )}
              <p style={{ color: 'var(--muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
                📍 {professionalProfile.cityCode} · {professionalProfile.countryCode}
              </p>
              {professionalProfile.skills.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  {professionalProfile.skills.map((skill) => (
                    <span key={skill} className="skill-tag">{skill}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="card-footer" style={{ display: 'flex', gap: '0.5rem' }}>
              <Link
                href={`/professional-profiles/${professionalProfile.id}`}
                className="foundation-action"
                style={{ marginBlockStart: 0, textDecoration: 'none', fontSize: '0.875rem', padding: '0.5rem 1rem' }}
              >
                عرض الملف العام
              </Link>
              <Link
                href="/professional-profiles/new"
                className="filter-action-secondary"
                style={{ textDecoration: 'none', fontSize: '0.875rem' }}
              >
                تعديل
              </Link>
            </div>
          </article>
        ) : (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">👤</span>
            <h2>لا يوجد ملف مهني</h2>
            <p>لم تُنشئ ملفك المهني بعد. أنشئه الآن لتظهر أمام العملاء في منطقتك.</p>
            <Link href="/professional-profiles/new" className="filter-action" style={{ textDecoration: 'none', marginTop: '0.5rem' }}>
              إنشاء ملف مهني
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
