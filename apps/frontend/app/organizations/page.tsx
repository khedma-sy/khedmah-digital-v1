'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicOrganization } from '../../lib/api-client';

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<PublicOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOrganizations() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.organizations.listMine();
      setOrganizations(data.organizations);
    } catch (err) {
      if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 401) {
        router.push('/auth/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'تعذر تحميل المنظمات.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganizations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    try {
      await api.auth.logout();
    } finally {
      router.push('/auth/login');
    }
  }

  return (
    <main id="foundation-content" className="identity-shell" aria-label="مساحة الأعمال">
      <section className="identity-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>مساحة الأعمال</h1>
        <p>أنشئ جهة عمل تجمع فريقك وملفات أعمالك في مساحة واحدة. تظهر هنا الجهات التي تملكها أو تشارك في إدارتها.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="foundation-action" type="button" aria-busy={isLoading} disabled={isLoading} onClick={loadOrganizations}>
            {isLoading ? 'جاري التحديث...' : 'تحديث القائمة'}
          </button>
          <Link className="foundation-action" href="/organizations/new">إنشاء منظمة جديدة</Link>
          <Link className="foundation-action" href="/business-profiles">ملفات الأعمال</Link>
          <Link className="foundation-action" href="/professional-profiles">الملفات المهنية</Link>
          <Link className="foundation-action" href="/service-catalog">دليل الخدمات</Link>
          <Link className="foundation-action" href="/locations">المواقع</Link>
          <Link className="foundation-action" href="/search">البحث</Link>
          <Link className="foundation-action" href="/admin">لوحة الإدارة</Link>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {organizations.length === 0 && !isLoading ? (
          <p style={{ marginTop: '1rem' }}>لا توجد منظمات بعد. أنشئ منظمتك الأولى!</p>
        ) : (
          <ul className="foundation-list" aria-label="قائمة المنظمات">
            {organizations.map((org) => (
              <li key={org.id}>
                <strong>{org.name}</strong>
                <span style={{ marginRight: '0.5rem', color: '#666', fontSize: '0.875rem' }}>
                  ({org.memberCount} عضو)
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={handleLogout}
          style={{ marginTop: '1.5rem', background: 'none', border: '1px solid #ccc', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
        >
          تسجيل الخروج
        </button>
      </section>
    </main>
  );
}
