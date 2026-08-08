import Link from 'next/link';
import { SyriaMap } from './syria-map';

export function BrandHero() {
  return (
    <section className="live-hero" aria-labelledby="live-hero-title">
      <div className="live-hero-content">
        <span className="sr-only">KHEDMA DIGITAL — كل الخدمات تحت مظلة واحدة</span>
        <div className="hero-brand-lockup"><span className="hero-brand-k">K</span><span><b>KHEDMA</b><small>DIGITAL</small></span></div>
        <p className="live-kicker"><span /> المنصة الرقمية السورية الأولى للخدمات</p>
        <h1 id="live-hero-title">كل شيء تحت<br/><em>مظلة رقمية واحدة</em></h1>
        <p className="live-hero-copy">من دمشق إلى كل سوريا — اكتشف أفضل الخدمات، ابنِ حضورك الرقمي، وانمُ مع شبكة من المهنيين والأعمال الموثوقة.</p>
        <form action="/search" className="live-search" role="search">
          <label className="sr-only" htmlFor="homepage-search">ابحث عن خدمة</label>
          <input id="homepage-search" name="q" type="search" placeholder="ما الخدمة التي تبحث عنها؟" />
          <button type="submit">ابحث الآن</button>
        </form>
        <div className="live-actions">
          <Link href="#province-map" className="experience-action">اكتشف الخدمات واختر محافظتك <span>←</span></Link>
          <Link href="/auth/register" className="experience-action experience-action-secondary">انضم كشريك</Link>
        </div>
        <div className="hero-proof"><span><b>14</b> محافظة</span><span><b>8</b> قطاعات</span><span><b>100%</b> حضور رقمي</span></div>
      </div>
      <aside id="province-map" className="live-map-panel" aria-label="اختر محافظتك"><div className="map-heading"><div><span>كل شيء تحت مظلة رقمية واحدة</span><strong>اختر محافظتك من الخريطة</strong></div><small>SYRIA · سوريا</small></div><SyriaMap /></aside>
    </section>
  );
}
