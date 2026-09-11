'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { classifiedsApi, type PublicAdListing } from '../../lib/classifieds-client';
import { AD_KIND_LABELS, CLASSIFIEDS_ENABLED, formatAdPrice } from '../../lib/classifieds';
import { PlatformIcon } from './platform-icon';
import styles from '../home.module.css';

export function RecentlyAdded() {
  const [ads, setAds] = useState<PublicAdListing[]>([]);
  const [isLoading, setIsLoading] = useState(CLASSIFIEDS_ENABLED);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!CLASSIFIEDS_ENABLED) return;
    let active = true;
    setIsLoading(true); setError(false);
    void classifiedsApi.list({}).then(({ ads: items }) => { if (active) setAds(items.slice(0, 8)); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  return <section id="classifieds-strip" className={styles.recent} aria-labelledby="classifieds-title">
    <div className={styles.sectionHeading}><span>إعلانات خدمة</span><h2 id="classifieds-title">الإعلانات المبوبة</h2><p>عروض وطلبات وخدمات مستقلة عن متجر خدمة، منشورة بعد المراجعة والتواصل فيها مباشر مع المعلن.</p></div>
    {!CLASSIFIEDS_ENABLED ? <div className={styles.recentEmpty} role="status"><PlatformIcon name="briefcase" size={30}/><h3>إعلانات خدمة قيد التفعيل</h3><p>الوحدة مستقلة وجاهزة للربط بعد اكتمال تفعيل قاعدة البيانات في هذه البيئة.</p></div> : isLoading ?
      <div className={styles.recentGrid} aria-label="جاري تحميل الإعلانات">{[0, 1, 2].map((item) => <div className={styles.recentSkeleton} key={item}/>)}</div> : ads.length ?
      <div className={styles.adRail}>{ads.map((ad) => <article className={styles.recentCard} key={ad.id}><div className={styles.recentMeta}><span><PlatformIcon name="briefcase"/> {AD_KIND_LABELS[ad.kind]}</span><span>{ad.cityCode || 'إعلان مستقل'}</span></div><h3>{ad.titleAr}</h3><p>{ad.descriptionAr || 'اطّلع على التفاصيل وتواصل مباشرة مع المعلن.'}</p><div className={styles.recentFooter}><strong>{formatAdPrice(ad)}</strong><Link href={`/classifieds/${encodeURIComponent(ad.id)}`}>عرض الإعلان <PlatformIcon name="arrow"/></Link></div></article>)}</div> :
      <div className={styles.recentEmpty} role={error ? 'alert' : 'status'}><PlatformIcon name="briefcase" size={30}/><h3>{error ? 'تعذر تحميل الإعلانات' : 'لا توجد إعلانات منشورة حاليًا'}</h3><p>{error ? 'أعد المحاولة لاحقًا.' : 'يمكن للمستخدم إضافة أول إعلان مستقل وإرساله للمراجعة.'}</p>{!error && <Link href="/classifieds/new">أضف إعلانًا</Link>}</div>}
    <div className={styles.recentAction}><Link href="/classifieds">فتح صفحة الإعلانات المبوبة</Link></div>
  </section>;
}
