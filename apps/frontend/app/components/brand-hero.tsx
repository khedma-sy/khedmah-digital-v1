import Link from 'next/link';

export function BrandHero() {
  return (
    <section className="live-hero" aria-labelledby="live-hero-title">
      <div className="live-hero-content">
        <p className="live-kicker">KHEDMA DIGITAL · خدمة ديجتل</p>
        <h1 id="live-hero-title">كل الخدمات تحت مظلة واحدة</h1>
        <p className="live-hero-copy">اكتشف أعمالاً ومهنيين وخدمات موثوقة، وابنِ حضورك الرقمي ضمن منصة عربية تجمع الفرص في مكان واحد.</p>
        <form action="/search" className="live-search" role="search">
          <label className="sr-only" htmlFor="homepage-search">ابحث عن خدمة</label>
          <input id="homepage-search" name="q" type="search" placeholder="ما الخدمة التي تبحث عنها؟" />
          <button type="submit">بحث</button>
        </form>
        <div className="live-actions">
          <Link href="/service-catalog" className="experience-action">اكتشف الخدمات</Link>
          <Link href="/search" className="experience-action experience-action-secondary">ابحث عن خدمة</Link>
          <Link href="/auth/register" className="experience-action experience-action-gold">انضم كشريك</Link>
        </div>
      </div>
      <aside className="live-hero-panel" aria-label="قيمة المنصة">
        <span className="live-hero-mark">KD</span>
        <strong>مظلة رقمية للثقة والنمو</strong>
        <p>للعملاء · للمهنيين · للأعمال</p>
      </aside>
    </section>
  );
}
