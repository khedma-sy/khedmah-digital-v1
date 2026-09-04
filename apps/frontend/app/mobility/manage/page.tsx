'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type MobilityFarePolicy, type MobilityRequest, type PublicBusinessProfile } from '../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import { playOrderRing, requestOrderNotifications, showOrderNotification } from '../../orders/order-alerts';
import styles from './provider-mobility.module.css';

const labels: Record<MobilityRequest['status'], string> = { requested: 'طلب جديد', accepted: 'مقبول', en_route: 'في الطريق', arrived:'وصلت للعميل', in_progress:'الرحلة جارية', completed: 'مكتمل', rejected: 'مرفوض', cancelled: 'ملغي' };

export default function ProviderMobilityPage() {
  const router = useRouter();
  const [businesses, setBusinesses] = useState<PublicBusinessProfile[]>([]);
  const [selected, setSelected] = useState('');
  const [requests, setRequests] = useState<MobilityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [farePolicy,setFarePolicy]=useState<MobilityFarePolicy>();
  const [alertsEnabled,setAlertsEnabled]=useState(false);
  const knownRequestedIds=useRef<Set<string>>(new Set());
  const loadedOnce=useRef(false);

  useEffect(() => {
    setAlertsEnabled(localStorage.getItem('khedmah-mobility-alerts') === 'enabled');
    void api.businesses.listMine().then(({ businesses: all }) => {
      const mobility = all.filter((item) => item.categoryCode === 'taxi' || item.categoryCode === 'delivery_courier');
      setBusinesses(mobility); setSelected(mobility[0]?.id ?? '');
    }).catch((cause) => {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) router.replace('/auth/login?next=%2Fmobility%2Fmanage');
      else setError('تعذر تحميل أنشطة النقل الخاصة بك.');
    }).finally(() => setLoading(false));
  }, [router]);

  const loadRequests=useCallback(async(silent=false)=>{if(!selected)return;if(!silent)setLoading(true);try{const {requests:items}=await api.mobility.listForProvider(selected);const fresh=items.filter(item=>item.status==='requested'&&!knownRequestedIds.current.has(item.id));if(loadedOnce.current&&fresh.length&&alertsEnabled){playOrderRing();showOrderNotification('طلب جديد على خدمة',fresh[0].serviceType==='taxi'?'هناك طلب رحلة تكسي جديد':'هناك طلب مندوب توصيل جديد',`mobility-${fresh[0].id}`);}knownRequestedIds.current=new Set(items.filter(item=>item.status==='requested').map(item=>item.id));loadedOnce.current=true;setRequests(items);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'تعذر تحميل الطلبات.');}finally{if(!silent)setLoading(false);}},[alertsEnabled,selected]);

  useEffect(() => { if(!selected){setRequests([]);return;}loadedOnce.current=false;void loadRequests();const interval=window.setInterval(()=>void loadRequests(true),8000);const business=businesses.find(item=>item.id===selected);const serviceType=business?.categoryCode==='delivery_courier'?'delivery':'taxi';void api.mobility.farePolicy(serviceType).then(({policy})=>setFarePolicy(policy)).catch(()=>setFarePolicy(undefined));return()=>window.clearInterval(interval); }, [businesses,loadRequests,selected]);

  async function enableAlerts(){setAlertsEnabled(true);localStorage.setItem('khedmah-mobility-alerts','enabled');playOrderRing();await requestOrderNotifications();}

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
    <PageHeader eyebrow="مساحة السائق والمندوب" title="طلبات التنقل والتوصيل" description="رحلة واحدة واضحة: قبول، وصول، بدء العداد، ثم سعر نهائي تحسبه خدمة." backHref="/mobility" actions={<ActionLink href="/business-profiles/new">تسجيل مزود جديد</ActionLink>}/>
    {error && <StatusMessage tone="danger">{error}</StatusMessage>}
    {!businesses.length ? <EmptyState icon={<PlatformIcon name="car" size={34}/>} title="لا تملك نشاط تكسي أو توصيل" description="سجّل نشاطًا في تصنيف تكسي أو مندوب توصيل، ثم أرسله للتوثيق والاعتماد." actions={<ActionLink href="/business-profiles/new">تسجيل نشاط نقل</ActionLink>}/> : <>
      <Surface className={styles.selector}><label>النشاط<select value={selected} onChange={(event) => setSelected(event.target.value)}>{businesses.map((business) => <option value={business.id} key={business.id}>{business.name}</option>)}</select></label><div className={styles.alertControl}><span>{farePolicy?.enabled?'التعرفة معتمدة من خدمة':'التعرفة بانتظار اعتماد الأدمن'}</span><ActionButton type="button" variant="secondary" onClick={()=>void enableAlerts()}>{alertsEnabled?'تنبيه الطلبات مفعّل':'فعّل صوت الطلبات'}</ActionButton></div></Surface>
      {loading ? <SkeletonGrid count={3}/> : requests.length ? <section className={styles.grid}>{requests.map((request) => <Surface as="article" className={styles.card} key={request.id}>
        <div className={styles.heading}><span>{labels[request.status]}</span><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString('ar-SY-u-nu-latn')}</time></div>
        <h2>{request.serviceType === 'taxi' ? 'رحلة تكسي' : 'طلب توصيل'}</h2><p><strong>من:</strong> {request.pickupAddress}</p><p><strong>إلى:</strong> {request.destinationAddress}</p>{request.riderContactPhone&&<a href={`tel:${request.riderContactPhone}`} dir="ltr">{request.riderContactPhone}</a>}{request.status==='in_progress'&&<p className={styles.meter}>العداد يعمل؛ تحسب خدمة المسافة والسعر من الخادم عند الإنهاء.</p>}{request.fareStatus==='finalized'&&request.finalFare!==undefined&&<p className={styles.fare}>سعر خدمة النهائي: {request.finalFare.toLocaleString('ar-SY-u-nu-latn')} ل.س.</p>}
        <div className={styles.actions}>{request.status === 'requested' && <><ActionButton disabled={working === request.id} onClick={() => void transition(request, 'accepted')}>قبول</ActionButton><ActionButton variant="secondary" disabled={working === request.id} onClick={() => void transition(request, 'rejected')}>رفض</ActionButton></>}{request.status === 'accepted' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'en_route')}>انطلقت للعميل</ActionButton>}{request.status === 'en_route' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'arrived')}>وصلت إلى العميل</ActionButton>}{request.status === 'arrived' && <ActionButton disabled={working === request.id||!farePolicy?.enabled} onClick={() => void transition(request, 'in_progress')}>{farePolicy?.enabled?'ابدأ الرحلة والعداد':'التعرفة غير مفعّلة'}</ActionButton>}{request.status === 'in_progress' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'completed')}>إنهاء وإصدار السعر</ActionButton>}</div>
      </Surface>)}</section> : <EmptyState icon={<PlatformIcon name="car" size={34}/>} title="لا توجد طلبات بعد" description="ستظهر هنا الطلبات الحقيقية المرسلة إلى هذا النشاط."/>}
    </>}
  </PageShell>;
}
