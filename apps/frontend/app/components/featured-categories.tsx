'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCategories } from '../../lib/use-categories';
import styles from '../home.module.css';

const categoryVisuals: Record<string, { image: string; description: string }> = {
  home: { image: '/brand/home-services.webp', description: 'خدمات منزلية وصيانة قريبة منك' },
  food: { image: '/brand/restaurants.webp', description: 'مطاعم ومقاهٍ وأعمال الضيافة' },
  health: { image: '/brand/health-services.webp', description: 'أطباء ومراكز وخدمات الرعاية' },
  education: { image: '/brand/technology.webp', description: 'دروس ومعاهد وتدريب مهني' },
  professional: { image: '/brand/professional-services.webp', description: 'استشارات وخدمات أعمال متخصصة' },
  beauty: { image: '/brand/khedma-community.webp', description: 'صالونات وعناية شخصية قريبة' },
  shopping: { image: '/brand/khedma-community.webp', description: 'متاجر ومحلات لاحتياجاتك اليومية' },
  automotive: { image: '/brand/cars.webp', description: 'صيانة وبيع وخدمات السيارات' },
  transport: { image: '/brand/cars.webp', description: 'تكسي وتوصيل وخدمات نقل' },
  technology: { image: '/brand/technology.webp', description: 'تقنية وبرمجة وخدمات رقمية' },
  construction: { image: '/brand/home-services.webp', description: 'بناء ومقاولات وخدمات عقارية' },
  events: { image: '/brand/khedma-community.webp', description: 'تنظيم وتجهيز المناسبات والفعاليات' },
  agriculture: { image: '/brand/khedma-community.webp', description: 'زراعة ومواشٍ ومستلزمات زراعية' },
  industry: { image: '/brand/professional-services.webp', description: 'مصانع وموردون ومعدات صناعية' },
  travel: { image: '/brand/khedma-community.webp', description: 'سفر وإقامة وخدمات سياحية' }
};

const defaultVisual = { image: '/brand/khedma-community.webp', description: 'خدمات محلية موثوقة قريبة منك' };

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

  const roots = categories.filter((category) => !category.parentCode);
  const featured = roots.filter((category) => category.isFeatured);
  const visible = (featured.length ? featured : roots).slice(0, 6);

  return <div className={styles.categoryGrid}>{visible.map((category) => {
    const visual = categoryVisuals[category.visualKey] ?? defaultVisual;
    return <Link key={category.code} href={`/search?categoryCode=${encodeURIComponent(category.code)}`} className={styles.categoryCard}>
      <span className={styles.categoryImage}><Image src={visual.image} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw" /></span>
      <span className={styles.categoryBody}><b>{category.nameAr}</b><small>{visual.description}</small><i>استكشف الخدمات ←</i></span>
    </Link>;
  })}</div>;
}
