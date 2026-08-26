'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type PublicOrganization, type PublicOrganizationMember } from '../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from '../../../components/owner-workspace.module.css';

const roleLabels: Record<PublicOrganizationMember['role'], string> = { owner: 'مالك', member: 'عضو' };

export default function OrganizationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [organization, setOrganization] = useState<PublicOrganization | null>(null);
  const [members, setMembers] = useState<PublicOrganizationMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [name, setName] = useState('');
  const [newMemberId, setNewMemberId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [{ organization: details }, { members: organizationMembers }, { user }] = await Promise.all([
        api.organizations.get(id), api.organizations.listMembers(id), api.auth.session()
      ]);
      setOrganization(details);
      setMembers(organizationMembers);
      setCurrentUserId(user.id);
      setName(details.name);
    } catch (cause) {
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) { router.replace('/auth/login'); return; }
      setError(status === 403 ? 'لا تملك صلاحية الوصول إلى هذه الجهة.' : cause instanceof Error ? cause.message : 'تعذر تحميل بيانات الجهة.');
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => { void load(); }, [load]);
  const isOwner = organization?.ownerUserId === currentUserId;

  async function saveOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setError(''); setSuccess('');
    try {
      const result = await api.organizations.update(id, name.trim());
      setOrganization(result.organization);
      setSuccess('تم حفظ اسم الجهة بنجاح.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ بيانات الجهة.');
    } finally { setIsSaving(false); }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true); setError(''); setSuccess('');
    try {
      const { member } = await api.organizations.addMember(id, newMemberId.trim(), 'member');
      setMembers((current) => [...current.filter((item) => item.id !== member.id), member]);
      setNewMemberId('');
      setSuccess('تمت إضافة العضو إلى الجهة.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إضافة العضو.');
    } finally { setIsSaving(false); }
  }

  async function removeMember(member: PublicOrganizationMember) {
    if (!window.confirm('هل تريد إزالة هذا العضو من الجهة؟')) return;
    setIsSaving(true); setError(''); setSuccess('');
    try {
      await api.organizations.removeMember(id, member.id);
      setMembers((current) => current.filter((item) => item.id !== member.id));
      setSuccess('تمت إزالة العضو من الجهة.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إزالة العضو.');
    } finally { setIsSaving(false); }
  }

  return <PageShell className={styles.page} label="إدارة الجهة">
    <PageHeader eyebrow="المؤسسات والجهات" title={organization?.name ?? 'إدارة الجهة'} description="حدّث الاسم وأدر أعضاء الفريق ضمن صلاحيات واضحة." backHref="/organizations" actions={<ActionLink href="/business-profiles" variant="secondary">ملفات الأعمال</ActionLink>}/>
    {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
    {success ? <StatusMessage tone="success">{success}</StatusMessage> : null}
    {isLoading ? <SkeletonGrid count={2} label="جاري تحميل بيانات الجهة"/> : null}
    {!isLoading && organization ? <div className={styles.formLayout}>
      <div className={styles.stack}>
        <Surface as="form" className={styles.form} onSubmit={saveOrganization}>
          <section className={styles.section}><h2>معلومات الجهة</h2><label>اسم المؤسسة أو الجهة<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required disabled={!isOwner}/></label>{!isOwner ? <p className={styles.notice}>يمكن للمالك فقط تعديل معلومات الجهة.</p> : null}</section>
          {isOwner ? <footer className={styles.footer}><span className={styles.help}>يظهر الاسم لأعضاء الجهة وفي مساحات الإدارة فقط.</span><ActionButton type="submit" disabled={isSaving || name.trim().length < 2}>{isSaving ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}</ActionButton></footer> : null}
        </Surface>
        <Surface className={styles.form}>
          <section className={styles.section}><div className={styles.cardTop}><div><h2>أعضاء الجهة</h2><p>{members.length.toLocaleString('ar-SY')} عضو نشط</p></div><span className={`${styles.badge} ${styles.muted}`}>صلاحيات داخلية</span></div>
            {members.length === 0 ? <EmptyState title="لا يوجد أعضاء" description="لم تُسجّل عضويات نشطة لهذه الجهة."/> : <div className={styles.memberList}>{members.map((member) => <div className={styles.memberRow} key={member.id}><div><strong>{member.userId === currentUserId ? 'أنت' : 'عضو الفريق'}</strong><span dir="ltr">{member.userId}</span></div><div className={styles.actions}><span className={`${styles.badge} ${member.role === 'owner' ? styles.success : styles.muted}`}>{roleLabels[member.role]}</span>{isOwner && member.role !== 'owner' ? <ActionButton type="button" variant="danger" disabled={isSaving} onClick={() => void removeMember(member)}>إزالة</ActionButton> : null}</div></div>)}</div>}
          </section>
        </Surface>
      </div>
      <Surface as="aside" className={styles.guide}>
        <h2>إضافة عضو</h2>
        {isOwner ? <form className={styles.section} onSubmit={addMember}><p>أدخل معرّف مستخدم مسجل في «خدمة». لا يمكن منح عضوية لحساب غير موجود.</p><label>معرّف المستخدم<input value={newMemberId} onChange={(event) => setNewMemberId(event.target.value)} required minLength={1} dir="ltr" placeholder="user-id"/></label><ActionButton type="submit" disabled={isSaving || !newMemberId.trim()}>إضافة إلى الفريق</ActionButton></form> : <p className={styles.notice}>إدارة العضويات متاحة لمالك الجهة فقط.</p>}
        <p className={styles.notice}>الجهة ليست نشاطاً عاماً. أنشئ ملف نشاط منفصلاً وأرسله للمراجعة حتى يظهر في الدليل.</p>
      </Surface>
    </div> : null}
    {!isLoading && !organization && !error ? <EmptyState icon={<PlatformIcon name="grid" size={30}/>} title="الجهة غير متاحة" description="قد تكون حُذفت أو لا تملك عضوية نشطة فيها." actions={<ActionLink href="/organizations">العودة إلى الجهات</ActionLink>}/> : null}
  </PageShell>;
}
