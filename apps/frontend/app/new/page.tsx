'use client';

import { useEffect, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { PlatformIcon } from '../components/platform-icon';
import { ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import styles from './whats-new.module.css';

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

export default function WhatsNewPage() {
  const { cities } = useSyrianCities();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.businesses.getRecentlyAdded()
      .then(({ businesses: items }) => { if (active) setBusinesses(items.filter(isPublicRelease)); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الجديد في خدمة.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  return <PageShell className={styles.page} label="جديد في خدمة">
    <PageHeader eyebrow="تحديثات حقيقية من المنصة" title="جديد في خدمة" description="أنشطة منشورة وموثقة انضمت حديثاً تحت مظلة واحدة." actions={<ActionLink href="/search" variant="secondary"><PlatformIcon name="search" size={17}/> اكتشف الخدمات</ActionLink>} />
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {isLoading && <SkeletonGrid count={6} label="جاري تحميل الأنشطة الجديدة" />}
    {!isLoading && !error && businesses.length > 0 && <section className={styles.feed} aria-label="الأنشطة المنضمة حديثاً">
      {businesses.map((business) => <Surface as="article" className={styles.update} key={business.id}>
        <div className={styles.updateIcon}><PlatformIcon name="briefcase" size={24}/></div>
        <div className={styles.updateBody}>
          <div className={styles.updateMeta}><span><PlatformIcon name="check" size={14}/> نشاط موثّق</span><time dateTime={business.createdAt}>{formatDate(business.createdAt)}</time></div>
          <h2>{business.name}</h2>
          <p>{business.descriptionAr || `انضم نشاط جديد إلى خدمة في ${cityLabel(business.cityCode, cities)}.`}</p>
          <div className={styles.updateFooter}><span><PlatformIcon name="pin" size={15}/> {cityLabel(business.cityCode, cities)}</span><ActionLink href={`/business-profiles/${encodeURIComponent(business.id)}?source=whats-new`}>عرض النشاط <PlatformIcon name="arrow" size={16}/></ActionLink></div>
        </div>
      </Surface>)}
    </section>}
    {!isLoading && !error && businesses.length === 0 && <EmptyState icon={<PlatformIcon name="briefcase" size={34}/>} title="لا توجد تحديثات منشورة الآن" description="ستظهر هنا الأنشطة بعد نشرها واعتمادها، ولن نعرض بيانات تجريبية أو غير موثقة." actions={<ActionLink href="/search" variant="secondary">استكشف الأنشطة الحالية</ActionLink>} />}
  </PageShell>;
}
