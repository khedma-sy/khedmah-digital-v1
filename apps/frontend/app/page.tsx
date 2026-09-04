import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { FeaturedCategories } from './components/featured-categories';
import { RecentlyAdded } from './components/recently-added';
import { PlatformIcon } from './components/platform-icon';
import { PriorityServices } from './components/priority-services';
import styles from './home.module.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.uk';
export const metadata: Metadata = { title: 'خدمة - كل ما تحتاجه أقرب إليك', description: 'اكتشف الأعمال والمهنيين والخدمات حسب الفئة والموقع، وتواصل مباشرة مع مقدم الخدمة.', alternates: { canonical: SITE_URL } };

const trustItems = [
  { icon: 'check' as const, title: 'معلومات واضحة', copy: 'ملفات منظمة تساعدك على الاختيار.' },
  { icon: 'pin' as const, title: 'بحث حسب الموقع', copy: 'نتائج أقرب إلى مكانك واحتياجك.' },
  { icon: 'user' as const, title: 'تواصل مباشر', copy: 'انتقل إلى ملف مقدم الخدمة وتواصل معه.' }
];

export default function Home() {
  return <main id="foundation-content" className={styles.page}>
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><PlatformIcon name="check" /> تحت مظلة واحدة</p>
        <h1 id="home-title">كل ما تحتاجه<br /><em>أقرب إليك</em></h1>
        <p className={styles.lead}>ابحث حسب الفئة والموقع، اطّلع على ملفات الأعمال ومقدمي الخدمات، ثم تواصل مباشرة دون وسطاء.</p>
        <form action="/search" className={styles.search}><label className="sr-only" htmlFor="home-search">ما الخدمة التي تبحث عنها؟</label><PlatformIcon name="search" /><input id="home-search" name="q" type="search" placeholder="ما الخدمة التي تبحث عنها؟" /><button type="submit">ابحث</button></form>
        <div className={styles.actions}><Link href="/search"><PlatformIcon name="search" />اكتشف الخدمات</Link><Link href="/business-profiles/new"><PlatformIcon name="briefcase" />أضف نشاطك</Link></div>
        <p className={styles.heroNote}>للأفراد وأصحاب الأعمال والمهنيين</p>
      </div>
      <div className={styles.heroVisual}><Image src="/brand/khedma-community.webp" alt="أصحاب أعمال ومهنيون يقدمون خدماتهم عبر منصة خدمة" fill priority sizes="(max-width: 900px) 100vw, 48vw" /><div className={styles.visualCard}><PlatformIcon name="check" /><span><b>خدمة أقرب إليك</b><small>اكتشف أعمالاً ومهنيين حولك</small></span></div></div>
    </section>
    <div className={styles.priority}><PriorityServices /></div>
    <section className={styles.discovery} aria-labelledby="categories-title">
      <div className={styles.sectionHeading}><span>اكتشف ما حولك</span><h2 id="categories-title">التصنيفات الرئيسية</h2><p>اختر المجال المناسب وانتقل مباشرة إلى نتائج البحث الحقيقية.</p></div>
      <FeaturedCategories />
    </section>
    <RecentlyAdded />
    <section className={styles.trust} aria-labelledby="trust-title">
      <div className={styles.sectionHeading}><span>لماذا خدمة؟</span><h2 id="trust-title">وصول أوضح إلى الخدمة المناسبة</h2></div>
      <div className={styles.trustGrid}>{trustItems.map(item => <article key={item.title}><PlatformIcon name={item.icon} /><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
      <div className={styles.join}><div><h2>هل تقدم خدمة أو تدير نشاطاً؟</h2><p>أنشئ ملفك، أضف معلوماتك وخدماتك، واجعل نشاطك قابلاً للاكتشاف.</p></div><Link href="/auth/register">انضم إلى خدمة</Link></div>
    </section>
  </main>;
}
