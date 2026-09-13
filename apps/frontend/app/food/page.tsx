import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PageShell, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './food.module.css';

export const metadata: Metadata = {
  title: 'خدمة فود - مطاعم وحلويات',
  description: 'اكتشف المطاعم والمقاهي والمخابز والحلويات عبر خدمة.'
};

const foodCategories = [
  { code: 'restaurant', title: 'مطاعم', description: 'وجبات ومطابخ ومطاعم قريبة منك.', icon: 'food' as const },
  { code: 'cafe', title: 'مقاهي', description: 'قهوة ومشروبات وأماكن للقاء.', icon: 'food' as const },
  { code: 'bakery', title: 'مخابز', description: 'خبز ومعجنات ومنتجات مخابز.', icon: 'food' as const },
  { code: 'sweets', title: 'حلويات', description: 'حلويات شرقية وغربية ومحال متخصصة.', icon: 'food' as const }
];

export default function FoodPage() {
  return <PageShell className={styles.page} label="خدمة فود">
    <div data-khedmah-section="commerce">
      <PageHeader
        eyebrow="خدمة فود"
        title="مطاعم وحلويات"
        description="اختر ما تبحث عنه وانتقل إلى نتائج حقيقية من ملفات الأعمال المنشورة في خدمة."
        backHref="/"
      />

      <section className={styles.hero} aria-labelledby="food-hero-title">
        <div>
          <span className={styles.badge}><PlatformIcon name="food" size={18}/> القسم البرتقالي</span>
          <h2 id="food-hero-title">من المطعم إلى الحلو… تحت مظلة واحدة</h2>
          <p>هذه الصفحة هي بوابة خدمة فود الرسمية. نعرض الأعمال المنشورة فعليًا، ولا ندّعي وجود طلب أو دفع إلكتروني قبل تفعيل نظام الطلبات.</p>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/search?type=business&categoryCode=restaurant">اكتشف المطاعم</Link>
            <Link className={styles.secondaryAction} href="/map">بالقرب مني</Link>
          </div>
        </div>
        <div className={styles.heroMark} aria-hidden="true"><PlatformIcon name="food" size={64}/><strong>خدمة فود</strong></div>
      </section>

      <section className={styles.categories} aria-labelledby="food-categories-title">
        <div className={styles.sectionHeading}><span>اختر القسم</span><h2 id="food-categories-title">ماذا تريد اليوم؟</h2></div>
        <div className={styles.grid}>
          {foodCategories.map((category) => <Surface as="article" className={styles.card} key={category.code}>
            <span className={styles.icon}><PlatformIcon name={category.icon} size={28}/></span>
            <h3>{category.title}</h3>
            <p>{category.description}</p>
            <Link href={`/search?type=business&categoryCode=${encodeURIComponent(category.code)}`}>عرض النتائج</Link>
          </Surface>)}
        </div>
      </section>

      <Surface className={styles.businessCta}>
        <div><span>لأصحاب الأعمال</span><h2>لديك مطعم أو مقهى أو مخبز أو محل حلويات؟</h2><p>أنشئ ملف نشاطك ليظهر ضمن نتائج خدمة فود.</p></div>
        <Link href="/business-profiles/new">أضف نشاطك</Link>
      </Surface>
    </div>
  </PageShell>;
}
