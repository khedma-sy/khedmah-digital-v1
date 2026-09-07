'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicProfessionalProfile } from '../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from '../../components/owner-workspace.module.css';

const availabilityLabel = (value: string) => value === 'available' ? 'متاح' : value === 'busy' ? 'مشغول' : 'حسب الموعد';
const moderationLabel = (value?: string) => value === 'approved' ? 'معتمد' : value === 'rejected' ? 'مطلوب تعديل' : value === 'suspended' ? 'موقوف' : 'قيد المراجعة';

export default function ProfessionalProfilesPage() {
  const router = useRouter();
  const { cities } = useSyrianCities();
  const [profile, setProfile] = useState<PublicProfessionalProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.professionals.getMine();
      setProfile(data.professional);
    } catch (cause) {
      const statusCode = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (statusCode === 401) {
        router.replace('/auth/login?next=%2Fprofessional-profiles');
        return;
      }
      if (statusCode === 404) setProfile(null);
      else setError(cause instanceof Error ? cause.message : 'تعذر تحميل الملف المهني.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submitForReview() {
    if (!profile) return;
    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api.professionals.submitForReview(profile.id);
      setNotice('تم إرسال الملف المهني للمراجعة.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إرسال الملف للمراجعة.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const moderationStatus = profile?.contactEligibility?.moderationStatus;
  const canSubmit = !!profile?.contactEligibility && (moderationStatus === 'rejected' || profile.contactEligibility.lifecycleStatus === 'created');

  return <PageShell className={styles.page} label="ملفي المهني">
    <PageHeader
      eyebrow="مساحة المهني"
      title="ملفي المهني"
      description="أدر معلوماتك المهنية وخدماتك وظهورك العام، ثم أرسل الملف للمراجعة قبل نشره للعملاء."
      actions={<div className={styles.headerActions}><ActionLink href="/professional-profiles/new"><PlatformIcon name="user" size={18}/>{profile ? 'تعديل الملف' : 'إنشاء ملف'}</ActionLink><ActionLink href="/professional-profiles/search" variant="secondary">تصفح المهنيين</ActionLink></div>}
    />

    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {notice && <StatusMessage tone="success">{notice}</StatusMessage>}

    {isLoading ? <SkeletonGrid count={2} label="جاري تحميل ملفك المهني" /> : profile ? <div className={styles.workspaceGrid}>
      <Surface as="article" className={`${styles.card} ${styles.profileCard}`}>
        <div className={styles.cardTop}>
          <div>
            <p className={styles.kicker}>الهوية المهنية</p>
            <h2>{profile.headlineAr}</h2>
            {profile.headlineEn && <p className={styles.english} dir="ltr">{profile.headlineEn}</p>}
          </div>
          <div className={styles.badges}>
            <span className={`${styles.badge} ${profile.availability === 'available' ? styles.success : profile.availability === 'busy' ? styles.warning : styles.muted}`}>{availabilityLabel(profile.availability)}</span>
            <span className={`${styles.badge} ${moderationStatus === 'approved' ? styles.success : moderationStatus === 'rejected' || moderationStatus === 'suspended' ? styles.danger : styles.warning}`}>{moderationLabel(moderationStatus)}</span>
          </div>
        </div>
        <p className={styles.description}>{profile.bioAr || 'لم تضف نبذة مهنية بعد. أكمل الملف لتوضيح خبرتك للعملاء.'}</p>
        <div className={styles.profileMeta}><span><PlatformIcon name="pin" size={15}/>{cityLabel(profile.cityCode, cities)}</span><span>{profile.countryCode}</span></div>
        {profile.skills.length > 0 && <div className={styles.skillList} aria-label="المهارات">{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
        <div className={styles.actions}><ActionLink href={`/professional-profiles/${profile.id}`}>عرض الملف العام</ActionLink><ActionLink href="/professional-profiles/new" variant="secondary">تعديل</ActionLink>{canSubmit && <ActionButton type="button" variant="secondary" disabled={isSubmitting} onClick={() => void submitForReview()}>{isSubmitting ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}</ActionButton>}</div>
      </Surface>

      <Surface as="aside" className={styles.guide}>
        <h2>جاهزية الملف</h2>
        <p>كلما كان الملف أوضح، أصبح قرار العميل أسرع.</p>
        <ol><li>عنوان مهني واضح</li><li>نبذة مختصرة عن الخبرة</li><li>مهارات وخدمات دقيقة</li><li>مدينة وحالة توفر محدثة</li></ol>
        <ActionLink href="/professional-profiles/new" variant="secondary">مراجعة البيانات</ActionLink>
      </Surface>
    </div> : <EmptyState icon={<PlatformIcon name="user" size={32}/>} title="أنشئ ملفك المهني" description="أضف تخصصك وخبرتك ومهاراتك لتظهر أمام العملاء الباحثين عن مهنيين في منطقتهم." actions={<ActionLink href="/professional-profiles/new">إنشاء ملف مهني</ActionLink>} />}
  </PageShell>;
}
