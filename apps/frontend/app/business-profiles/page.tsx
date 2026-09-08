'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { cityLabel, useSyrianCities } from '../../lib/use-syrian-cities';
import { useCategories } from '../../lib/use-categories';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from '../../components/owner-workspace.module.css';

const moderationLabel = (status: PublicBusinessProfile['moderationStatus']) => status === 'approved' ? 'معتمد للنشر' : status === 'rejected' ? 'مطلوب تعديل' : status === 'suspended' ? 'موقوف' : 'قيد المراجعة';
const moderationTone = (status: PublicBusinessProfile['moderationStatus']) => status === 'approved' ? styles.success : status === 'rejected' || status === 'suspended' ? styles.danger : styles.warning;

export default function BusinessProfilesPage() {
  const router = useRouter();
  const { cities } = useSyrianCities();
  const { categories } = useCategories();
  const [profiles, setProfiles] = useState<PublicBusinessProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState('');
  const [error, setError] = useState('');

  const [loadError, setLoadError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const lifecycle = useRef(0);
  const submissionInProgress = useRef(false);

  useEffect(() => {
    lifecycle.current += 1;
    return () => { lifecycle.current += 1; };
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true); setLoadError('');
    void api.businesses.listMine()
      .then(({ businesses }) => { if (active) setProfiles(businesses); })
      .catch((cause) => {
        if (!active) return;
        const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
        if (status === 401) {
          setLoadError('انتهت الجلسة. يرجى تسجيل الدخول.');
          router.replace('/auth/login?next=%2Fbusiness-profiles');
        } else setLoadError(cause instanceof Error ? cause.message : 'تعذر تحميل أنشطتك.');
      })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [router, retryCount]);

  async function submitForReview(id: string) {
    if (submissionInProgress.current) return;
    submissionInProgress.current = true;
    const generation = lifecycle.current;
    setSubmittingId(id); setError('');
    try {
      await api.businesses.submitForReview(id);
      if (generation === lifecycle.current) setRetryCount((value) => value + 1);
    } catch (cause) {
      if (generation === lifecycle.current) setError(cause instanceof Error ? cause.message : 'تعذر إرسال الملف للمراجعة.');
    } finally {
      if (generation === lifecycle.current) {
        submissionInProgress.current = false;
        setSubmittingId('');
      }
    }
  }

  return <PageShell className={styles.page} label="أنشطتي">
    <PageHeader eyebrow="مساحة صاحب النشاط" title="أنشطتي" description="أدر ملفات الأعمال الخاصة بك، وأكمل خدماتها، ثم أرسلها للمراجعة لتظهر للمستخدمين بعد الاعتماد." actions={<div className={styles.headerActions}><ActionLink href="/business-profiles/new"><PlatformIcon name="grid" size={18}/> إضافة نشاط</ActionLink><ActionLink href="/search?type=business" variant="secondary">استكشف الدليل</ActionLink></div>} />
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {loadError && <StatusMessage tone="danger">{loadError} <ActionButton type="button" variant="secondary" onClick={() => setRetryCount((value) => value + 1)}>إعادة المحاولة</ActionButton></StatusMessage>}
    {isLoading ? <SkeletonGrid count={4} label="جاري تحميل أنشطتك" /> : loadError ? null : profiles.length === 0 ? <EmptyState icon={<PlatformIcon name="briefcase" size={32}/>} title="ابدأ حضور نشاطك على خدمة" description="لم تنشئ أي نشاط بعد. أضف المعلومات الأساسية واحفظه كملف خاص قبل إرساله للمراجعة." actions={<ActionLink href="/business-profiles/new">إنشاء أول نشاط</ActionLink>} /> : <div className={styles.grid}>{profiles.map((profile) => {
      const category = profile.categoryNameAr ?? categories.find((item) => item.code === profile.categoryCode)?.nameAr ?? 'تصنيف محفوظ سابقاً';
      const isPublic = profile.visibility === 'public' && profile.moderationStatus === 'approved' && profile.trustStatus === 'approved' && profile.status === 'active';
      const canSubmit = profile.moderationStatus === 'rejected' || profile.moderationStatus === 'pending';
      return <Surface as="article" className={styles.card} key={profile.id}>
        <div className={styles.cardTop}><div><h2>{profile.name}</h2><p className={styles.meta}><span>{category}</span><span>·</span><span>{cityLabel(profile.cityCode, cities)}</span></p></div><div className={styles.badges}><span className={`${styles.badge} ${moderationTone(profile.moderationStatus)}`}>{moderationLabel(profile.moderationStatus)}</span><span className={`${styles.badge} ${isPublic ? styles.success : styles.muted}`}>{isPublic ? 'منشور' : profile.visibility === 'private' ? 'خاص' : 'بانتظار أهلية النشر'}</span></div></div>
        <p className={styles.description}>{profile.descriptionAr || 'لم تضف وصفاً للنشاط بعد. أكمل الملف قبل إرساله للمراجعة.'}</p>
        <div className={styles.actions}><ActionLink href={`/business-profiles/${profile.id}/manage`}>إدارة النشاط</ActionLink>{isPublic && <ActionLink href={`/business-profiles/${profile.id}`} variant="secondary">عرض الصفحة العامة</ActionLink>}{canSubmit && <ActionButton type="button" variant="secondary" disabled={!!submittingId || isLoading} onClick={() => void submitForReview(profile.id)}>{submittingId === profile.id ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}</ActionButton>}</div>
      </Surface>;
    })}</div>}
  </PageShell>;
}
