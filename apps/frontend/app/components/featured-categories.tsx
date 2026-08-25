'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCategories } from '../../lib/use-categories';
import styles from '../home.module.css';

const categoryVisuals = [
  { match: /منزل|صيان|home|maintenance/i, image: '/brand/home-services.webp', description: 'خدمات منزلية وصيانة قريبة منك' },
  { match: /مهن|حرف|craft|professional/i, image: '/brand/professional-services.webp', description: 'مهنيون وحرفيون يقدمون خدماتهم' },
  { match: /صح|طب|صيدل|health|medical/i, image: '/brand/health-services.webp', description: 'أطباء ومراكز وخدمات الرعاية' },
  { match: /مطعم|مقه|طعام|restaurant|food/i, image: '/brand/restaurants.webp', description: 'مطاعم ومقاهٍ وأعمال الضيافة' },
  { match: /سيار|نقل|car|transport/i, image: '/brand/cars.webp', description: 'صيانة السيارات وخدمات النقل' },
  { match: /تقن|برمج|تسويق|tech|digital/i, image: '/brand/technology.webp', description: 'تقنية وتسويق وخدمات رقمية' }
];

export function FeaturedCategories() {
  const { categories, isLoading, error, retry } = useCategories();

  if (isLoading) {
    return <div className={styles.categoryGrid} aria-label="جاري تحميل التصنيفات" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.categorySkeleton} />)}</div>;
  }

  if (error) {
    return <div className={styles.categoryState} role="status"><p>{error}</p><button type="button" onClick={() => void retry()}>إعادة المحاولة</button></div>;
  }

  if (categories.length === 0) {
    return <div className={styles.categoryState}><p>ستظهر التصنيفات هنا عند توفرها.</p><Link href="/search">استكشف الخدمات</Link></div>;
  }

  return <div className={styles.categoryGrid}>{categories.slice(0, 6).map((category, index) => {
    const visual = categoryVisuals.find(item => item.match.test(`${category.code} ${category.nameAr}`)) ?? categoryVisuals[index % categoryVisuals.length];
    return <Link key={category.code} href={`/search?categoryCode=${encodeURIComponent(category.code)}`} className={styles.categoryCard}>
      <span className={styles.categoryImage}><Image src={visual.image} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw" /></span>
      <span className={styles.categoryBody}><b>{category.nameAr}</b><small>{visual.description}</small><i>استكشف الخدمات ←</i></span>
    </Link>;
  })}</div>;
}
