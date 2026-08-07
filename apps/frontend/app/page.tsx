import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandHero } from './components/brand-hero';
import { AudienceCard, DiscoveryCard, TrustBadge } from './components/platform-cards';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';

export const metadata: Metadata = {
  title: 'خدمة ديجتل — كل الخدمات تحت مظلة واحدة',
  description: 'منصة عربية لاكتشاف الأعمال والمهنيين والخدمات الموثوقة وبناء حضور رقمي احترافي.',
  alternates: { canonical: SITE_URL }
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KHEDMA DIGITAL',
  alternateName: 'خدمة ديجتل',
  url: SITE_URL,
  description: 'كل الخدمات تحت مظلة واحدة',
  potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' }
};

export default function Home() {
  return (
    <main id="foundation-content" className="live-home">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BrandHero />

      <section className="live-section" aria-labelledby="discovery-title">
        <div className="live-section-heading">
          <div><p className="eyebrow">ابدأ الاكتشاف</p><h2 id="discovery-title">كل ما تحتاجه في منصة واحدة</h2></div>
          <p>طرق واضحة للوصول إلى مقدم الخدمة المناسب، أينما كنت.</p>
        </div>
        <div className="experience-grid experience-grid-four">
          <DiscoveryCard icon="🏢" title="الأعمال" description="اكتشف الشركات والمتاجر ومقدمي الخدمات." href="/search?type=business" />
          <DiscoveryCard icon="👤" title="المهنيون" description="تعرّف على الخبرات والتخصصات المهنية." href="/professional-profiles/search" />
          <DiscoveryCard icon="✦" title="الخدمات" description="ابحث في دليل منظم للخدمات المتاحة." href="/service-catalog" />
          <DiscoveryCard icon="⌖" title="المواقع" description="استكشف الخدمات والأعمال حسب الموقع." href="/locations" />
        </div>
      </section>

      <section className="live-section live-trust" aria-labelledby="trust-title">
        <div>
          <p className="eyebrow">الثقة أولاً</p>
          <h2 id="trust-title">قرارات أوضح، حضور أكثر موثوقية</h2>
          <p>نبني أساساً يساعد العملاء على التعرف على الجهات والمهنيين والشركاء ضمن تجربة عامة واضحة.</p>
        </div>
        <div className="trust-badges">
          <TrustBadge>أعمال موثقة</TrustBadge>
          <TrustBadge>مهنيون بهوية واضحة</TrustBadge>
          <TrustBadge>شركاء في شبكة واحدة</TrustBadge>
        </div>
      </section>

      <section className="live-section" aria-labelledby="how-title">
        <div className="live-section-heading">
          <div><p className="eyebrow">كيف تعمل خدمة ديجتل؟</p><h2 id="how-title">قيمة متصلة لثلاثة أطراف</h2></div>
          <Link href="/business-profiles/khedmah-digital" className="text-link">تعرف على الشركة المؤسسة ←</Link>
        </div>
        <div className="experience-grid experience-grid-three">
          <AudienceCard label="للعميل" title="اعثر على خدمة تثق بها" description="ابحث وقارن وتواصل مع مقدم الخدمة المناسب بصورة أسهل." action="ابدأ البحث" href="/search" />
          <AudienceCard label="للمهني" title="أنشئ حضورك الرقمي" description="اعرض تخصصك وخبرتك وموقعك وشارك ملفك مع جمهورك." action="أنشئ ملفاً مهنياً" href="/professional-profiles/new" />
          <AudienceCard label="للأعمال" title="نمِّ ظهورك ووصولك" description="قدم أعمالك وخدماتك وسهّل على العملاء اكتشافك والتواصل معك." action="أنشئ ملف أعمال" href="/business-profiles/new" />
        </div>
      </section>

      <section className="live-join" aria-labelledby="join-title">
        <div><p className="eyebrow">أنا مع خدمة</p><h2 id="join-title">ابدأ حضورك داخل شبكة خدمة ديجتل</h2><p>انضم كمهني أو عمل أو شريك، وكن جزءاً من مظلة رقمية صُممت للاكتشاف والثقة والنمو.</p></div>
        <Link href="/auth/register" className="experience-action experience-action-gold">انضم إلى المنصة</Link>
      </section>
    </main>
  );
}
