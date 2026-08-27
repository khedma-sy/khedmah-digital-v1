'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { PlatformIcon } from './platform-icon';
import styles from '../home.module.css';

const KNOWN_TEST_NAMES = new Set(['khedmah production test', 'خدمة production test']);
const isPublicRelease = (business: PublicBusinessProfile) =>
  business.visibility === 'public' &&
  business.moderationStatus === 'approved' &&
  business.trustStatus === 'approved' &&
  business.status === 'active' &&
  !KNOWN_TEST_NAMES.has(business.name.trim().toLocaleLowerCase('en'));

const formatDate = (value: string) => new Intl.DateTimeFormat('ar-SY', {
  day: 'numeric', month: 'long', year: 'numeric'
}).format(new Date(value));

export function RecentlyAdded() {
  const { cities } = useSyrianCities();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void api.businesses.getRecentlyAdded()
      .then(({ businesses: items }) => { if (active) setBusinesses(items.filter(isPublicRelease).slice(0, 6)); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  if (!isLoading && (error || businesses.length === 0)) return null;

  return <section id="whats-new" className={styles.recent} aria-labelledby="recent-title">
    <div className={styles.sectionHeading}>
      <span>انضموا حديثًا</span>
      <h2 id="recent-title">جديد في خدمة</h2>
      <p>أنشطة منشورة وموثقة انضمت حديثًا تحت مظلة واحدة.</p>
    </div>
    {isLoading ? <div className={styles.recentGrid} aria-label="جاري تحميل الأنشطة الجديدة">{[0, 1, 2].map(item => <div className={styles.recentSkeleton} key={item} />)}</div> :
      <div className={styles.recentGrid}>{businesses.map(business => <article className={styles.recentCard} key={business.id}>
        <div className={styles.recentMeta}><span><PlatformIcon name="check" /> نشاط موثّق</span><time dateTime={business.createdAt}>{formatDate(business.createdAt)}</time></div>
        <h3>{business.name}</h3>
        <p>{business.descriptionAr || `انضم نشاط جديد إلى خدمة في ${cityLabel(business.cityCode, cities)}.`}</p>
        <div className={styles.recentFooter}><span><PlatformIcon name="pin" /> {cityLabel(business.cityCode, cities)}</span><Link href={`/business-profiles/${encodeURIComponent(business.id)}?source=whats-new`}>عرض النشاط <PlatformIcon name="arrow" /></Link></div>
      </article>)}</div>}
    <div className={styles.recentAction}><Link href="/search">عرض جميع الخدمات</Link></div>
  </section>;
}
