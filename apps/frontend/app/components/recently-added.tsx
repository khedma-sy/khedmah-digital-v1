'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ProductListing } from '../../lib/api-client';
import { PlatformIcon } from './platform-icon';
import styles from '../home.module.css';

export function RecentlyAdded() {
  const [ads, setAds] = useState<ProductListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void api.products.list({}).then(({ products }) => { if (active) setAds(products.slice(0, 8)); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);
  return <section id="classifieds-strip" className={styles.recent} aria-labelledby="classifieds-title">
    <div className={styles.sectionHeading}><span>إعلانات مرتبطة بأنشطة معتمدة</span><h2 id="classifieds-title">الإعلانات المبوبة</h2><p>منتجات وعروض منشورة بعد المراجعة، والتواصل مباشر مع النشاط المعلن.</p></div>
    {isLoading ? <div className={styles.recentGrid} aria-label="جاري تحميل الإعلانات">{[0, 1, 2].map(item => <div className={styles.recentSkeleton} key={item} />)}</div> : ads.length ?
      <div className={styles.adRail}>{ads.map(ad => <article className={styles.recentCard} key={ad.id}><div className={styles.recentMeta}><span><PlatformIcon name="briefcase" /> إعلان</span><span>{ad.businessName}</span></div><h3>{ad.titleAr}</h3><p>{ad.descriptionAr || 'اطّلع على التفاصيل وتواصل مباشرة مع النشاط المعلن.'}</p><div className={styles.recentFooter}><strong>{ad.price.toLocaleString('ar-SY-u-nu-latn')} {ad.currency}</strong><Link href={`/store/products/${encodeURIComponent(ad.id)}`}>عرض الإعلان <PlatformIcon name="arrow" /></Link></div></article>)}</div> :
      <div className={styles.recentEmpty} role={error ? 'alert' : 'status'}><PlatformIcon name="briefcase" size={30} /><h3>{error ? 'تعذر تحميل الإعلانات' : 'لا توجد إعلانات منشورة حاليًا'}</h3><p>{error ? 'أعد المحاولة لاحقًا.' : 'يمكن لصاحب نشاط معتمد إضافة أول إعلان وإرساله للمراجعة.'}</p><Link href="/store/sell">أضف إعلانًا</Link></div>}
    <div className={styles.recentAction}><Link href="/classifieds">فتح صفحة الإعلانات المبوبة</Link></div>
  </section>;
}
