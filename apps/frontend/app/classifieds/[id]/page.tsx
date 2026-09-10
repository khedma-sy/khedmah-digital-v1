'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { classifiedsApi, type PublicAdListing } from '../../../lib/classifieds-client';
import { AD_KIND_LABELS, CLASSIFIEDS_ENABLED, formatAdPrice } from '../../../lib/classifieds';
import { cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from '../classifieds.module.css';

export default function ClassifiedDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { cities } = useSyrianCities();
  const [ad, setAd] = useState<PublicAdListing | null>(null);
  const [loading, setLoading] = useState(CLASSIFIEDS_ENABLED);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!CLASSIFIEDS_ENABLED) return;
    let active = true;
    setLoading(true); setError('');
    void classifiedsApi.get(id)
      .then(({ ad: item }) => { if (active) setAd(item); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الإعلان.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (!CLASSIFIEDS_ENABLED) return <PageShell className={styles.page} label="الإعلان"><StatusMessage tone="warning">إعلانات خدمة غير متاحة مؤقتًا في هذه البيئة.</StatusMessage><ActionLink href="/classifieds">العودة للإعلانات</ActionLink></PageShell>;
  if (loading) return <PageShell className={styles.page} label="الإعلان"><SkeletonGrid count={2}/></PageShell>;
  if (error || !ad) return <PageShell className={styles.page} label="الإعلان"><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="الإعلان غير متاح" description={error || 'هذا الإعلان غير منشور.'} actions={<ActionLink href="/classifieds">العودة للإعلانات</ActionLink>}/></PageShell>;

  const share = () => window.open(`https://wa.me/?text=${encodeURIComponent(`${ad.titleAr}\n${window.location.href}`)}`, '_blank', 'noopener,noreferrer');
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setNotice('تم نسخ رابط الإعلان'); }
    catch { setNotice('تعذر نسخ الرابط'); }
    setTimeout(() => setNotice(''), 2000);
  };
  const phone = ad.contactMode === 'phone' && ad.contactValue ? `tel:${ad.contactValue}` : undefined;
  const whatsappDigits = ad.contactMode === 'whatsapp' && ad.contactValue ? ad.contactValue.replace(/\D/g, '') : '';

  return <PageShell className={styles.page} label={ad.titleAr}>
    <PageHeader eyebrow={`إعلانات خدمة · ${AD_KIND_LABELS[ad.kind]}`} title={ad.titleAr} description={ad.cityCode ? `${cityLabel(ad.cityCode, cities)}${ad.areaText ? ` · ${ad.areaText}` : ''}` : ad.areaText} backHref="/classifieds"/>
    <div className={styles.detail}>
      <Surface className={styles.gallery}>{ad.imageUrls.length ? ad.imageUrls.map((url, index) => <div className={styles.image} key={url}><img src={url} alt={`${ad.titleAr} — صورة ${index + 1}`}/></div>) : <div className={styles.image}><span aria-hidden="true">خ</span></div>}</Surface>
      <Surface className={styles.detailBody}>
        <span className={styles.status}>{AD_KIND_LABELS[ad.kind]}</span>
        <strong className={styles.price}>{formatAdPrice(ad)}</strong>
        {ad.descriptionAr && <p>{ad.descriptionAr}</p>}
        <div className={styles.actions}>
          {ad.businessProfileId && <ActionLink href={`/business-profiles/${encodeURIComponent(ad.businessProfileId)}`}>فتح النشاط المرتبط</ActionLink>}
          {phone && <a className="ui-action ui-action-secondary" href={phone}>اتصال</a>}
          {whatsappDigits && <a className="ui-action ui-action-secondary" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer">واتساب المعلن</a>}
          <ActionButton type="button" variant="secondary" onClick={share}>مشاركة عبر واتساب</ActionButton>
          <ActionButton type="button" variant="secondary" onClick={() => void copy()}>نسخ الرابط</ActionButton>
        </div>
        {notice && <p role="status">{notice}</p>}
        <p className={styles.notice}>التواصل والاتفاق يتمان مباشرة مع المعلن. لا تعالج خدمة المدفوعات أو عمليات الشراء داخل الإعلانات.</p>
      </Surface>
    </div>
  </PageShell>;
}
