import type { Metadata } from 'next';
import Link from 'next/link';
import { PlatformIcon } from './components/platform-icon';
import { SyriaMap } from './components/syria-map';
import styles from './home.module.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';

export const metadata: Metadata = {
  title: 'خدمة… أقرب إليك | خدمة ديجتل',
  description: 'خدمة ديجتل تحت مظلة واحدة، توفر لك الوصول إلى الخدمات والأعمال الموثوقة بجانبك.',
  alternates: { canonical: SITE_URL }
};

const trustItems = [
  { icon: 'check' as const, title: 'موثوق ومعتمد', description: 'ملفات أعمال موثوقة ومعتمدة' },
  { icon: 'pin' as const, title: 'قريب منك', description: 'اكتشف الخدمات والأعمال بجانبك' },
  { icon: 'grid' as const, title: 'جودة عالية', description: 'وصول أوضح للخدمات والأعمال' },
  { icon: 'lock' as const, title: 'آمن وسهل', description: 'تجربة واضحة وسهلة الاستخدام' }
];

export default function Home() {
  return (
    <main id="foundation-content" className={`discovery-home ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.brand}>
          <span className={styles.brandMark}>KD</span>
          <span><strong>KHEDMA</strong><small>DIGITAL</small></span>
        </div>

        <div className={styles.trustBadge}>
          <PlatformIcon name="check" />
          <span>منصة موثوقة وآمنة</span>
        </div>

        <div className={styles.content}>
          <h1 id="home-title">خدمة… <em>أقرب</em> إليك</h1>
          <p className={styles.tagline}><i aria-hidden="true" />تحت مظلة واحدة<i aria-hidden="true" /></p>
          <Link href="/map" className={styles.nearbyMessage} aria-label="استكشف الخدمات والأعمال الموثوقة بجانبك">
            <PlatformIcon name="pin" />
            <span>الخدمات والأعمال الموثوقة بجانبك</span>
          </Link>
          <div className={styles.actions}>
            <Link href="/search" className={styles.primaryAction}><PlatformIcon name="search" />اكتشف الخدمات</Link>
            <Link href="/auth/register" className={styles.secondaryAction}><PlatformIcon name="briefcase" />أضف نشاطك</Link>
          </div>
          <nav className={styles.quickLinks} aria-label="روابط الاستكشاف">
            <Link href="/service-catalog">دليل الخدمات</Link>
            <Link href="/business-profiles/khedmah-digital">عن خدمة ديجتل</Link>
            <Link href="/auth/login">تسجيل الدخول</Link>
          </nav>
        </div>

        <div className={styles.mapPanel}>
          <SyriaMap />
        </div>

        <section className={styles.trustStrip} aria-label="مزايا خدمة ديجتل">
          {trustItems.map((item) => (
            <article key={item.title}>
              <span className={styles.trustIcon}><PlatformIcon name={item.icon} /></span>
              <div><h2>{item.title}</h2><p>{item.description}</p></div>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
