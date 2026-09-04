'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type MediaAsset, type PublicProfessionalProfile, type PublicServiceListing, type VerificationStatus } from '../../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { useCategories } from '../../../lib/use-categories';
import { ContactInquiryForm } from '../../../components/contact-inquiry-form';
import { ProviderReportForm } from '../../../components/provider-report-form';
import { ActionButton, ActionLink, EmptyState, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from './professional-profile.module.css';
import { buildKhedmaShareText } from '../../../lib/launch-campaign';

const availabilityLabel = (value: PublicProfessionalProfile['availability']) => value === 'available' ? 'متاح للعمل' : value === 'busy' ? 'مشغول حالياً' : 'غير متاح حالياً';
const priceTypeLabel = (value: string) => value === 'fixed' ? 'سعر ثابت' : value === 'hourly' ? 'بالساعة' : 'قابل للتفاوض';

export default function ProfessionalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cities } = useSyrianCities();
  const { categories } = useCategories();
  const [profile, setProfile] = useState<PublicProfessionalProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true); setError('');
      try {
        const [profileData, serviceData, mediaData, verificationData] = await Promise.all([
          api.professionals.getProfile(id), api.services.listForOwner(id, 'professional').catch(() => ({ services: [] })),
          api.professionals.getMedia(id).catch(() => ({ assets: [] })), api.professionals.getVerificationStatus(id).catch(() => ({ status: null }))
        ]);
        if (!active) return;
        setProfile(profileData.professional); setServices(serviceData.services); setMedia(mediaData.assets); setVerification(verificationData.status);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الملف المهني.'); }
      finally { if (active) setIsLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [id]);

  async function share() {
    const url = window.location.href;
    const subject = profile?.headlineAr ?? 'مقدم خدمة محترف';
    const brandedText = buildKhedmaShareText(subject, url);
    try {
      if (navigator.share) await navigator.share({ title: `☂ خدمة | ${subject}`, text: brandedText, url });
      else { await navigator.clipboard.writeText(brandedText); setShareMessage('تم نسخ رسالة المشاركة والرابط'); setTimeout(() => setShareMessage(''), 2000); }
    } catch { setShareMessage('تعذرت المشاركة'); setTimeout(() => setShareMessage(''), 2000); }
  }

  if (isLoading) return <PageShell className={styles.page} label="جاري تحميل الملف المهني"><SkeletonGrid count={5} label="جاري تحميل معلومات مقدم الخدمة" /></PageShell>;
  if (error || !profile) return <PageShell className={styles.page}><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="تعذر فتح الملف المهني" description={error || 'هذا الملف غير موجود أو غير متاح للنشر.'} actions={<ActionLink href="/professional-profiles/search">العودة إلى البحث</ActionLink>} /></PageShell>;

  const portrait = media.find((asset) => asset.assetType === 'profile_image');
  const cover = media.find((asset) => asset.assetType === 'cover');
  const gallery = media.filter((asset) => asset.assetType === 'gallery');
  const activeServices = services.filter((service) => service.status === 'active');
  const localizedCity = cityLabel(profile.cityCode, cities);
  const eligible = profile.contactEligibility?.eligible === true;

  return <PageShell className={styles.page} label={`ملف ${profile.headlineAr}`}>
    <div className={styles.stack}>
      <div className={styles.cover}>
        {cover ? <img src={cover.url} alt={`غلاف ${profile.headlineAr}`} /> : <div className={styles.coverFallback} aria-hidden="true"><span>خدمة</span><small>خبرات موثوقة تحت مظلة واحدة</small></div>}
        {profile.isFeatured && <span className={styles.featured}>مهني مميز</span>}
      </div>

      <Surface as="section" className={styles.identity}>
        <div className={styles.portrait}>{portrait ? <img src={portrait.url} alt={`صورة ${profile.headlineAr}`} /> : <span aria-hidden="true">{profile.headlineAr.charAt(0)}</span>}</div>
        <div className={styles.heading}>
          <div><p className={styles.eyebrow}>مقدم خدمة محترف</p><h1>{profile.headlineAr}</h1>{profile.headlineEn && <p className={styles.english}>{profile.headlineEn}</p>}<p className={styles.meta}><PlatformIcon name="pin" size={16}/><span>{localizedCity}</span><span>·</span><span>{profile.countryCode.toUpperCase()}</span></p></div>
          <div className={styles.badges}><span className={`${styles.badge} ${profile.availability === 'available' ? styles.available : styles.badgeMuted}`}>{availabilityLabel(profile.availability)}</span>{verification?.status === 'approved' && <span className={styles.badge}><PlatformIcon name="check" size={15}/> موثّق</span>}</div>
        </div>
        <div className={styles.actions}>
          {eligible && <ContactInquiryForm target={{ type: 'professional', id: profile.id }} providerName={profile.headlineAr} />}
          <ActionButton type="button" variant="secondary" onClick={() => router.back()}><PlatformIcon name="arrow" size={17}/> رجوع</ActionButton>
          <ActionButton type="button" variant="secondary" onClick={() => void share()}><PlatformIcon name="arrow" size={17}/> مشاركة</ActionButton>
          {eligible && <ProviderReportForm target={{ type: 'professional', id: profile.id }} providerName={profile.headlineAr} />}
          {shareMessage && <span className={styles.shareStatus} role="status">{shareMessage}</span>}
        </div>
      </Surface>

      {verification && <StatusMessage tone={verification.status === 'approved' ? 'success' : verification.status === 'rejected' ? 'danger' : 'warning'}><div className={styles.verification}><span><PlatformIcon name={verification.status === 'approved' ? 'check' : verification.status === 'rejected' ? 'close' : 'lock'} /></span><div><strong>{verification.status === 'approved' ? 'تم توثيق هوية مقدم الخدمة' : verification.status === 'rejected' ? 'طلب التوثيق غير معتمد' : 'طلب التوثيق قيد المراجعة'}</strong></div></div></StatusMessage>}

      <div className={styles.content}>
        <div className={styles.main}>
          {(profile.bioAr || profile.bioEn) && <Surface className={styles.section}><h2>نبذة مهنية</h2>{profile.bioAr && <p>{profile.bioAr}</p>}{profile.bioEn && <p className={styles.english}>{profile.bioEn}</p>}</Surface>}
          {profile.skills.length > 0 && <Surface className={styles.section}><h2>المهارات والتخصصات</h2><div className={styles.skills}>{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div></Surface>}
          <Surface className={styles.section}><div className={styles.sectionHeading}><h2>الخدمات المقدمة</h2><span>{activeServices.length}</span></div>{activeServices.length > 0 ? <div className={styles.serviceGrid}>{activeServices.map((service) => <Surface as="article" className={styles.service} key={service.id}><div className={styles.serviceTop}><h3>{service.titleAr}</h3><span className={styles.badge}>{priceTypeLabel(service.priceType)}</span></div><p className={styles.category}>{service.categoryNameAr ?? categories.find((category) => category.code === service.categoryCode)?.nameAr ?? 'خدمة مهنية'}</p>{service.descriptionAr && <p>{service.descriptionAr}</p>}{service.price != null && <strong>{service.price.toLocaleString('ar-SY-u-nu-latn')} {service.priceCurrency ?? 'SYP'}</strong>}</Surface>)}</div> : <EmptyState icon={<PlatformIcon name="briefcase" size={28}/>} title="لم تُضف خدمات بعد" description="يمكنك استكشاف مهنيين آخرين أو العودة إلى نتائج البحث." actions={<ActionLink href="/professional-profiles/search">استكشف المهنيين</ActionLink>} />}</Surface>
          {gallery.length > 0 && <Surface className={styles.section}><div className={styles.sectionHeading}><h2>معرض الأعمال</h2><span>{gallery.length}</span></div><div className={styles.gallery}>{gallery.map((image) => <img key={image.id} src={image.url} alt={`عمل من معرض ${profile.headlineAr}`} loading="lazy" />)}</div></Surface>}
        </div>

        <aside className={styles.aside} aria-label="ملخص الملف المهني">
          <Surface className={styles.summary}><h2>معلومات سريعة</h2><dl><div><dt>المدينة</dt><dd>{localizedCity}</dd></div><div><dt>حالة التوفر</dt><dd>{availabilityLabel(profile.availability)}</dd></div><div><dt>الخدمات المنشورة</dt><dd>{activeServices.length.toLocaleString('ar-SY-u-nu-latn')}</dd></div><div><dt>حالة الملف</dt><dd>{verification?.status === 'approved' ? 'موثّق' : 'منشور'}</dd></div></dl></Surface>
          <Surface className={styles.safety}><span><PlatformIcon name="lock" size={22}/></span><div><h2>تواصل آمن وواضح</h2><p>راجع تفاصيل الخدمة واتفق مباشرة مع مقدمها. لا توفر «خدمة» دفعاً أو دردشة فورية في الإصدار الحالي.</p></div></Surface>
          <Surface className={styles.discover}><h2>تبحث عن تخصص آخر؟</h2><p>قارن بين الملفات المنشورة حسب المهارة والمدينة.</p><Link href="/professional-profiles/search">تصفح جميع المهنيين</Link></Surface>
        </aside>
      </div>
    </div>
  </PageShell>;
}
