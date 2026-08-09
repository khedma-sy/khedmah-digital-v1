'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, ProviderContactInquiry, PublicBusinessProfile, PublicServiceListing, PublicUserProfile } from '../../../../lib/api-client';
import { PlatformIcon } from '../../../components/platform-icon';
import styles from './provider-core.module.css';

const CATEGORIES = [
  ['restaurant', 'مطاعم'], ['shop', 'محلات'], ['workshop', 'ورش'],
  ['service_business', 'خدمات'], ['doctor', 'طب'], ['lawyer', 'محاماة'],
  ['engineer', 'هندسة'], ['consultant', 'استشارات'], ['freelancer', 'عمل مستقل']
] as const;

export default function ManageBusinessProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicServiceListing[]>([]);
  const [inquiries, setInquiries] = useState<ProviderContactInquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingServiceId, setUpdatingServiceId] = useState('');
  const [error, setError] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [categoryCode, setCategoryCode] = useState('service_business');
  const [priceType, setPriceType] = useState('negotiable');
  const [price, setPrice] = useState('');

  async function loadProviderCore() {
    setIsLoading(true);
    setError('');
    try {
      const [session, profiles, ownerServices, received] = await Promise.all([
        api.auth.session(),
        api.businesses.listMine(),
        api.services.listForOwner(id, 'business'),
        api.businesses.listReceivedInquiries(id)
      ]);
      setUser(session.user);
      const ownedProfile = profiles.businesses.find((profile) => profile.id === id);
      if (!ownedProfile) {
        router.replace('/business-profiles');
        return;
      }
      setBusiness(ownedProfile);
      setServices(ownerServices.services);
      setInquiries(received.inquiries);
    } catch (loadError) {
      const status = loadError instanceof Error ? (loadError as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401 || status === 403) {
        router.replace('/auth/login');
        return;
      }
      setError('تعذر تحميل إدارة ملف العمل.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadProviderCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setIsSaving(true);
    setError('');
    try {
      await api.services.create({
        titleAr: titleAr.trim(),
        descriptionAr: descriptionAr.trim() || undefined,
        categoryCode,
        price: price ? Number(price) : undefined,
        priceCurrency: 'SYP',
        priceType,
        ownerId: id,
        ownerType: 'business',
        ownerUserId: user.id
      });
      setTitleAr('');
      setDescriptionAr('');
      setPrice('');
      setShowServiceForm(false);
      await loadProviderCore();
    } catch {
      setError('تعذر حفظ الخدمة. راجع البيانات وحاول مجدداً.');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleService(service: PublicServiceListing) {
    setUpdatingServiceId(service.id);
    setError('');
    try {
      const result = await api.services.update(service.id, { status: service.status === 'active' ? 'inactive' : 'active' });
      setServices((current) => current.map((item) => item.id === service.id ? result.service : item));
    } catch {
      setError('تعذر تحديث حالة الخدمة.');
    } finally {
      setUpdatingServiceId('');
    }
  }

  return (
    <main id="foundation-content" className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>إدارة حضورك</p>
            <h1>{business?.name ?? 'ملف العمل'}</h1>
            <p>خدماتك والاستفسارات التي وصلتك في مكان واحد.</p>
          </div>
          <button type="button" className={styles.primaryAction} onClick={() => setShowServiceForm((value) => !value)} aria-expanded={showServiceForm}>
            <PlatformIcon name={showServiceForm ? 'close' : 'grid'} size={19} />
            {showServiceForm ? 'إغلاق' : 'إضافة خدمة'}
          </button>
        </header>

        <nav className={styles.secondaryActions} aria-label="إجراءات الملف">
          <Link href={`/business-profiles/${id}`}><PlatformIcon name="user" size={18} /> عرض الملف العام</Link>
          <Link href="/business-profiles"><PlatformIcon name="arrow" size={18} /> كل ملفات أعمالي</Link>
        </nav>

        {error && <p className={styles.error} role="alert">{error}</p>}

        {showServiceForm && (
          <form className={styles.serviceForm} onSubmit={createService}>
            <h2>خدمة جديدة</h2>
            <label>اسم الخدمة<input value={titleAr} onChange={(event) => setTitleAr(event.target.value)} minLength={2} maxLength={200} required /></label>
            <label>وصف مختصر<textarea value={descriptionAr} onChange={(event) => setDescriptionAr(event.target.value)} maxLength={2000} rows={4} /></label>
            <div className={styles.formGrid}>
              <label>التصنيف<select value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)}>{CATEGORIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
              <label>طريقة السعر<select value={priceType} onChange={(event) => setPriceType(event.target.value)}><option value="negotiable">قابل للتفاوض</option><option value="fixed">سعر ثابت</option><option value="hourly">بالساعة</option></select></label>
            </div>
            {priceType !== 'negotiable' && <label>السعر بالليرة السورية<input type="number" value={price} onChange={(event) => setPrice(event.target.value)} min="1" step="1" required /></label>}
            <button className={styles.primaryAction} type="submit" disabled={isSaving} aria-busy={isSaving}>{isSaving ? 'جارٍ الحفظ…' : 'حفظ الخدمة'}</button>
          </form>
        )}

        {isLoading ? <p className={styles.loading} aria-busy="true">جارٍ تحميل بيانات العمل…</p> : (
          <div className={styles.content}>
            <section aria-labelledby="services-title">
              <div className={styles.sectionHeading}><h2 id="services-title">الخدمات</h2><span>{services.length}</span></div>
              {services.length === 0 ? <p className={styles.empty}>لم تضف خدمات بعد. أضف أول خدمة ليعرف العملاء ما الذي تقدمه.</p> : (
                <div className={styles.list}>{services.map((service) => <article key={service.id} className={styles.listItem}><div><h3>{service.titleAr}</h3><p>{service.descriptionAr || 'لا يوجد وصف.'}</p><small>{service.status === 'active' ? 'ظاهرة للعملاء' : 'مخفية عن العملاء'}</small></div><button type="button" onClick={() => void toggleService(service)} disabled={updatingServiceId === service.id}>{service.status === 'active' ? 'إخفاء' : 'نشر'}</button></article>)}</div>
              )}
            </section>

            <section aria-labelledby="inquiries-title">
              <div className={styles.sectionHeading}><h2 id="inquiries-title">الاستفسارات الواردة</h2><span>{inquiries.length}</span></div>
              {inquiries.length === 0 ? <p className={styles.empty}>لا توجد استفسارات جديدة حتى الآن.</p> : (
                <div className={styles.list}>{inquiries.map((inquiry) => <article key={inquiry.id} className={styles.inquiry}><div className={styles.inquiryMeta}><h3>{inquiry.name}</h3><time dateTime={inquiry.createdAt}>{new Date(inquiry.createdAt).toLocaleDateString('ar-SY')}</time></div><p>{inquiry.message}</p><a href={`mailto:${inquiry.contactEmail}`} dir="ltr">{inquiry.contactEmail}</a></article>)}</div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
