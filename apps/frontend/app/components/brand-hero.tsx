import { SyriaMap } from './syria-map';
import { PlatformAction } from './platform-action';
import { PlatformIcon } from './platform-icon';
import Link from 'next/link';
import { SyriaMap } from './syria-map';

export function BrandHero() {
  return (
    <section className="live-hero" aria-labelledby="live-hero-title">
      <div className="live-hero-content">
        <span className="sr-only">KHEDMA DIGITAL — كل الخدمات تحت مظلة واحدة</span>
        <div className="hero-brand-lockup"><span className="hero-brand-k">KD</span><span><b>KHEDMA</b><small>DIGITAL</small></span></div>
        <p className="live-kicker"><span /> المنصة الرقمية السورية الأولى للخدمات</p>
        <h1 id="live-hero-title" className="hero-reveal">كل شيء تحت<br/><em>مظلة رقمية واحدة</em></h1>
        <p className="live-hero-copy">من دمشق إلى كل سوريا — اكتشف أفضل الخدمات، ابنِ حضورك الرقمي، وانمُ مع شبكة من المهنيين والأعمال الموثوقة.</p>
        <form action="/search" className="live-search" role="search">
          <label className="sr-only" htmlFor="homepage-search">ابحث عن خدمة</label>
          <input id="homepage-search" name="q" type="search" placeholder="ما الخدمة التي تبحث عنها؟" />
          <button type="submit"><PlatformIcon name="search"/> ابحث الآن</button>
        </form>
        <div className="live-actions">
          <PlatformAction href="#province-map" icon="grid">اكتشف الخدمات</PlatformAction>
          <PlatformAction href="/auth/register" icon="userPlus" variant="secondary">إنشاء حساب</PlatformAction>
        </div>
        <div className="hero-proof"><span><b>14</b> محافظة</span><span><b>8</b> قطاعات</span><span><b>100%</b> حضور رقمي</span></div>
      </div>
      <aside id="province-map" className="live-map-panel" aria-label="اختر محافظتك"><div className="map-heading"><div><span>كل شيء تحت مظلة رقمية واحدة</span><strong>اختر محافظتك من الخريطة</strong></div><small>SYRIA · سوريا</small></div><SyriaMap /></aside>
    </section>
  );
}
