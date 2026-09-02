'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type MobilityRequest, type PublicBusinessProfile } from '../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from './provider-mobility.module.css';

const labels: Record<MobilityRequest['status'], string> = { requested: 'طلب جديد', accepted: 'مقبول', en_route: 'في الطريق', completed: 'مكتمل', rejected: 'مرفوض', cancelled: 'ملغي' };

export default function ProviderMobilityPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected, setSelected] = useState('');
  const [requests, setRequests] = useState<MobilityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.businesses.listMine().then(({ businesses: all }) => {
      const mobility = all.filter((item) => item.categoryCode === 'taxi' || item.categoryCode === 'delivery_courier');
      setBusinesses(mobility); setSelected(mobility[0]?.id ?? '');
    }).catch((cause) => {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) router.replace('/auth/login?next=%2Fmobility%2Fmanage');
      else setError('تعذر تحميل أنشطة النقل الخاصة بك.');
    }).finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!selected) { setRequests([]); return; }
    setLoading(true); setError('');
    void api.mobility.listForProvider(selected).then(({ requests: items }) => setRequests(items)).catch((cause) => setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.')).finally(() => setLoading(false));
  }, [selected]);

  async function transition(request: MobilityRequest, status: MobilityRequest['status']) {
    const reason = status === 'rejected' ? window.prompt('اكتب سبب الرفض للعميل:')?.trim() : undefined;
    if (status === 'rejected' && !reason) return;
    setWorking(request.id); setError('');
    try { const result = await api.mobility.transition(request.id, status, reason); setRequests((items) => items.map((item) => item.id === request.id ? result.request : item)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تحديث حالة الطلب.'); }
    finally { setWorking(''); }
  }

  if (loading && !businesses.length) return <PageShell label="طلبات التكسي"><SkeletonGrid count={3}/></PageShell>;
  return <PageShell className={styles.page} label="إدارة طلبات التكسي">
    <PageHeader eyebrow="مساحة السائق والمندوب" title="طلبات التنقل والتوصيل" description="اقبل الطلب ثم حدّث حالته بصدق. لا تبدأ أي رحلة قبل الاتفاق المباشر مع العميل." backHref="/mobility" actions={<ActionLink href="/business-profiles/new">تسجيل مزود جديد</ActionLink>}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {!businesses.length ? <EmptyState icon={<PlatformIcon name="car" size={34}/>} title="لا تملك نشاط تكسي أو توصيل" description="سجّل نشاطًا في تصنيف تكسي أو مندوب توصيل، ثم أرسله للتوثيق والاعتماد." actions={<ActionLink href="/business-profiles/new">تسجيل نشاط نقل</ActionLink>}/> : <>
      <Surface className={styles.selector}><label>النشاط<select value={selected} onChange={(event) => setSelected(event.target.value)}>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label><span>الاستخدام مجاني خلال المرحلة التجريبية</span></Surface>
      {loading ? <SkeletonGrid count={3}/> : requests.length ? <section className={styles.grid}>{requests.map((request) => <Surface as="article" className={styles.card} key={request.id}>
        <div className={styles.heading}><span>{labels[request.status]}</span><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString('ar-SY')}</time></div>
        <h2>{request.serviceType === 'taxi' ? 'رحلة تكسي' : 'طلب توصيل'}</h2><p><strong>من:</strong> {request.pickupAddress}</p><p><strong>إلى:</strong> {request.destinationAddress}</p><a href={`tel:${request.riderContactPhone}`} dir="ltr">{request.riderContactPhone}</a>
        <div className={styles.actions}>{request.status === 'requested' && <><ActionButton disabled={working === request.id} onClick={() => void transition(request, 'accepted')}>قبول الطلب</ActionButton><ActionButton variant="secondary" disabled={working === request.id} onClick={() => void transition(request, 'rejected')}>رفض مع سبب</ActionButton></>}{request.status === 'accepted' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'en_route')}>أنا في الطريق</ActionButton>}{request.status === 'en_route' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'completed')}>إكمال الرحلة</ActionButton>}</div>
      </Surface>)}</section> : <EmptyState icon={<PlatformIcon name="car" size={34}/>} title="لا توجد طلبات بعد" description="ستظهر هنا الطلبات الحقيقية المرسلة إلى هذا النشاط."/>}
    </>}
  </PageShell>;
}
