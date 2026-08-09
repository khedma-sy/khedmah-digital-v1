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
      <section className={styles.phone} aria-labelledby="home-title">
        <p className={styles.visuallyHidden}>KHEDMA — خدماتك أقرب</p>
        <header className={styles.topbar}>
          <Link href="/users/me" className={styles.iconAction} aria-label="حسابي"><PlatformIcon name="user" /></Link>
          <Link href="/business-profiles/khedmah-digital" className={styles.brand}><span aria-hidden="true">☂</span><b>خدمة <em>ديجتل</em></b><small>تحت مظلة واحدة</small></Link>
          <Link href="/service-catalog" className={styles.iconAction} aria-label="قائمة الخدمات"><PlatformIcon name="menu" /></Link>
        </header>
        <form className={styles.search} action="/search" role="search"><PlatformIcon name="search"/><input name="q" aria-label="ابحث عن خدمة" placeholder="مثال: تصليح مكيف"/><button className={styles.primaryAction} type="submit">ابحث عن خدمة</button><PlatformIcon name="pin"/><select name="cityCode" aria-label="الموقع"><option value="">كل المدن</option></select><Link href="/map">الخريطة</Link></form>
        <nav className={styles.categories} aria-label="تصنيفات الخدمات">{categories.map(([icon,label,category])=><Link key={label} href={`/service-catalog?category=${category}`}><PlatformIcon name={icon}/><span>{label}</span></Link>)}</nav>
        <section className={styles.trust}><div className={styles.shield}><PlatformIcon name="check" size={38}/></div><div><h1 id="home-title">اكتشف الخدمات<br/><strong>حولك بسهولة</strong></h1><p>تصفّح ملفات مقدمي الخدمات المتاحة</p></div></section>
        <nav className={styles.nextSteps} aria-label="مسارات خدمة ديجتل">
          <Link href="/users/me" className={styles.secondaryAction}><PlatformIcon name="user"/><span><b>حسابي</b><small>الملف الأساسي</small></span></Link>
          <Link href="/" className={styles.secondaryAction}><PlatformIcon name="home"/><span><b>الرئيسية</b><small>اكتشاف الخدمات</small></span></Link>
          <Link href="/service-catalog"><PlatformIcon name="grid"/><span>الدليل</span></Link>
        </nav>
      </section>
    </main>
  );
}
