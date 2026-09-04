'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../../lib/api-client';
import { ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon, type PlatformIconName } from '../../components/platform-icon';
import { PriorityServices } from '../../components/priority-services';
import { WhatsappIcon } from '../../components/whatsapp-icon';
import { KHEDMAH_WHATSAPP_CHANNEL_URL, officialWhatsappContactUrl } from '../../../lib/official-links';

function AccountShortcut({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: PlatformIconName;
}) {
  return (
    <ActionLink href={href} variant="quiet" className="ui-account-shortcut">
      <span className="ui-account-shortcut-icon"><PlatformIcon name={icon} size={21} /></span>
      <span className="ui-account-shortcut-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <PlatformIcon name="arrow" size={18} />
    </ActionLink>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.auth.session()
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch((reason) => {
        if (!active) return;
        if ((reason as { statusCode?: number }).statusCode === 401) {
          router.replace('/auth/login?next=%2Fusers%2Fme&reason=session-expired');
          return;
        }
        setUser(null);
        setError(reason instanceof Error ? reason.message : 'تعذر تحميل الحساب.');
      });
    return () => { active = false; };
  }, [router]);

  if (user === undefined) return <PageShell label="حسابي"><PageHeader title="حسابي" description="جاري تحميل بيانات حسابك الآمنة." /><SkeletonGrid count={3} label="جاري تحميل الحساب" /></PageShell>;

  if (!user) return <PageShell label="حسابي"><PageHeader title="حسابي" /><StatusMessage tone="warning">{error || 'انتهت الجلسة أو لم تسجل الدخول.'}</StatusMessage><ActionLink href="/auth/login">تسجيل الدخول</ActionLink></PageShell>;

  const displayName = user.profile.displayName.trim() || 'مستخدم خدمة';
  const firstName = displayName.split(/\s+/)[0];
  const whatsappContactUrl = officialWhatsappContactUrl() ?? KHEDMAH_WHATSAPP_CHANNEL_URL;
  return (
    <PageShell label="حسابي" className="ui-account-page">
      <PageHeader
        eyebrow="مساحة حسابك"
        title={<>مرحبًا، <bdi>{firstName}</bdi></>}
        description="كل ما تحتاجه لإدارة نشاطك وطلباتك من مكان واحد."
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
            <a className="ui-account-contact" href={whatsappContactUrl} target="_blank" rel="noopener noreferrer"><WhatsappIcon size={19} />التواصل مع خدمة</a>
          </div>
        </Surface>

        <PriorityServices />

        <div className="ui-account-sections">
          <Surface className="ui-account-workspace">
            <div className="ui-account-section-heading">
              <div className="ui-account-section-title">
                <span className="ui-account-section-icon"><PlatformIcon name="cart" size={21} /></span>
                <div><h2>إدارة نشاطك</h2><p>الأدوات الخاصة بالنشر والبيع وإدارة الطلبات.</p></div>
              </div>
            </div>
            <div className="ui-account-action-list">
              <AccountShortcut href="/business-profiles" label="أعمالي" description="إدارة أنشطتك وخدماتك المنشورة." icon="briefcase" />
              <AccountShortcut href="/business-profiles/new" label="إضافة نشاط" description="أنشئ ملف نشاط جديدًا." icon="userPlus" />
              <AccountShortcut href="/store/manage" label="منتجاتي" description="راجع المنتجات المعروضة وحدّثها." icon="storefront" />
              <AccountShortcut href="/orders/merchant" label="طلبات المنشأة" description="أدر الطلبات الواردة إلى نشاطك." icon="briefcase" />
            </div>
          </Surface>

          <Surface className="ui-account-workspace">
            <div className="ui-account-section-heading">
              <div className="ui-account-section-title">
                <span className="ui-account-section-icon"><PlatformIcon name="delivery" size={21} /></span>
                <div><h2>متابعة الطلبات والعمل</h2><p>سجل واحد للعميل والمندوب والسائق.</p></div>
              </div>
            </div>
            <div className="ui-account-action-list">
              <AccountShortcut href="/orders" label="طلباتي" description="تابع الطلبات التي أنشأتها." icon="ticket" />
              <AccountShortcut href="/orders/courier" label="مهام المندوب" description="تابع مهام استلام وتسليم الطلبات." icon="delivery" />
              <AccountShortcut href="/mobility/manage" label="طلبات السائق" description="راجع طلبات النقل المخصصة لك." icon="car" />
              <AccountShortcut href="/store/sell" label="إضافة إعلان" description="انشر منتجًا مرتبطًا بنشاطك." icon="tag" />
            </div>
          </Surface>
        </div>
      </div>
    </PageShell>
  );
}
