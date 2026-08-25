import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BrandMark } from './components/brand-mark';
import { PlatformIcon } from './components/platform-icon';
import styles from './home.module.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://khedmah.digital';
export const metadata: Metadata = { title: 'خدمة - كل ما تحتاجه أقرب إليك', description: 'اكتشف الأعمال والمهنيين والخدمات حسب الفئة والموقع، وتواصل مباشرة مع مقدم الخدمة.', alternates: { canonical: SITE_URL } };

const categories = [
  { title: 'الخدمات المنزلية', copy: 'صيانة وتنظيف وخدمات للمنزل', image: '/brand/home-services.webp', query: 'خدمات منزلية' },
  { title: 'المهن والحرف', copy: 'مهنيون وحرفيون قريبون منك', image: '/brand/professional-services.webp', query: 'مهنيون' },
  { title: 'الصحة والخدمات الطبية', copy: 'أطباء ومراكز وصيدليات', image: '/brand/health-services.webp', query: 'صحة' },
  { title: 'المطاعم والمقاهي', copy: 'طعام ومقاهٍ وحلويات', image: '/brand/restaurants.webp', query: 'مطاعم' },
  { title: 'السيارات والنقل', copy: 'صيانة ونقل وخدمات سيارات', image: '/brand/cars.webp', query: 'سيارات' },
  { title: 'التقنية والتسويق', copy: 'برمجة وتسويق وخدمات رقمية', image: '/brand/technology.webp', query: 'تقنية' }
];
const trustItems = [
  { icon: 'check' as const, title: 'معلومات واضحة', copy: 'ملفات منظمة تساعدك على الاختيار.' },
  { icon: 'pin' as const, title: 'بحث حسب الموقع', copy: 'نتائج أقرب إلى مكانك واحتياجك.' },
  { icon: 'user' as const, title: 'تواصل مباشر', copy: 'انتقل إلى ملف مقدم الخدمة وتواصل معه.' }
];

export default function Home() {
  return <main id="foundation-content" className={styles.page}>
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroCopy}>
        <BrandMark />
        <p className={styles.eyebrow}>خدمات وأعمال ومهنيون في مكان واحد</p>
        <h1 id="home-title">كل ما تحتاجه<br /><em>أقرب إليك</em></h1>
        <p className={styles.lead}>ابحث حسب الفئة والموقع، اطّلع على ملفات الأعمال ومقدمي الخدمات، ثم تواصل مباشرة دون وسطاء.</p>
        <form action="/search" className={styles.search}><label className="sr-only" htmlFor="home-search">ما الخدمة التي تبحث عنها؟</label><PlatformIcon name="search" /><input id="home-search" name="q" type="search" placeholder="ما الخدمة التي تبحث عنها؟" /><button type="submit">ابحث</button></form>
        <div className={styles.actions}><Link href="/service-catalog">اكتشف الخدمات</Link><Link href="/business-profiles/new">أضف نشاطك</Link></div>
      </div>
      <div className={styles.heroVisual}><Image src="/brand/khedma-community.webp" alt="أفراد وأصحاب أعمال يستخدمون منصة خدمة" fill priority sizes="(max-width: 900px) 100vw, 48vw" /><div className={styles.visualCard}><PlatformIcon name="check" /><span><b>خدمة للجميع</b><small>للأفراد وأصحاب الأعمال</small></span></div></div>
    </section>
    <section className={styles.discovery} aria-labelledby="categories-title">
      <div className={styles.sectionHeading}><span>اكتشف ما حولك</span><h2 id="categories-title">التصنيفات الرئيسية</h2><p>اختر المجال المناسب وانتقل مباشرة إلى نتائج البحث الحقيقية.</p></div>
      <div className={styles.categoryGrid}>{categories.map(category => <Link key={category.title} href={`/search?q=${encodeURIComponent(category.query)}`} className={styles.categoryCard}><Image src={category.image} alt="" fill sizes="(max-width: 700px) 100vw, 33vw" /><span><b>{category.title}</b><small>{category.copy}</small><i>استكشف ←</i></span></Link>)}</div>
    </section>
    <section className={styles.trust} aria-labelledby="trust-title">
      <div className={styles.sectionHeading}><span>لماذا خدمة؟</span><h2 id="trust-title">وصول أوضح إلى الخدمة المناسبة</h2></div>
      <div className={styles.trustGrid}>{trustItems.map(item => <article key={item.title}><PlatformIcon name={item.icon} /><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div>
      <div className={styles.join}><div><h2>هل تقدم خدمة أو تدير نشاطاً؟</h2><p>أنشئ ملفك، أضف معلوماتك وخدماتك، واجعل نشاطك قابلاً للاكتشاف.</p></div><Link href="/auth/register">انضم إلى خدمة</Link></div>
    </section>
  </main>;
}
