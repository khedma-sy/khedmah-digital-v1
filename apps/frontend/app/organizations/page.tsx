'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type PublicOrganization } from '../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from '../../components/owner-workspace.module.css';

export default function OrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<PublicOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOrganizations() {
    setIsLoading(true);
    setError('');
    try {
      const data = await api.organizations.listMine();
      setOrganizations(data.organizations);
    } catch (cause) {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) {
        router.replace('/auth/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل المؤسسات والجهات.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganizations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PageShell className={styles.page} label="المؤسسات والجهات">
    <PageHeader eyebrow="مساحة الأعمال" title="المؤسسات والجهات" description="تجمع فريقك وملفات أعمالك التابعة لجهة واحدة، مع صلاحيات عضوية واضحة وإدارة آمنة." actions={<div className={styles.headerActions}>
      <ActionLink href="/organizations/new"><PlatformIcon name="grid" size={18}/> إنشاء جهة</ActionLink>
      <ActionButton type="button" variant="secondary" disabled={isLoading} onClick={() => void loadOrganizations()}>{isLoading ? 'جارٍ التحديث…' : 'تحديث القائمة'}</ActionButton>
    </div>}/>
    <nav className={styles.actions} aria-label="روابط مساحة الأعمال"><ActionLink href="/business-profiles" variant="quiet">ملفات الأعمال</ActionLink><ActionLink href="/professional-profiles" variant="quiet">الملفات المهنية</ActionLink><ActionLink href="/categories" variant="quiet">التصنيفات</ActionLink><ActionLink href="/map" variant="quiet">الخريطة</ActionLink><ActionLink href="/search" variant="quiet">البحث</ActionLink></nav>
    {error ? <StatusMessage tone="danger"><p>{error}</p><ActionButton type="button" variant="secondary" onClick={() => void loadOrganizations()}>إعادة المحاولة</ActionButton></StatusMessage> : null}
    {isLoading ? <SkeletonGrid count={3} label="جاري تحميل المؤسسات والجهات"/> : null}
    {!isLoading && !error && organizations.length === 0 ? <EmptyState icon={<PlatformIcon name="grid" size={30}/>} title="لا توجد جهة بعد" description="أنشئ جهة عندما تحتاج إلى إدارة فريق أو ربط عدة ملفات أعمال تحت ملكية منظمة." actions={<ActionLink href="/organizations/new">إنشاء الجهة الأولى</ActionLink>}/> : null}
    {!isLoading && organizations.length > 0 ? <div className={styles.grid} aria-label="قائمة المؤسسات والجهات">
      {organizations.map((organization) => <Surface as="article" className={styles.card} key={organization.id}>
        <div className={styles.cardTop}><div><h2>{organization.name}</h2><p className={styles.meta}>{organization.memberCount.toLocaleString('ar-SY')} {organization.memberCount === 1 ? 'عضو' : 'أعضاء'}</p></div><span className={`${styles.badge} ${styles.success}`}>نشطة</span></div>
        <p className={styles.description}>إدارة معلومات الجهة وأعضاء الفريق والصلاحيات المرتبطة بها.</p>
        <div className={styles.actions}><ActionLink href={`/organizations/${organization.id}`}>إدارة الجهة</ActionLink><ActionLink href="/business-profiles" variant="secondary">ملفات الأعمال</ActionLink></div>
      </Surface>)}
    </div> : null}
  </PageShell>;
}
