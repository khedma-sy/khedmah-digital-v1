import { PlatformAction } from './platform-action';
import { PlatformIcon } from './platform-icon';

export function BrandHero() {
  return (
    <section className="live-hero" aria-labelledby="live-hero-title">
      <div className="live-hero-content">
        <span className="sr-only">خدمة — كل الخدمات تحت مظلة واحدة</span>
        <div className="hero-brand-lockup"><span className="hero-brand-k">KD</span><span><b>KHEDMA</b><small>DIGITAL</small></span></div>
        <p className="live-kicker"><span /> مساحة رقمية للأعمال والمهنيين والخدمات</p>
        <h1 id="live-hero-title" className="hero-reveal">ابحث. تواصل.<br/><em>وانمُ مع خدمة.</em></h1>
        <p className="live-hero-copy">من دمشق إلى كل سوريا — اكتشف أفضل الخدمات، ابنِ حضورك الرقمي، وانمُ مع شبكة من المهنيين والأعمال الموثوقة.</p>
        <form action="/search" className="live-search" role="search">
          <label className="sr-only" htmlFor="homepage-search">ابحث عن خدمة</label>
          <input id="homepage-search" name="q" type="search" placeholder="ما الخدمة التي تبحث عنها؟" />
          <button type="submit"><PlatformIcon name="search"/> ابحث الآن</button>
        </form>
        <div className="live-actions">
          <PlatformAction href="/search" icon="grid">اكتشف الخدمات</PlatformAction>
          <PlatformAction href="/auth/register" icon="userPlus" variant="secondary">إنشاء حساب</PlatformAction>
        </div>
        <div className="hero-proof"><span><b>14</b> محافظة</span><span><b>8</b> قطاعات</span><span><b>100%</b> حضور رقمي</span></div>
      </div>
      <aside className="live-network" aria-label="نشاط المنصة الحي">
        <div className="network-orbit"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><b className="network-core">أنا<br/>مع خدمة</b><i className="signal signal-one"/><i className="signal signal-two"/><i className="signal signal-three"/></div>
        <div className="network-feed"><p><span/> ملف أعمال جديد انضم إلى الشبكة</p><p><span/> مهني متاح للتواصل الآن</p><p><span/> خدمة جديدة أصبحت قابلة للاكتشاف</p></div>
        <strong className="network-caption">منصة تتحرك مع أعمالك، وليست صفحة ثابتة.</strong>
      </aside>
    </section>
  );
}
