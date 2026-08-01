'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../lib/api-client';

export default function ProfessionalsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfessionalProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await api.professionals.getMine();
        setProfile(data.professional);
      } catch (err) {
        if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 401) {
          router.push('/auth/login');
          return;
        }
        if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 404) {
          setProfile(null);
        } else {
          setError(err instanceof Error ? err.message : 'تعذر التحميل.');
        }
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availabilityLabel = (a: string) => ({ available: '🟢 متاح', busy: '🟡 مشغول', unavailable: '🔴 غير متاح' }[a] ?? a);

  return (
    <main id="foundation-content" className="operations-shell" aria-label="ملفي المهني">
      <header className="operations-header">
        <div>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1>ملفي المهني</h1>
          <p>إدارة ملفك المهني على المنصة.</p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/professionals/new" className="foundation-action" style={{ marginBlockStart: 0 }}>
            {profile ? 'تعديل الملف' : '+ إنشاء ملف'}
          </Link>
          <Link href="/professionals/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث عن مهنيين</Link>
          <Link href="/admin" className="foundation-action" style={{ marginBlockStart: 0 }}>الإدارة</Link>
        </nav>
      </header>

      {error ? <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ padding: '2rem', color: '#52606d' }}>جاري التحميل...</p>
      ) : profile ? (
        <article className="operations-panel" style={{ maxWidth: '42rem' }}>
          <div className="panel-heading">
            <h2>{profile.headlineAr}</h2>
            <span className="status-badge">{availabilityLabel(profile.availability)}</span>
          </div>
          {profile.headlineEn && <p style={{ color: '#52606d', direction: 'ltr' }}>{profile.headlineEn}</p>}
          {profile.bioAr && <p>{profile.bioAr}</p>}
          <p style={{ fontSize: '0.875rem', color: '#52606d' }}>{profile.cityCode} · {profile.countryCode}</p>
          {profile.skills.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {profile.skills.map((s) => (
                <span key={s} style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: '999px', padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <Link href="/professionals/new" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center' }}>
            تعديل الملف
          </Link>
        </article>
      ) : (
        <article className="operations-panel" style={{ maxWidth: '32rem' }}>
          <div className="panel-heading"><h2>لا يوجد ملف مهني</h2></div>
          <p>لم تُنشئ ملفك المهني بعد.</p>
          <Link href="/professionals/new" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none' }}>إنشاء ملف مهني</Link>
        </article>
      )}
    </main>
  );
}
