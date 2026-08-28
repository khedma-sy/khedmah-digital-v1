'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  async function load() {
    setIsLoading(true); setError('');
    try { setProfiles((await api.businesses.listMine()).businesses); }
    catch (cause) {
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) { router.replace('/auth/login?next=%2Fbusiness-profiles'); return; }
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل أنشطتك.');
    } finally { setIsLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submitForReview(id: string) {
    setSubmittingId(id); setError('');
    try { await api.businesses.submitForReview(id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إرسال الملف للمراجعة.'); }
    finally { setSubmittingId(''); }
  }

  return <PageShell className={styles.page} label="أنشطتي">
    <PageHeader eyebrow="مساحة صاحب النشاط" title="أنشطتي" description="أدر ملفات الأعمال الخاصة بك، وأكمل خدماتها، ثم أرسلها للمراجعة لتظهر للمستخدمين بعد الاعتماد." actions={<div className={styles.headerActions}><ActionLink href="/business-profiles/new"><PlatformIcon name="grid" size={18}/> إضافة نشاط</ActionLink><ActionLink href="/search?type=business" variant="secondary">استكشف الدليل</ActionLink></div>} />
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {isLoading ? <SkeletonGrid count={4} label="جاري تحميل أنشطتك" /> : profiles.length === 0 ? <EmptyState icon={<PlatformIcon name="briefcase" size={32}/>} title="ابدأ حضور نشاطك على خدمة" description="لم تنشئ أي نشاط بعد. أضف المعلومات الأساسية واحفظه كملف خاص قبل إرساله للمراجعة." actions={<ActionLink href="/business-profiles/new">إنشاء أول نشاط</ActionLink>} /> : <div className={styles.grid}>{profiles.map((profile) => {
      const category = categories.find((item) => item.code === profile.categoryCode)?.nameAr ?? 'تصنيف غير محدد';
      const canSubmit = profile.moderationStatus === 'rejected' || profile.moderationStatus === 'pending';
      return <Surface as="article" className={styles.card} key={profile.id}>
        <div className={styles.cardTop}><div><h2>{profile.name}</h2><p className={styles.meta}><span>{category}</span><span>·</span><span>{cityLabel(profile.cityCode, cities)}</span></p></div><div className={styles.badges}><span className={`${styles.badge} ${moderationTone(profile.moderationStatus)}`}>{moderationLabel(profile.moderationStatus)}</span><span className={`${styles.badge} ${profile.visibility === 'public' ? styles.success : styles.muted}`}>{profile.visibility === 'public' ? 'منشور' : 'خاص'}</span></div></div>
        <p className={styles.description}>{profile.descriptionAr || 'لم تضف وصفاً للنشاط بعد. أكمل الملف قبل إرساله للمراجعة.'}</p>
        <div className={styles.actions}><ActionLink href={`/business-profiles/${profile.id}/manage`}>إدارة النشاط</ActionLink>{profile.visibility === 'public' && <ActionLink href={`/business-profiles/${profile.id}`} variant="secondary">عرض الصفحة العامة</ActionLink>}{canSubmit && <ActionButton type="button" variant="secondary" disabled={submittingId === profile.id} onClick={() => void submitForReview(profile.id)}>{submittingId === profile.id ? 'جارٍ الإرسال…' : 'إرسال للمراجعة'}</ActionButton>}</div>
      </Surface>;
    })}</div>}
  </PageShell>;
}
