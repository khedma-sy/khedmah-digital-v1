'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  api,
  type FulfillmentOrder,
  type MobilityRequest,
  type PublicBusinessProfile,
  type PublicUserProfile,
} from '../../../lib/api-client';
import { ActionLink, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon, type PlatformIconName } from '../../components/platform-icon';
import { PriorityServices } from '../../components/priority-services';

type ShortcutTone = 'primary' | 'success' | 'accent' | 'violet';

const merchantCategories = new Set([
  'restaurant', 'cafe', 'bakery', 'sweets', 'catering', 'juice_icecream',
  'butcher', 'grocery', 'fruits_vegetables', 'fish_poultry_shop', 'pharmacy',
]);
const closedOrderStatuses = new Set<FulfillmentOrder['status']>(['delivered', 'rejected', 'cancelled']);
const closedMobilityStatuses = new Set<MobilityRequest['status']>(['completed', 'rejected', 'cancelled']);
const orderStatusLabel: Record<FulfillmentOrder['status'], string> = {
  placed: 'وصل الطلب إلى المنشأة', quoted: 'تم تحديد السعر', merchant_confirmed: 'أكدت المنشأة الطلب',
  courier_assigned: 'تم تعيين المندوب', courier_accepted: 'قبل المندوب المهمة', ready_for_pickup: 'الطلب جاهز للاستلام',
  picked_up: 'الطلب في الطريق', delivered: 'تم التسليم', rejected: 'رُفض الطلب', cancelled: 'أُلغي الطلب',
};
const mobilityStatusLabel: Record<MobilityRequest['status'], string> = {
  requested: 'بانتظار قبول المزود', accepted: 'تم قبول الطلب', en_route: 'المزود في الطريق', arrived: 'وصل المزود',
  in_progress: 'الخدمة جارية الآن', completed: 'اكتملت الخدمة', rejected: 'رُفض الطلب', cancelled: 'أُلغي الطلب',
};

