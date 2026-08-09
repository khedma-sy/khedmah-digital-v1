import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PlatformIcon } from './components/platform-icon';
import { KHEDMAH_HERO_IMAGE } from '../lib/brand-hero-image';
import styles from './home.module.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';
export const metadata: Metadata = { title: 'الرئيسية — خدمة ديجتل', description: 'ابحث عن الخدمات الموثوقة حولك.', alternates: { canonical: SITE_URL } };

export const metadata: Metadata = {
  title: 'خدمة ديجتل — تحت مظلة واحدة',
  description: 'اكتشف الخدمات ومقدميها في المحافظات السورية تحت مظلة خدمة ديجتل.',
  alternates: { canonical: SITE_URL }
};

export default function Home() {
  return (
    <main id="foundation-content" className={`discovery-home ${styles.page}`}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.artwork}>
          <Image
            src={KHEDMAH_HERO_IMAGE}
            alt="مظلة خدمة ديجتل فوق خريطة سوريا ومحافظاتها"
            width={1254}
            height={825}
            priority
            unoptimized
            sizes="(max-width: 56rem) 100vw, 58vw"
          />
        </div>

        <div className={styles.content}>
          <p className={styles.eyebrow}>مرحباً بك في</p>
          <Link href="/business-profiles/khedmah-digital" className={styles.brandLink} aria-label="الملف الرسمي لخدمة ديجتل"><h1 id="home-title"><span>خدمة</span> <strong>ديجتل</strong></h1></Link>
          <p className={styles.tagline}><i /> تحت مظلة واحدة <i /></p>
          <p className={styles.description}>اكتشف الخدمات ومقدميها حولك، واختر المجال الذي تحتاجه بسهولة.</p>

          <div className={styles.actions}>
            <Link href="/service-catalog" className={styles.primaryAction}>ابدأ الآن <PlatformIcon name="arrow" /></Link>
            <Link href="/auth/register" className={styles.secondaryAction}>إنشاء حساب <PlatformIcon name="userPlus" /></Link>
          </div>

          <p className={styles.loginPrompt}>لديك حساب؟ <Link href="/auth/login">تسجيل الدخول</Link></p>
        </div>
      </section>
    </main>
  );
}
