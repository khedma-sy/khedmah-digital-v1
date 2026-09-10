'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { classifiedsApi, type OwnerAdListing } from '../../../lib/classifieds-client';
import { AD_KIND_LABELS, AD_STATUS_LABELS, CLASSIFIEDS_ENABLED, formatAdPrice } from '../../../lib/classifieds';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from '../classifieds.module.css';

export default function ManageClassifiedsPage() {
  const router = useRouter();
  const [ads, setAds] = useState<OwnerAdListing[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: 3 } | null>(null);
  const [loading, setLoading] = useState(CLASSIFIEDS_ENABLED);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!CLASSIFIEDS_ENABLED) return;
    let active = true;
    setLoading(true); setError('');
    void Promise.all([classifiedsApi.listMine(), classifiedsApi.quota()])
      .then(([list, quotaData]) => { if (active) { setAds(list.ads); setQuota(quotaData); } })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) { setError('انتهت الجلسة. يرجى تسجيل الدخول.'); router.replace('/auth/login?next=%2Fclassifieds%2Fmanage'); }
        else setError(cause instanceof Error ? cause.message : 'تعذر تحميل إعلاناتك.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, retryCount]);

  if (!CLASSIFIEDS_ENABLED) return <PageShell className={styles.page} label="إعلاناتي"><StatusMessage tone="warning">إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة.</StatusMessage><ActionLink href="/classifieds" variant="secondary">العودة للإعلانات</ActionLink></PageShell>;

  return <PageShell className={styles.page} label="إعلاناتي">
    <PageHeader eyebrow="مساحة المعلن" title="إعلاناتي" description="تابع المسودات والمراجعة والإعلانات المنشورة من مكان واحد." actions={<ActionLink href="/classifieds/new">أضف إعلانًا</ActionLink>}/>
    {quota && <Surface className={styles.quota}><strong>الحصة المجانية</strong><span>{quota.used} من {quota.limit} مستخدمة</span></Surface>}
    {error && <StatusMessage tone="danger">{error} <ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</ActionButton></StatusMessage>}
    {loading ? <SkeletonGrid count={4}/> : error ? null : ads.length ? <section className={styles.grid} aria-label="إعلاناتي">
      {ads.map((ad) => <Surface as="article" className={styles.card} key={ad.id}>
        <div className={styles.image}>{ad.status === 'active' && ad.imageUrls[0] ? <img src={ad.imageUrls[0]} alt={ad.titleAr}/> : <span aria-hidden="true">خ</span>}</div>
        <span className={styles.status}>{AD_STATUS_LABELS[ad.status]}</span>
        <div className={styles.meta}><span>{AD_KIND_LABELS[ad.kind]}</span>{ad.cityCode && <><span>·</span><span>{ad.cityCode}</span></>}</div>
        <h2>{ad.titleAr}</h2>
        <strong className={styles.price}>{formatAdPrice(ad)}</strong>
        {ad.rejectionReason && <StatusMessage tone="danger">{ad.rejectionReason}</StatusMessage>}
        <div className={styles.actions}>
          <ActionLink href={`/classifieds/manage/${encodeURIComponent(ad.id)}/edit`} variant="secondary">إدارة الإعلان</ActionLink>
          {ad.status === 'active' && <ActionLink href={`/classifieds/${encodeURIComponent(ad.id)}`}>عرض الصفحة العامة</ActionLink>}
        </div>
      </Surface>)}
    </section> : <EmptyState icon={<PlatformIcon name="briefcase" size={34}/>} title="لم تضف إعلانات بعد" description="أنشئ أول إعلان مستقل؛ المسودة لا تستهلك الحصة حتى إرسالها للمراجعة." actions={<ActionLink href="/classifieds/new">أضف أول إعلان</ActionLink>}/>} 
  </PageShell>;
}
