'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../lib/api-client';

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
    <main id="foundation-content" className="operations-shell" aria-label="الملفات المهنية">
      <header className="operations-header">
        <div>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1>الملفات المهنية</h1>
          <p>إدارة ملفك المهني وربطه بظهورك العام على المنصة.</p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/professional-profiles/new" className="foundation-action" style={{ marginBlockStart: 0 }}>
            {professionalProfile ? 'تعديل الملف' : '+ إنشاء ملف'}
          </Link>
          <Link href="/professional-profiles/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث عن مهنيين</Link>
          <Link href="/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث العام</Link>
        </nav>
      </header>

      {error ? <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ padding: '2rem', color: '#52606d' }}>جاري التحميل...</p>
      ) : professionalProfile ? (
        <article className="operations-panel" style={{ maxWidth: '42rem' }}>
          <div className="panel-heading">
            <h2>{professionalProfile.headlineAr}</h2>
            <span className="status-badge">
              {professionalProfile.availability === 'available'
                ? '🟢 متاح'
                : professionalProfile.availability === 'busy'
                  ? '🟡 مشغول'
                  : '🔴 غير متاح'}
            </span>
          </div>
          {professionalProfile.headlineEn && <p style={{ color: '#52606d', direction: 'ltr' }}>{professionalProfile.headlineEn}</p>}
          {professionalProfile.bioAr && <p>{professionalProfile.bioAr}</p>}
          <p style={{ fontSize: '0.875rem', color: '#52606d' }}>{professionalProfile.cityCode} · {professionalProfile.countryCode}</p>
          {professionalProfile.skills.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {professionalProfile.skills.map((skill) => (
                <span key={skill} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
                  {skill}
                </span>
              ))}
            </div>
          )}
          <Link href="/professional-profiles/new" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center' }}>
            تعديل الملف
          </Link>
        </article>
      ) : (
        <article className="operations-panel" style={{ maxWidth: '32rem' }}>
          <div className="panel-heading"><h2>لا يوجد ملف مهني</h2></div>
          <p>لم تُنشئ ملفك المهني بعد.</p>
          <Link href="/professional-profiles/new" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none' }}>إنشاء ملف مهني</Link>
        </article>
      )}
    </main>
  );
}
