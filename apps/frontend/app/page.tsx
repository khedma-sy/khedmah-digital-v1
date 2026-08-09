import type { Metadata } from 'next';
import Link from 'next/link';
import { PlatformIcon } from './components/platform-icon';
import styles from './home.module.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';

export const metadata: Metadata = {
  title: 'خدماتك أقرب — خدمة ديجتل',
  description: 'ابحث عن الخدمات والأعمال حسب احتياجك وموقعك، أو أنشئ ملف عملك على خدمة ديجتل.',
  alternates: { canonical: SITE_URL }
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'KHEDMA DIGITAL',
  alternateName: 'خدمة ديجتل',
  url: SITE_URL,
  description: 'ابحث عن الخدمات والأعمال حسب احتياجك وموقعك.',
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string'
  }
};

export default function Home() {
  return (
    <main id="foundation-content" className={`discovery-home ${styles.page}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className={styles.entry} aria-labelledby="home-title">
        <Link href="/business-profiles/khedmah-digital" className={styles.brand} aria-label="خدمة ديجتل — الملف الرسمي">
          <span className={styles.brandMark} aria-hidden="true">KD</span>
          <span className={styles.brandName}>
            <b>KHEDMA</b>
            <small>DIGITAL</small>
          </span>
        </Link>

        <div className={styles.intro}>
          <p className={styles.eyebrow}>اكتشف الأعمال والخدمات حولك</p>
          <h1 id="home-title">خدماتك أقرب</h1>
          <p className={styles.lead}>ابحث عمّا تحتاجه، حدّد موقعك، وتعرّف على مقدم الخدمة المناسب.</p>
        </div>

        <form className={styles.search} action="/search" role="search" aria-label="البحث عن خدمة">
          <label className={styles.queryField} htmlFor="home-query">
            <span>ما الخدمة التي تبحث عنها؟</span>
            <input id="home-query" name="q" type="search" placeholder="مثال: صيانة منزلية" autoComplete="off" required />
          </label>

          <label className={styles.locationField} htmlFor="home-location">
            <PlatformIcon name="pin" size={19} />
            <span className={styles.visuallyHidden}>الموقع</span>
            <select id="home-location" name="cityCode" defaultValue="">
              <option value="">كل المواقع</option>
              <option value="damascus">دمشق</option>
              <option value="aleppo">حلب</option>
              <option value="homs">حمص</option>
              <option value="latakia">اللاذقية</option>
              <option value="hama">حماة</option>
              <option value="tartus">طرطوس</option>
            </select>
          </label>

          <button className={styles.primaryAction} type="submit">
            <PlatformIcon name="search" size={21} />
            ابحث عن خدمة
          </button>
        </form>

        <nav className={styles.nextSteps} aria-label="مسارات خدمة ديجتل">
          <Link href="/search?type=business" className={styles.secondaryAction}>
            <span className={styles.actionIcon}><PlatformIcon name="grid" size={21} /></span>
            <span><b>استكشف ملفات الأعمال</b><small>تصفّح مقدمي الخدمات المتاحين</small></span>
            <PlatformIcon name="arrow" size={18} />
          </Link>
          <Link href="/business-profiles/new" className={styles.secondaryAction}>
            <span className={styles.actionIcon}><PlatformIcon name="userPlus" size={21} /></span>
            <span><b>أضف ملف عملك</b><small>اجعل خدماتك قابلة للاكتشاف</small></span>
            <PlatformIcon name="arrow" size={18} />
          </Link>
        </nav>

        <p className={styles.locationNote}>
          <PlatformIcon name="pin" size={17} />
          اكتشاف حسب الموقع متاح في جميع المحافظات السورية.
        </p>
      </section>
    </main>
  );
}
