import Link from 'next/link';

export default function Home() {
  return (
    <main id="foundation-content" className="foundation-shell" aria-label="Khedmah Digital V1 platform foundation">
      <section className="foundation-card">
        <p className="eyebrow">Khedmah Digital V1</p>
        <h1>منصة خدمة الرقمية</h1>
        <p>
          منصة الأعمال الرقمية العربية — ابدأ بإنشاء حسابك أو تسجيل الدخول لإدارة منظمتك.
        </p>
        <nav aria-label="روابط المنصة" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
          <Link className="foundation-action" href="/auth/login">تسجيل الدخول</Link>
          <Link className="foundation-action" href="/auth/register">إنشاء حساب</Link>
          <Link className="foundation-action" href="/search">البحث</Link>
          <Link className="foundation-action" href="/businesses">صفحات الأعمال</Link>
          <Link className="foundation-action" href="/professionals">الملف المهني</Link>
          <Link className="foundation-action" href="/organizations">منظماتي</Link>
          <Link className="foundation-action operations-link" href="/admin">لوحة الإدارة</Link>
        </nav>
      </section>
    </main>
  );
}
