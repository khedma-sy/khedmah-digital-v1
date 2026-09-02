'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type BusinessBranch, type BusinessSocialLink, type MediaAsset, type OpeningHours, type PublicBusinessProfile, type PublicServiceListing, type VerificationRequest } from '../../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../../lib/use-syrian-cities';
import { useCategories } from '../../../lib/use-categories';
import { ContactInquiryForm } from '../../../components/contact-inquiry-form';
import { ProviderReportForm } from '../../../components/provider-report-form';
import { ActionButton, ActionLink, EmptyState, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import { ProviderQrAction } from './provider-qr-action';
import { buildKhedmaShareText } from '../../../lib/launch-campaign';
import styles from './public-profile.module.css';

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const priceType = (type: string) => type === 'fixed' ? 'سعر ثابت' : type === 'hourly' ? 'بالساعة' : 'قابل للتفاوض';
const FOOD_ORDER_CATEGORIES = new Set(['restaurant', 'cafe', 'bakery', 'sweets', 'catering', 'juice_icecream']);

export default function BusinessProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cities } = useSyrianCities();
  const { categories } = useCategories();
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [hours, setHours] = useState<OpeningHours[]>([]);
  const [branches, setBranches] = useState<BusinessBranch[]>([]);
  const [socialLinks, setSocialLinks] = useState<BusinessSocialLink[]>([]);
  const [verification, setVerification] = useState<VerificationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareMsg, setShareMsg] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setIsLoading(true); setError('');
      try {
        const [businessData, serviceData, mediaData, hoursData, branchData, socialData, verificationData] = await Promise.all([
          api.businesses.getPublic(id),
          api.services.listForOwner(id, 'business').catch(() => ({ services: [] })),
          api.businesses.getMedia(id).catch(() => ({ assets: [] })),
          api.businesses.getOpeningHours(id).catch(() => ({ hours: [] })),
          api.businesses.getBranches(id).catch(() => ({ branches: [] })),
          api.businesses.getSocialLinks(id).catch(() => ({ links: [] })),
          api.businesses.getVerificationStatus(id).catch(() => ({ status: null }))
        ]);
        if (!active) return;
        setBusiness(businessData.business); setServices(serviceData.services); setMedia(mediaData.assets);
        setHours(hoursData.hours); setBranches(branchData.branches); setSocialLinks(socialData.links); setVerification(verificationData.status);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل ملف النشاط.'); }
      finally { if (active) setIsLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [id]);

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(buildKhedmaShareText(business?.name ?? 'نشاط على خدمة', window.location.href));
      setShareMsg('تم نسخ رسالة النشاط والرابط');
    } catch {
      setShareMsg('تعذر نسخ الرابط');
    }
    setTimeout(() => setShareMsg(''), 2000);
  }

  function shareViaWhatsapp() {
    if (!business) return;
    const text = encodeURIComponent(buildKhedmaShareText(business.name, window.location.href));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  async function shareViaDevice() {
    if (!business) return;
    if (!navigator.share) {
      await copyProfileLink();
      return;
    }
    try {
      await navigator.share({ title: `☂ خدمة | ${business.name}`, text: buildKhedmaShareText(business.name, window.location.href), url: window.location.href });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setShareMsg('تعذرت المشاركة عبر الجهاز');
      setTimeout(() => setShareMsg(''), 2000);
    }
  }

  if (isLoading) return <PageShell className={styles.page} label="جاري تحميل ملف النشاط"><SkeletonGrid count={5} label="جاري تحميل معلومات النشاط" /></PageShell>;
  if (error || !business) return <PageShell className={styles.page}><EmptyState icon={<PlatformIcon name="close" size={32}/>} title="تعذر فتح ملف النشاط" description={error || 'هذا الملف غير موجود أو غير متاح للنشر.'} actions={<ActionLink href="/search">العودة إلى البحث</ActionLink>} /></PageShell>;

  const logo = media.find((asset) => asset.assetType === 'logo');
  const cover = media.find((asset) => asset.assetType === 'cover');
  const gallery = media.filter((asset) => asset.assetType === 'gallery');
  const activeServices = services.filter((service) => service.status === 'active');
  const categoryLabel = business.categoryNameAr ?? categories.find((category) => category.code === business.categoryCode)?.nameAr ?? 'خدمة محلية';
  const localizedCity = cityLabel(business.cityCode, cities);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: business.name,
    description: business.descriptionAr ?? business.descriptionEn, telephone: business.phone,
    email: business.email, url: business.website,
    address: business.addressAr ? { '@type': 'PostalAddress', streetAddress: business.addressAr, addressCountry: business.countryCode } : undefined,
    geo: business.lat !== undefined && business.lng !== undefined ? { '@type': 'GeoCoordinates', latitude: business.lat, longitude: business.lng } : undefined,
    image: logo?.url
  };

  return <PageShell className={styles.page} label={`ملف ${business.name}`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className={styles.stack}>
      <div className={styles.cover}>
        {cover ? <img src={cover.url} alt={`غلاف ${business.name}`} /> : <div className={`business-cover-placeholder ${styles.coverFallback}`} aria-hidden="true">خدمة</div>}
        {business.isFeatured && <span className={styles.featured}>نشاط مميز</span>}
      </div>

      <Surface as="section" className={styles.identity}>
        <div className={styles.logo}>{logo ? <img src={logo.url} alt={`شعار ${business.name}`} /> : <span aria-hidden="true">{business.name.charAt(0)}</span>}</div>
        <div className={styles.heading}><div><h1>{business.name}</h1><p className={styles.meta}><span>{categoryLabel}</span><span>·</span><span>{localizedCity}</span>{business.addressAr && <><span>·</span><span>{business.addressAr}</span></>}</p></div>
          <div className={styles.badges}><span className={styles.badge}><PlatformIcon name="check" size={15}/>{business.trustStatus === 'approved' ? 'معتمد' : 'قيد المراجعة'}</span>{business.visibility === 'public' && <span className={`${styles.badge} ${styles.badgeMuted}`}>منشور</span>}</div>
        </div>
        <div className={styles.actions}>
          {FOOD_ORDER_CATEGORIES.has(business.categoryCode) && <ActionLink href={`/restaurants/${business.id}`}>عرض قائمة الطعام والطلب</ActionLink>}
          {business.visibility === 'public' && business.trustStatus === 'approved' && <ContactInquiryForm target={{ type: 'business', id: business.id }} providerName={business.name} />}
          {business.phone && <a className="ui-action ui-action-secondary" href={`tel:${business.phone}`}><PlatformIcon name="phone" size={17}/> اتصال</a>}
          <ActionButton type="button" variant="secondary" onClick={() => router.back()}><PlatformIcon name="arrow" size={17}/> رجوع</ActionButton>
          <ProviderQrAction providerName={business.name} />
          <ActionButton type="button" variant="secondary" onClick={shareViaWhatsapp}>مشاركة عبر واتساب</ActionButton>
          <ActionButton type="button" variant="secondary" onClick={() => void copyProfileLink()}>نسخ رابط النشاط</ActionButton>
          <ActionButton type="button" variant="secondary" onClick={() => void shareViaDevice()}>مشاركة عبر الجهاز</ActionButton>
          {business.visibility === 'public' && <ProviderReportForm target={{ type: 'business', id: business.id }} providerName={business.name} />}
          {shareMsg && <span className={styles.shareStatus} role="status">{shareMsg}</span>}
        </div>
      </Surface>

      {verification && <StatusMessage tone={verification.status === 'approved' ? 'success' : verification.status === 'rejected' ? 'danger' : 'warning'}><div className={styles.verification}><span className={styles.verificationIcon}><PlatformIcon name={verification.status === 'approved' ? 'check' : verification.status === 'rejected' ? 'close' : 'lock'} /></span><div><strong>{verification.status === 'approved' ? 'تم توثيق النشاط' : verification.status === 'rejected' ? 'طلب التوثيق مرفوض' : 'طلب التوثيق قيد المراجعة'}</strong>{verification.notes && <p>{verification.notes}</p>}</div></div></StatusMessage>}

      <div className={styles.content}>
        <div className={styles.main}>
          {(business.descriptionAr || business.descriptionEn) && <Surface className={styles.section}><h2>عن النشاط</h2>{business.descriptionAr && <p>{business.descriptionAr}</p>}{business.descriptionEn && <p className={styles.secondaryText}>{business.descriptionEn}</p>}</Surface>}

          {activeServices.length > 0 && <Surface className={styles.section}><h2>الخدمات المقدمة ({activeServices.length})</h2><div className={styles.grid}>{activeServices.map((service) => <Surface as="article" className={styles.service} key={service.id}><div className={styles.serviceTop}><h3>{service.titleAr}</h3><span className={styles.badge}>{priceType(service.priceType)}</span></div><p>{service.categoryNameAr ?? categories.find((category) => category.code === service.categoryCode)?.nameAr ?? 'خدمة محلية'}</p>{service.descriptionAr && <p>{service.descriptionAr}</p>}{service.price != null && <strong className={styles.price}>{service.price.toLocaleString('ar-SY')} {service.priceCurrency ?? 'SYP'}</strong>}</Surface>)}</div></Surface>}

          {gallery.length > 0 && <Surface className={styles.section}><h2>معرض الصور ({gallery.length})</h2><div className={styles.gallery}>{gallery.map((image) => <img key={image.id} src={image.url} alt={`صورة من ${business.name}`} loading="lazy" />)}</div></Surface>}

          {branches.length > 0 && <Surface className={styles.section}><h2>الفروع ({branches.length})</h2><div className={styles.grid}>{branches.map((branch) => <Surface as="article" className={styles.branch} key={branch.id}><div className={styles.serviceTop}><h3>{branch.nameAr}</h3>{branch.isMain && <span className={styles.badge}>الفرع الرئيسي</span>}</div>{branch.addressAr && <p><PlatformIcon name="pin" size={15}/> {branch.addressAr}</p>}{branch.phone && <a href={`tel:${branch.phone}`}>{branch.phone}</a>}{branch.lat !== undefined && branch.lng !== undefined && <a href={`https://www.google.com/maps?q=${branch.lat},${branch.lng}`} target="_blank" rel="noopener noreferrer">عرض الفرع على الخريطة</a>}</Surface>)}</div></Surface>}
        </div>

        <aside className={styles.aside} aria-label="معلومات التواصل والعمل">
          {(business.phone || business.email || business.website || socialLinks.length > 0) && <Surface className={styles.section}><h2>التواصل</h2><div className={styles.contactList}>{business.phone && <a href={`tel:${business.phone}`}><PlatformIcon name="phone" size={17}/><bdi>{business.phone}</bdi></a>}{business.email && <a href={`mailto:${business.email}`}><PlatformIcon name="mail" size={17}/><bdi>{business.email}</bdi></a>}{business.website && <a href={business.website} target="_blank" rel="noopener noreferrer"><PlatformIcon name="briefcase" size={17}/> الموقع الإلكتروني</a>}{socialLinks.map((link) => <a href={link.url} target="_blank" rel="noopener noreferrer" key={link.id}><PlatformIcon name="arrow" size={16}/>{link.platform}</a>)}</div></Surface>}

          {hours.length > 0 && <Surface className={styles.section}><h2>ساعات العمل</h2><div className={styles.hours}>{hours.map((hour) => <div className={styles.hour} key={hour.id}><strong>{DAY_NAMES[hour.dayOfWeek] ?? hour.dayOfWeek}</strong><span>{hour.isClosed ? 'مغلق' : `${hour.openTime} — ${hour.closeTime}`}</span></div>)}</div></Surface>}

          {business.lat !== undefined && business.lng !== undefined && <Surface className={styles.section}><h2>الموقع</h2><a className={styles.mapLink} href={`https://www.google.com/maps?q=${business.lat},${business.lng}`} target="_blank" rel="noopener noreferrer"><PlatformIcon name="pin" size={28}/><strong>عرض الموقع على خرائط جوجل</strong><span className={styles.coordinates}>{business.lat.toFixed(5)}, {business.lng.toFixed(5)}</span></a></Surface>}

          {!business.phone && !business.email && !business.website && !hours.length && <Surface className={styles.section}><h2>معلومات النشاط</h2><p>لم يضف مقدم النشاط معلومات تواصل أو ساعات عمل بعد.</p><Link href="/search">استكشف نشاطاً آخر</Link></Surface>}
        </aside>
      </div>
    </div>
  </PageShell>;
}
