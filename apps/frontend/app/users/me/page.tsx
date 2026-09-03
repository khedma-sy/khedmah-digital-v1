'use client';

import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../../lib/api-client';
import { ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon, type PlatformIconName } from '../../components/platform-icon';

type AccountAction = {
  href: string;
  label: string;
  description: string;
  icon: PlatformIconName;
};

const quickActions: AccountAction[] = [
  { href: '/business-profiles', label: 'أعمالي', description: 'إدارة أنشطتك وخدماتك المنشورة.', icon: 'briefcase' },
  { href: '/business-profiles/new', label: 'إضافة نشاط', description: 'أنشئ حضورًا جديدًا داخل دليل خدمة.', icon: 'storefront' },
  { href: '/store/sell', label: 'عرض منتج للبيع', description: 'أضف منتجًا وابدأ عرضه للعملاء.', icon: 'tag' },
];

const workspaceSections: Array<{
  title: string;
  description: string;
  icon: PlatformIconName;
  actions: AccountAction[];
}> = [
  {
    title: 'البيع والطلبات',
    description: 'تابع المنتجات والطلبات من مساحة واحدة.',
    icon: 'cart',
    actions: [
      { href: '/store/manage', label: 'منتجاتي', description: 'راجع المنتجات المعروضة وحدّثها.', icon: 'storefront' },
      { href: '/orders', label: 'طلباتي', description: 'تابع الطلبات التي أنشأتها.', icon: 'ticket' },
      { href: '/orders/merchant', label: 'طلبات المنشأة', description: 'أدر الطلبات الواردة إلى نشاطك.', icon: 'briefcase' },
    ],
  },
  {
    title: 'النقل والتوصيل',
    description: 'مسارات واضحة للعميل والمندوب والسائق.',
    icon: 'delivery',
    actions: [
      { href: '/mobility', label: 'تاكسي وتوصيل', description: 'ابدأ طلب تنقّل أو توصيل جديد.', icon: 'car' },
      { href: '/orders/courier', label: 'مهام المندوب', description: 'تابع مهام استلام وتسليم الطلبات.', icon: 'delivery' },
      { href: '/mobility/manage', label: 'طلبات السائق', description: 'راجع طلبات النقل المخصصة لك.', icon: 'car' },
    ],
  },
];

function AccountShortcut({ action, featured = false }: { action: AccountAction; featured?: boolean }) {
  return (
    <ActionLink href={action.href} variant="quiet" className={`ui-account-shortcut${featured ? ' ui-account-shortcut-featured' : ''}`}>
      <span className="ui-account-shortcut-icon"><PlatformIcon name={action.icon} size={21} /></span>
      <span className="ui-account-shortcut-copy">
        <strong>{action.label}</strong>
        <small>{action.description}</small>
      </span>
      <PlatformIcon name="arrow" size={18} />
    </ActionLink>
  );
}

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

  if (user === undefined) return <PageShell label="حسابي"><PageHeader title="حسابي" description="جاري تحميل بيانات حسابك الآمنة." /><SkeletonGrid count={3} label="جاري تحميل الحساب" /></PageShell>;

  if (!user) return <PageShell label="حسابي"><PageHeader title="حسابي" /><StatusMessage tone="warning">{error || 'انتهت الجلسة أو لم تسجل الدخول.'}</StatusMessage><ActionLink href="/auth/login">تسجيل الدخول</ActionLink></PageShell>;

  const displayName = user.profile.displayName.trim() || 'مستخدم خدمة';
  const firstName = displayName.split(/\s+/)[0];

  return (
    <PageShell label="حسابي" className="ui-account-page">
      <PageHeader
        eyebrow="مساحة حسابك"
        title={`مرحبًا، ${firstName}`}
        description="كل ما تحتاجه لإدارة نشاطك وطلباتك من مكان واحد."
        actions={<ActionLink href="/business-profiles/new"><PlatformIcon name="userPlus" size={18} />إضافة نشاط</ActionLink>}
      />

      <div className="ui-account-dashboard">
        <Surface className="ui-account-hero">
          <div className="ui-account-identity">
            <span className="ui-account-avatar" aria-hidden="true">{displayName.slice(0, 1)}</span>
            <div className="ui-account-identity-copy">
              <span className="ui-account-kicker">الحساب الشخصي</span>
              <h2>{displayName}</h2>
              <p className="ui-account-email" dir="ltr"><PlatformIcon name="mail" size={17} />{user.email}</p>
            </div>
          </div>
          <div className="ui-account-session">
            <span className="ui-account-state"><PlatformIcon name="check" size={17} />تم تسجيل الدخول بأمان</span>
            <p>بيانات الحساب مرتبطة بجلسة الدخول الحالية، ويمكنك الوصول إلى جميع مساحات عملك من هنا.</p>
          </div>
        </Surface>

        <Surface className="ui-account-quick">
          <div className="ui-account-section-heading">
            <div>
              <span className="ui-account-kicker">ابدأ من هنا</span>
              <h2>المسارات الأكثر استخدامًا</h2>
            </div>
            <p>اختر المهمة التي تريد إنجازها الآن.</p>
          </div>
          <div className="ui-account-featured-grid">
            {quickActions.map((action) => <AccountShortcut key={action.href} action={action} featured />)}
          </div>
        </Surface>

        <div className="ui-account-sections">
          {workspaceSections.map((section) => (
            <Surface className="ui-account-workspace" key={section.title}>
              <div className="ui-account-section-heading">
                <div className="ui-account-section-title">
                  <span className="ui-account-section-icon"><PlatformIcon name={section.icon} size={21} /></span>
                  <div><h2>{section.title}</h2><p>{section.description}</p></div>
                </div>
              </div>
              <div className="ui-account-action-list">
                {section.actions.map((action) => <AccountShortcut key={action.href} action={action} />)}
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
