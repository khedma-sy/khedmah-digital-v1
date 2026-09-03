'use client';

import { useEffect, useState } from 'react';
import { api, PublicUserProfile } from '../../../lib/api-client';
import { ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon, type PlatformIconName } from '../../components/platform-icon';
import { WhatsappIcon } from '../../components/whatsapp-icon';
import { SocialProviderIcon } from '../../auth/social-provider-icon';
import { KHEDMAH_FACEBOOK_URL, KHEDMAH_WHATSAPP_CHANNEL_URL, officialWhatsappContactUrl } from '../../../lib/official-links';

function AccountShortcut({
  href,
  label,
  description,
  icon,
  featured = false,
}: {
  href: string;
  label: string;
  description: string;
  icon: PlatformIconName;
  featured?: boolean;
}) {
  return (
    <ActionLink href={href} variant="quiet" className={`ui-account-shortcut${featured ? ' ui-account-shortcut-featured' : ''}`}>
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
  const whatsappContactUrl = officialWhatsappContactUrl();

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
            <AccountShortcut href="/business-profiles" label="أعمالي" description="إدارة أنشطتك وخدماتك المنشورة." icon="briefcase" featured />
            <AccountShortcut href="/business-profiles/new" label="إضافة نشاط" description="أنشئ حضورًا جديدًا داخل دليل خدمة." icon="storefront" featured />
            <AccountShortcut href="/store/sell" label="عرض منتج للبيع" description="أضف منتجًا وابدأ عرضه للعملاء." icon="tag" featured />
          </div>
        </Surface>

        <div className="ui-account-sections">
          <Surface className="ui-account-workspace">
            <div className="ui-account-section-heading">
              <div className="ui-account-section-title">
                <span className="ui-account-section-icon"><PlatformIcon name="cart" size={21} /></span>
                <div><h2>البيع والطلبات</h2><p>تابع المنتجات والطلبات من مساحة واحدة.</p></div>
              </div>
            </div>
            <div className="ui-account-action-list">
              <AccountShortcut href="/store/manage" label="منتجاتي" description="راجع المنتجات المعروضة وحدّثها." icon="storefront" />
              <AccountShortcut href="/orders" label="طلباتي" description="تابع الطلبات التي أنشأتها." icon="ticket" />
              <AccountShortcut href="/orders/merchant" label="طلبات المنشأة" description="أدر الطلبات الواردة إلى نشاطك." icon="briefcase" />
            </div>
          </Surface>

          <Surface className="ui-account-workspace">
            <div className="ui-account-section-heading">
              <div className="ui-account-section-title">
                <span className="ui-account-section-icon"><PlatformIcon name="delivery" size={21} /></span>
                <div><h2>النقل والتوصيل</h2><p>مسارات واضحة للعميل والمندوب والسائق.</p></div>
              </div>
            </div>
            <div className="ui-account-action-list">
              <AccountShortcut href="/mobility" label="تاكسي وتوصيل" description="ابدأ طلب تنقّل أو توصيل جديد." icon="car" />
              <AccountShortcut href="/orders/courier" label="مهام المندوب" description="تابع مهام استلام وتسليم الطلبات." icon="delivery" />
              <AccountShortcut href="/mobility/manage" label="طلبات السائق" description="راجع طلبات النقل المخصصة لك." icon="car" />
            </div>
          </Surface>
        </div>

        <Surface as="aside" className="ui-account-social">
          <span className="ui-account-social-mark" aria-hidden="true">خ</span>
          <div className="ui-account-social-copy">
            <span className="ui-account-kicker">قنوات خدمة الرسمية</span>
            <h2>تابع وتواصل مع خدمة</h2>
            <p>اختر قناة المتابعة للأخبار والعروض، أو التواصل المباشر للاستفسار وإضافة نشاطك.</p>
          </div>
          <div className="ui-account-social-actions"><a className="ui-action ui-action-secondary ui-account-social-action" href={KHEDMAH_FACEBOOK_URL} target="_blank" rel="noopener noreferrer"><SocialProviderIcon provider="facebook"/>Facebook <bdi>khedma.uk</bdi><PlatformIcon name="arrow" size={18}/></a><a className="ui-action ui-action-secondary ui-account-social-action" href={KHEDMAH_WHATSAPP_CHANNEL_URL} target="_blank" rel="noopener noreferrer"><WhatsappIcon/>متابعة قناة واتساب</a>{whatsappContactUrl?<a className="ui-action ui-action-secondary ui-account-social-action" href={whatsappContactUrl} target="_blank" rel="noopener noreferrer"><WhatsappIcon/>الاتصال عبر واتساب</a>:<span className="ui-account-social-unavailable" aria-disabled="true"><WhatsappIcon/>رابط الاتصال قيد التحقق</span>}</div>
        </Surface>
      </div>
    </PageShell>
  );
}