function AccountShortcut({
  href,
  label,
  description,
  icon,
  tone = 'primary',
  badge,
}: {
  href: string;
  label: string;
  description: string;
  icon: PlatformIconName;
  tone?: ShortcutTone;
  badge?: number;
}) {
  return (
    <ActionLink href={href} variant="quiet" className={`ui-account-shortcut ui-account-shortcut-${tone}`}>
      <span className="ui-account-shortcut-icon"><PlatformIcon name={icon} size={21} /></span>
      <span className="ui-account-shortcut-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      {badge ? <span className="ui-account-shortcut-badge" aria-label={`${badge.toLocaleString('ar-SY')} عناصر نشطة`}>{badge.toLocaleString('ar-SY')}</span> : null}
      <PlatformIcon name="arrow" size={18} />
    </ActionLink>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [mobilityRequests, setMobilityRequests] = useState<MobilityRequest[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.auth.session()
      .then(async ({ user: currentUser }) => {
        if (!active) return;
        setUser(currentUser);
        const [owned, customerOrders, customerMobility] = await Promise.allSettled([
          api.businesses.listMine(),
          api.orders.mine(),
          api.mobility.listMine(),
        ]);
        if (!active) return;
        if (owned.status === 'fulfilled') setBusinesses(owned.value.businesses);
        if (customerOrders.status === 'fulfilled') setOrders(customerOrders.value.orders);
        if (customerMobility.status === 'fulfilled') setMobilityRequests(customerMobility.value.requests);
      })
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
  const merchantBusiness = businesses.find((business) => merchantCategories.has(business.categoryCode));
  const courierBusiness = businesses.find((business) => business.categoryCode === 'delivery_courier');
  const taxiBusiness = businesses.find((business) => business.categoryCode === 'taxi');
  const pendingBusinesses = businesses.filter((business) => business.moderationStatus === 'pending').length;
  const activeOrders = orders.filter((order) => !closedOrderStatuses.has(order.status));
  const activeMobility = mobilityRequests.filter((request) => !closedMobilityStatuses.has(request.status));
  const currentOrder = [...activeOrders].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const currentMobility = [...activeMobility].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const latestIsMobility = currentMobility && (!currentOrder || Date.parse(currentMobility.updatedAt) >= Date.parse(currentOrder.updatedAt));
  const activeCount = activeOrders.length + activeMobility.length;
  const roleLabels = businesses.length
    ? [merchantBusiness ? 'صاحب منشأة' : 'صاحب نشاط', courierBusiness ? 'مندوب توصيل' : '', taxiBusiness ? 'سائق تكسي' : ''].filter(Boolean)
    : ['مستخدم'];
  return (
    <PageShell label="حسابي" className="ui-account-page">
      <PageHeader
        eyebrow="مساحة حسابك"
        title={<>مرحبًا، <bdi>{firstName}</bdi></>}
        description="كل ما تحتاجه لإدارة نشاطك وطلباتك من مكان واحد."
      />

      <div className="ui-account-dashboard">
        <PriorityServices />

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
            <div className="ui-account-roles" aria-label="أدوار الحساب">
              <small>دور الحساب</small>
              <div>{roleLabels.map((role) => <span key={role}>{role}</span>)}</div>
            </div>
          </div>
        </Surface>

        {activeCount > 0 ? (
          <Surface className="ui-account-active" aria-labelledby="active-service-title">
            <span className="ui-account-active-icon"><PlatformIcon name={latestIsMobility ? 'car' : 'delivery'} size={24} /></span>
            <div className="ui-account-active-copy">
              <span className="ui-account-kicker">نشاط جارٍ الآن</span>
              <h2 id="active-service-title">{latestIsMobility ? (currentMobility.serviceType === 'taxi' ? 'رحلة تكسي قيد المتابعة' : 'طلب توصيل قيد المتابعة') : 'طلب طعام قيد المتابعة'}</h2>
              <p>{latestIsMobility ? mobilityStatusLabel[currentMobility.status] : orderStatusLabel[currentOrder.status]}</p>
            </div>
            {activeCount > 1 ? <span className="ui-account-active-count">{activeCount.toLocaleString('ar-SY')} عمليات نشطة</span> : null}
            <ActionLink href={latestIsMobility ? '/mobility?type=taxi' : '/orders'}>متابعة الآن</ActionLink>
          </Surface>
        ) : null}

        <div className="ui-account-sections">
          <Surface className="ui-account-workspace">
            <div className="ui-account-section-heading">
              <div className="ui-account-section-title">
                <span className="ui-account-section-icon ui-account-section-icon-service"><PlatformIcon name="delivery" size={21} /></span>
                <div><h2>طلباتي ومهامي</h2><p>طلباتك أولًا، ثم مهام المندوب أو السائق عند اعتماد دورك.</p></div>
              </div>
            </div>
            <div className="ui-account-action-list">
              <AccountShortcut href="/orders" label="طلباتي" description="تابع طلبات الطعام والتوصيل التي أنشأتها." icon="ticket" badge={activeOrders.length} />
              {courierBusiness ? <AccountShortcut href="/orders/courier" label="مهام المندوب" description={courierBusiness.moderationStatus === 'approved' ? 'استقبل مهام التوصيل وتابع التسليم.' : 'دور المندوب بانتظار اعتماد المنصة.'} icon="delivery" tone="success" /> : null}
              {taxiBusiness ? <AccountShortcut href="/mobility/manage" label="طلبات السائق" description={taxiBusiness.moderationStatus === 'approved' ? 'استقبل رحلات التكسي وأدر العداد.' : 'دور السائق بانتظار اعتماد المنصة.'} icon="car" tone="primary" /> : null}
            </div>
          </Surface>

          <Surface className="ui-account-workspace">
            <div className="ui-account-section-heading">
              <div className="ui-account-section-title">
                <span className="ui-account-section-icon ui-account-section-icon-business"><PlatformIcon name="briefcase" size={21} /></span>
                <div><h2>{businesses.length ? 'إدارة نشاطك' : 'ابدأ نشاطك على خدمة'}</h2><p>{businesses.length ? `${businesses.length.toLocaleString('ar-SY')} من أنشطتك مرتبطة بهذا الحساب.` : 'ملف واحد يفتح لك أدوات الإدارة والبيع المناسبة.'}</p></div>
              </div>
              {businesses.length ? <ActionLink href="/business-profiles/new" variant="secondary"><PlatformIcon name="userPlus" size={17} />إضافة نشاط</ActionLink> : null}
            </div>
            {businesses.length ? (
              <div className="ui-account-action-list">
                <AccountShortcut href="/business-profiles" label="أعمالي" description="إدارة أنشطتك وخدماتك المنشورة." icon="briefcase" badge={pendingBusinesses} />
                {merchantBusiness ? <AccountShortcut href="/orders/merchant" label="طلبات المنشأة" description="استقبل الطلبات وأدر تجهيزها وتسليمها." icon="food" tone="accent" /> : null}
                <AccountShortcut href="/store/manage" label="المتجر والإعلانات" description="راجع منتجاتك وإعلاناتك المنشورة." icon="storefront" tone="success" />
                <AccountShortcut href="/store/sell" label="إضافة إعلان" description="انشر منتجًا مرتبطًا بنشاطك." icon="tag" tone="violet" />
              </div>
            ) : (
              <div className="ui-account-role-empty ui-account-role-empty-provider">
                <PlatformIcon name="storefront" size={24} />
                <div><strong>هل تقدم خدمة أو تدير نشاطًا؟</strong><p>أنشئ ملف نشاط واحدًا، وحدد إن كنت منشأة أو مندوبًا أو سائقًا.</p></div>
                <ActionLink href="/business-profiles/new">إنشاء نشاط</ActionLink>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </PageShell>
  );
}
