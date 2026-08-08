import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandHero } from './components/brand-hero';
import { AudienceCard, DiscoveryCard, TrustBadge } from './components/platform-cards';
import { serviceCategories } from '../lib/platform-data';

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

      <section className="category-band" aria-labelledby="categories-title">
        <div className="section-intro"><p className="eyebrow">مدينة الخدمات الرقمية</p><h2 id="categories-title">كل ما تحتاجه، أقرب مما تتخيل</h2><p>ثمانية قطاعات أساسية تجمع احتياجات الحياة والأعمال في مكان واحد.</p></div>
        <div className="service-city-grid">{serviceCategories.map((category) => <Link href={`/search?q=${encodeURIComponent(category.name)}`} className={`service-city-card service-${category.color}`} key={category.name}><span className="service-city-icon">{category.icon}</span><h3>{category.name}</h3><p>{category.description}</p><span className="service-arrow">←</span></Link>)}</div>
      </section>

      <section className="live-section presence-section" aria-labelledby="discovery-title">
        <div className="live-section-heading">
          <div><p className="eyebrow">حضورك الرقمي يبدأ هنا</p><h2 id="discovery-title">ملف واحد. فرص بلا حدود.</h2></div>
          <p>سواء كنت مهنياً مستقلاً أو صاحب عمل، امنح نشاطك واجهة احترافية تصل بها إلى عملاء جدد.</p>
        </div>
        <div className="experience-grid experience-grid-four">
          <DiscoveryCard icon="🏢" title="الأعمال" description="اكتشف الشركات والمتاجر ومقدمي الخدمات." href="/search?type=business" />
          <DiscoveryCard icon="👤" title="المهنيون" description="تعرّف على الخبرات والتخصصات المهنية." href="/professional-profiles/search" />
          <DiscoveryCard icon="✦" title="الخدمات" description="ابحث في دليل منظم للخدمات المتاحة." href="/service-catalog" />
          <DiscoveryCard icon="⌖" title="المواقع" description="استكشف الخدمات والأعمال حسب الموقع." href="/locations" />
        </div>
      </section>

      <section className="growth-section" aria-labelledby="growth-title"><div className="growth-copy"><p className="eyebrow">من فيسبوك إلى منصة أعمال حقيقية</p><h2 id="growth-title">حوّل متابعيك إلى عملاء</h2><p>انقل نشاطك من المنشورات المتفرقة إلى حضور رقمي احترافي يمكن اكتشافه ومشاركته والثقة به.</p><div className="growth-steps"><span><b>01</b> انضم كشريك</span><span><b>02</b> أنشئ حضورك</span><span><b>03</b> شارك ملفك</span><span><b>04</b> استقبل العملاء</span></div><Link href="/auth/register" className="experience-action">ابدأ مجاناً</Link></div><div className="share-preview"><div className="share-profile"><span className="profile-monogram">م</span><div><small>ملف أعمال موثّق</small><strong>محمصة الياسمين</strong><p>قهوة مختصة · دمشق</p></div><span className="verified">✓</span></div><div className="share-link">khedmah.digital/p/yasmin <b>مشاركة</b></div><div className="viral-stamp">أنا مع خدمة <span>#</span></div></div></section>

      <section className="plans-foundation" aria-labelledby="plans-title"><div className="section-intro"><p className="eyebrow">خطط تنمو معك</p><h2 id="plans-title">ابدأ اليوم، وتطوّر غداً</h2></div><div className="plans-grid"><article><span>مجاني</span><h3>حضور أساسي</h3><p>ملف عام، خدمات، موقع، صور وتواصل.</p></article><article className="featured-plan"><span>Premium</span><h3>ظهور أقوى</h3><p>تمييز في النتائج، تحليلات وأدوات ترويج.</p></article><article><span>Business</span><h3>نمو الأعمال</h3><p>حملات، تقارير وإدارة حضور متقدم.</p></article></div><p className="future-note">الخطط المدفوعة قادمة — لا توجد مدفوعات في الإصدار الحالي.</p></section>

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
