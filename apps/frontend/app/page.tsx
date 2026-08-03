import Link from 'next/link';

const CATEGORIES = [
  { code: 'restaurant', label: 'مطاعم' },
  { code: 'shop', label: 'محلات' },
  { code: 'workshop', label: 'ورش' },
  { code: 'doctor', label: 'أطباء' },
  { code: 'lawyer', label: 'محامون' },
  { code: 'engineer', label: 'مهندسون' },
  { code: 'consultant', label: 'مستشارون' },
  { code: 'freelancer', label: 'مستقلون' },
];

const CITIES = [
  { code: 'damascus', label: 'دمشق' },
  { code: 'aleppo', label: 'حلب' },
  { code: 'homs', label: 'حمص' },
  { code: 'latakia', label: 'اللاذقية' },
  { code: 'hama', label: 'حماة' },
  { code: 'tartus', label: 'طرطوس' },
];

export default function Home() {
  return (
    <main id="foundation-content">
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
        <nav className="category-grid" aria-label="تصفح حسب التصنيف">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.code}
              href={`/search?categoryCode=${cat.code}`}
              className="category-pill"
            >
              {cat.label}
            </Link>
          ))}
        </nav>
      </section>

      {/* Cities */}
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

      {/* Platform links */}
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
    </main>
  );
}
