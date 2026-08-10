import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { KHEDMAH_HERO_IMAGE } from '../lib/brand-hero-image';
import { PlatformIcon } from './components/platform-icon';
import { KHEDMAH_HERO_IMAGE } from '../lib/brand-hero-image';
import styles from './home.module.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';

export const metadata: Metadata = {
  title: 'خدمة ديجتل — تحت مظلة واحدة',
  description: 'اكتشف الخدمات ومقدميها حولك عبر خدمة ديجتل.',
  alternates: { canonical: SITE_URL }
};

export default function Home() {
  return (
    <main id="foundation-content" className={`discovery-home ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.artwork}>
          <Image src={KHEDMAH_HERO_IMAGE} alt="خدمة ديجتل تجمع مقدمي الخدمات تحت مظلة واحدة" width={1024} height={1024} priority />
        </div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>KHEDMA DIGITAL</p>
          <h1 id="home-title"><Link href="/" className={styles.brandLink}><span>خدمة</span> <strong>ديجتل</strong></Link></h1>
          <p className={styles.tagline}><i aria-hidden="true" /> تحت مظلة واحدة <i aria-hidden="true" /></p>
          <p className={styles.description}>اكتشف مقدمي الخدمات الموثوقين حولك، وابحث داخل منطقتك بسهولة عبر الخريطة.</p>
          <div className={styles.actions}>
            <Link href="/map" className={styles.primaryAction}>ابدأ الآن <PlatformIcon name="arrow" /></Link>
            <Link href="/auth/register" className={styles.secondaryAction}>إنشاء حساب <PlatformIcon name="userPlus" /></Link>
          </div>
          <nav className={styles.quickLinks} aria-label="روابط الاستكشاف">
            <Link href="/service-catalog">دليل الخدمات</Link>
            <Link href="/business-profiles/khedmah-digital">عن خدمة ديجتل</Link>
          </nav>
          <p className={styles.loginPrompt}>لديك حساب؟ <Link href="/auth/login">تسجيل الدخول</Link></p>
        </div>
      </section>
    </main>
  );
}
