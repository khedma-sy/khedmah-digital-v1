'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicOrganization, PublicUserProfile } from '../../lib/api-client';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [organizations, setOrganizations] = useState<PublicOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [sessionData, orgsData] = await Promise.all([
          api.auth.session(),
          api.organizations.listMine()
        ]);
        setUser(sessionData.user);
        setOrganizations(orgsData.organizations);
      } catch (err) {
        if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 401) {
          router.push('/auth/login');
          return;
        }
        setError(err instanceof Error ? err.message : 'تعذر تحميل البيانات.');
      } finally {
        setIsLoading(false);
      }
    }
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    try {
      await api.auth.logout();
    } finally {
      router.push('/auth/login');
    }
  }

  if (isLoading) {
    return (
      <main id="foundation-content" className="identity-shell" aria-label="لوحة الإدارة">
        <section className="identity-card">
          <p className="eyebrow">Khedmah Digital V1 · Admin</p>
          <p>جاري التحميل...</p>
        </section>
      </main>
    );
  }

  return (
    <main id="foundation-content" className="operations-shell" aria-label="لوحة الإدارة">
      <header className="operations-header">
        <div>
          <p className="eyebrow">KHEDMA DIGITAL · ADMIN</p>
          <h1>لوحة الإدارة</h1>
          <p>إدارة الحساب والمنظمات.</p>
        </div>
        <span className="status-badge">نشط · تشغيل محلي</span>
      </header>

      <nav className="admin-navigation" aria-label="التنقل الإداري">
        <Link href="/">الرئيسية</Link>
        <Link href="/search">البحث</Link>
        <Link href="/businesses">صفحات الأعمال</Link>
        <Link href="/professionals">الملف المهني</Link>
        <Link href="/organizations">المنظمات</Link>
        <Link href="/users/me">الملف الأساسي</Link>
        <Link href="/admin/operations-product">Operations Product</Link>
      </nav>

      {error ? <p className="form-error" role="alert" style={{ padding: '1rem' }}>{error}</p> : null}

      {user ? (
        <section className="operations-summary" aria-label="معلومات الجلسة">
          <article>
            <strong>{user.profile.displayName}</strong>
            <span>الاسم الظاهر</span>
          </article>
          <article>
            <strong>{user.email}</strong>
            <span>البريد الإلكتروني</span>
          </article>
          <article>
            <strong>{user.status}</strong>
            <span>حالة الحساب</span>
          </article>
          <article>
            <strong>{organizations.length}</strong>
            <span>عدد المنظمات</span>
          </article>
        </section>
      ) : null}

      <section className="operations-grid" aria-label="المنظمات">
        {organizations.length === 0 ? (
          <article className="operations-panel">
            <div className="panel-heading">
              <h2>لا توجد منظمات</h2>
            </div>
            <p>لم تنشئ أي منظمة بعد.</p>
            <Link href="/organizations/new" className="foundation-action" style={{ display: 'inline-block', padding: '0.5rem 1rem' }}>
              إنشاء منظمة
            </Link>
          </article>
        ) : (
          organizations.map((org) => (
            <article className="operations-panel" key={org.id}>
              <div className="panel-heading">
                <h2>{org.name}</h2>
                <span>مالك</span>
              </div>
              <p>{org.memberCount} عضو · معرّف: {org.id.slice(0, 8)}…</p>
            </article>
          ))
        )}
      </section>

      <div style={{ padding: '1.5rem', display: 'flex', gap: '0.75rem' }}>
        <Link href="/organizations/new" className="foundation-action">إنشاء منظمة جديدة</Link>
        <button
          type="button"
          onClick={handleLogout}
          style={{ background: 'none', border: '1px solid #ccc', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
        >
          تسجيل الخروج
        </button>
      </div>
    </main>
  );
}
