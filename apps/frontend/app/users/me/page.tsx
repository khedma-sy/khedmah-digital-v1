'use client';

import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../../lib/api-client';
import { ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';

export default function ProfilePage() {
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.auth.session()
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch((reason) => { if (active) { setUser(null); setError(reason instanceof Error ? reason.message : 'تعذر تحميل الحساب.'); } });
    return () => { active = false; };
  }, []);

  if (user === undefined) return <PageShell label="حسابي"><PageHeader title="حسابي" description="جاري تحميل بيانات حسابك الآمنة." /><SkeletonGrid count={2} label="جاري تحميل الحساب" /></PageShell>;

  if (!user) return <PageShell label="حسابي"><PageHeader title="حسابي" /><StatusMessage tone="warning">{error || 'انتهت الجلسة أو لم تسجل الدخول.'}</StatusMessage><ActionLink href="/auth/login">تسجيل الدخول</ActionLink></PageShell>;

  return <PageShell label="حسابي">
    <PageHeader title="حسابي" description="بيانات الحساب المرتبطة بجلسة تسجيل الدخول الحالية." actions={<ActionLink href="/business-profiles/new">إضافة نشاط</ActionLink>} />
    <div className="ui-account-grid">
      <Surface className="ui-account-profile">
        <span className="ui-account-avatar" aria-hidden="true">{user.profile.displayName.trim().slice(0, 1) || 'خ'}</span>
        <div><p className="ui-account-label">الاسم الظاهر</p><h2>{user.profile.displayName}</h2></div>
        <div><p className="ui-account-label">البريد الإلكتروني</p><p dir="ltr">{user.email}</p></div>
      </Surface>
      <Surface className="ui-account-links">
        <h2>إدارة حضورك في خدمة</h2>
        <p>حدّث أنشطتك وخدماتك من مساحة أعمال واحدة مرتبطة بحسابك.</p>
        <div className="ui-page-actions"><ActionLink href="/business-profiles">أعمالي</ActionLink><ActionLink href="/business-profiles/new" variant="secondary">إضافة نشاط</ActionLink></div>
      </Surface>
    </div>
  </PageShell>;
}
