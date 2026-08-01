'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicBusinessProfile } from '../../lib/api-client';

export default function BusinessesPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.businesses.listMine();
      setBusinesses(data.businesses);
    } catch (err) {
      if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'تعذر التحميل.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trustBadge = (status: string) => {
    if (status === 'approved') return '✓ معتمد';
    if (status === 'suspended') return '✗ موقوف';
    return '⏳ قيد المراجعة';
  };

  return (
    <main id="foundation-content" className="operations-shell" aria-label="أعمالي">
      <header className="operations-header">
        <div>
          <p className="eyebrow">خدمة الرقمية</p>
          <h1>أعمالي</h1>
          <p>إدارة صفحات أعمالك.</p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/businesses/new" className="foundation-action" style={{ marginBlockStart: 0 }}>+ إضافة عمل</Link>
          <Link href="/search" className="foundation-action" style={{ marginBlockStart: 0 }}>البحث</Link>
          <Link href="/admin" className="foundation-action" style={{ marginBlockStart: 0 }}>الإدارة</Link>
        </nav>
      </header>

      {error ? <p className="form-error" role="alert" style={{ marginBlockEnd: '1rem' }}>{error}</p> : null}

      {isLoading ? (
        <p style={{ padding: '2rem', color: '#52606d' }}>جاري التحميل...</p>
      ) : businesses.length === 0 ? (
        <article className="operations-panel" style={{ maxWidth: '32rem' }}>
          <div className="panel-heading"><h2>لا توجد أعمال</h2></div>
          <p>لم تُنشئ أي صفحة عمل بعد.</p>
          <Link href="/businesses/new" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none' }}>إنشاء أول صفحة</Link>
        </article>
      ) : (
        <div className="operations-grid">
          {businesses.map((b) => (
            <article className="operations-panel" key={b.id}>
              <div className="panel-heading">
                <h2>{b.name}</h2>
                <span className="status-badge">{trustBadge(b.trustStatus)}</span>
              </div>
              <p>{b.descriptionAr ?? 'لا يوجد وصف.'}</p>
              <p style={{ fontSize: '0.875rem', color: '#52606d' }}>
                {b.categoryCode} · {b.cityCode} · {b.visibility === 'public' ? 'عام' : 'خاص'}
              </p>
              <Link href={`/businesses/${b.id}`} className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', textAlign: 'center' }}>
                عرض / تعديل
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
