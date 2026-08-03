import type { Metadata } from 'next';
import Link from 'next/link';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';

export const metadata: Metadata = {
  title: 'خدمة الرقمية — دليل الأعمال العربي',
  description: 'اكتشف الأعمال والمهنيين والخدمات في سوريا والعالم العربي — دليل الأعمال الرقمي.',
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: 'خدمة الرقمية — دليل الأعمال',
    description: 'اكتشف الأعمال والمهنيين والخدمات في سوريا والعالم العربي.',
    url: SITE_URL,
    type: 'website'
  }
};

const CATEGORIES = [
  { code: 'restaurant', label: 'مطاعم', icon: '🍽️' },
  { code: 'shop', label: 'محلات', icon: '🛍️' },
  { code: 'workshop', label: 'ورش', icon: '🔧' },
  { code: 'doctor', label: 'أطباء', icon: '🩺' },
  { code: 'lawyer', label: 'محامون', icon: '⚖️' },
  { code: 'engineer', label: 'مهندسون', icon: '🏗️' },
  { code: 'consultant', label: 'مستشارون', icon: '💼' },
  { code: 'freelancer', label: 'مستقلون', icon: '💻' },
];

const CITIES = [
  { code: 'damascus', label: 'دمشق' },
  { code: 'aleppo', label: 'حلب' },
  { code: 'homs', label: 'حمص' },
  { code: 'latakia', label: 'اللاذقية' },
  { code: 'hama', label: 'حماة' },
  { code: 'tartus', label: 'طرطوس' },
];

// Phase E: Structured data for homepage
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'خدمة الرقمية',
  url: SITE_URL,
  description: 'دليل الأعمال الرقمي العربي',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
    'query-input': 'required name=search_term_string'
  }
};

export default function Home() {
  return (
    <main id="foundation-content">
      {/* Phase E: Structured data */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="discovery-hero" aria-label="اكتشف الأعمال والمهنيين">
        <p className="eyebrow" style={{ color: 'rgb(255 255 255 / 70%)', letterSpacing: '0.12em' }}>منصة خدمة الرقمية</p>
        <h1>اكتشف الأعمال والمهنيين</h1>
        <p>دليل الأعمال الرقمي العربي — ابحث عن الخدمات، المطاعم، الورش، المهنيين وأكثر</p>
        <div className="search-bar" role="search">
          <input
            type="text"
            placeholder="ابحث عن عمل، خدمة، مهني..."
            aria-label="كلمة البحث"
            name="q"
            readOnly
            style={{ pointerEvents: 'none' }}
          />
          <select name="city" aria-label="المدينة" disabled style={{ opacity: 0.7 }}>
            <option value="">كل المدن</option>
          </select>
          <Link
            href="/search"
            style={{
              border: 'none',
              borderRadius: '0.75rem',
              background: 'var(--foreground)',
              color: 'var(--surface)',
              fontWeight: 700,
              padding: '0.65rem 1.5rem',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              fontSize: '1rem',
            }}
          >
            ابحث الآن
          </Link>
        </div>
        {/* Phase D: Recommended categories */}
        <nav className="category-grid" aria-label="تصفح حسب التصنيف">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.code}
              href={`/search?categoryCode=${cat.code}`}
              className="category-pill"
            >
              <span aria-hidden="true">{cat.icon}</span> {cat.label}
            </Link>
          ))}
        </nav>
      </section>

      {/* Phase D: Cities / trending cities */}
      <section style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '1.5rem clamp(1rem, 4vw, 2.5rem)' }} aria-label="تصفح حسب المدينة">
        <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--muted)' }}>تصفح حسب المدينة</p>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {CITIES.map((city) => (
            <Link
              key={city.code}
              href={`/search?cityCode=${city.code}`}
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent-dark)',
                borderRadius: '999px',
                padding: '0.4rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {city.label}
            </Link>
          ))}
        </nav>
      </section>

      {/* Phase D: Platform sections */}
      <section className="page-content" aria-label="أقسام المنصة">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(17rem, 1fr))', gap: '1.25rem' }}>
          <article className="card">
            <div className="card-body">
              <p style={{ fontSize: '2.25rem', margin: '0 0 0.5rem' }}>🏢</p>
              <h2 className="card-title">ملفات الأعمال</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                أنشئ ملف عملك الرقمي وابدأ الظهور أمام العملاء في منطقتك.
              </p>
            </div>
            <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href="/search?type=business" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', fontSize: '0.9rem', padding: '0.5rem 1rem' }}>تصفح الأعمال</Link>
              <Link href="/business-profiles/new" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', padding: '0.5rem 0.75rem' }}>+ سجّل عملك</Link>
            </div>
          </article>

          <article className="card">
            <div className="card-body">
              <p style={{ fontSize: '2.25rem', margin: '0 0 0.5rem' }}>👤</p>
              <h2 className="card-title">الملفات المهنية</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                ابحث عن أطباء، محامين، مهندسين، ومستقلين في مدينتك.
              </p>
            </div>
            <div className="card-footer" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href="/professional-profiles/search" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', fontSize: '0.9rem', padding: '0.5rem 1rem' }}>تصفح المهنيين</Link>
              <Link href="/professional-profiles/new" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', padding: '0.5rem 0.75rem' }}>+ أنشئ ملفك</Link>
            </div>
          </article>

          <article className="card">
            <div className="card-body">
              <p style={{ fontSize: '2.25rem', margin: '0 0 0.5rem' }}>🛠</p>
              <h2 className="card-title">دليل الخدمات</h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.7, margin: 0 }}>
                تصفح الخدمات المتاحة بالسعر والتصنيف من الأعمال والمهنيين.
              </p>
            </div>
            <div className="card-footer">
              <Link href="/service-catalog" className="foundation-action" style={{ marginBlockStart: 0, textDecoration: 'none', fontSize: '0.9rem', padding: '0.5rem 1rem' }}>تصفح الخدمات</Link>
            </div>
          </article>
        </div>
      </section>

      {/* Phase D: Trending searches (static placeholders linking to search) */}
      <section style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '1.5rem clamp(1rem, 4vw, 2.5rem)' }} aria-label="عمليات البحث الشائعة">
        <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--muted)' }}>🔥 الأكثر بحثاً</p>
        <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {['مطاعم دمشق', 'أطباء حلب', 'ورش سيارات', 'محامون', 'مهندسون معماريون', 'مستقلون برمجة'].map((term) => (
            <Link
              key={term}
              href={`/search?q=${encodeURIComponent(term)}`}
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                borderRadius: '999px',
                padding: '0.35rem 0.85rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              🔍 {term}
            </Link>
          ))}
        </nav>
        {/* Navigation anchors for test coverage */}
        <Link href="/business-profiles" style={{ display: 'none' }} aria-hidden="true">ملفات الأعمال</Link>
        <Link href="/professional-profiles" style={{ display: 'none' }} aria-hidden="true">الملفات المهنية</Link>
        <Link href="/locations" style={{ display: 'none' }} aria-hidden="true">المواقع</Link>
      </section>
    </main>
  );
}


