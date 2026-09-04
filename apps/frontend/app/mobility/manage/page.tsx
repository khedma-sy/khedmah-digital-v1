'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type MobilityFarePolicy, type MobilityRequest, type PublicBusinessProfile } from '../../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../../components/ui-primitives';
import { PlatformIcon } from '../../components/platform-icon';
import styles from './provider-mobility.module.css';

const labels: Record<MobilityRequest['status'], string> = { requested: 'طلب جديد', accepted: 'مقبول', en_route: 'في الطريق', arrived:'وصلت للعميل', in_progress:'الرحلة جارية', completed: 'مكتمل', rejected: 'مرفوض', cancelled: 'ملغي' };
const radians = (value:number) => value * Math.PI / 180;
const distanceBetween = (a:GeolocationCoordinates,b:GeolocationCoordinates) => { const earth=6371000,dLat=radians(b.latitude-a.latitude),dLng=radians(b.longitude-a.longitude),x=Math.sin(dLat/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dLng/2)**2;return 2*earth*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); };

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
  const [trackedMeters,setTrackedMeters]=useState(0);
  const knownRequestedIds=useRef<Set<string>>(new Set());
  const loadedOnce=useRef(false);
  const watchId=useRef<number|undefined>(undefined);
  const trackingRequestId=useRef('');
  const lastPosition=useRef<GeolocationCoordinates|undefined>(undefined);

  useEffect(() => {
    void api.businesses.listMine().then(({ businesses: all }) => {
      const mobility = all.filter((item) => item.categoryCode === 'taxi' || item.categoryCode === 'delivery_courier');
      setBusinesses(mobility); setSelected(mobility[0]?.id ?? '');
    }).catch((cause) => {
      if (cause instanceof Error && (cause as Error & { statusCode?: number }).statusCode === 401) router.replace('/auth/login?next=%2Fmobility%2Fmanage');
      else setError('تعذر تحميل أنشطة النقل الخاصة بك.');
    }).finally(() => setLoading(false));
  }, [router]);

  const playAlert=useCallback(()=>{try{const AudioContextClass=window.AudioContext||(window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!AudioContextClass)return;const context=new AudioContextClass();[0,.22,.44].forEach(offset=>{const oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=880;gain.gain.setValueAtTime(.0001,context.currentTime+offset);gain.gain.exponentialRampToValueAtTime(.18,context.currentTime+offset+.02);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+offset+.18);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(context.currentTime+offset);oscillator.stop(context.currentTime+offset+.2)});}catch{}},[]);

  const loadRequests=useCallback(async(silent=false)=>{if(!selected)return;if(!silent)setLoading(true);try{const {requests:items}=await api.mobility.listForProvider(selected);const fresh=items.filter(item=>item.status==='requested'&&!knownRequestedIds.current.has(item.id));if(loadedOnce.current&&fresh.length&&alertsEnabled){playAlert();if('Notification'in window&&Notification.permission==='granted')new Notification('طلب جديد على خدمة',{body:fresh[0].serviceType==='taxi'?'هناك طلب رحلة تكسي جديد':'هناك طلب مندوب توصيل جديد',tag:`mobility-${fresh[0].id}`});}knownRequestedIds.current=new Set(items.filter(item=>item.status==='requested').map(item=>item.id));loadedOnce.current=true;setRequests(items);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'تعذر تحميل الطلبات.');}finally{if(!silent)setLoading(false);}},[alertsEnabled,playAlert,selected]);

  useEffect(() => { if(!selected){setRequests([]);return;}loadedOnce.current=false;void loadRequests();const interval=window.setInterval(()=>void loadRequests(true),8000);const business=businesses.find(item=>item.id===selected);const serviceType=business?.categoryCode==='delivery_courier'?'delivery':'taxi';void api.mobility.farePolicy(serviceType).then(({policy})=>setFarePolicy(policy)).catch(()=>setFarePolicy(undefined));return()=>window.clearInterval(interval); }, [businesses,loadRequests,selected]);

  const stopTracking=useCallback(()=>{if(watchId.current!==undefined)navigator.geolocation.clearWatch(watchId.current);watchId.current=undefined;trackingRequestId.current='';lastPosition.current=undefined;},[]);
  const beginTracking=useCallback((requestId:string)=>{if(trackingRequestId.current===requestId||!('geolocation'in navigator))return;stopTracking();trackingRequestId.current=requestId;const stored=Number(localStorage.getItem(`khedmah-distance-${requestId}`)??0);setTrackedMeters(Number.isFinite(stored)?stored:0);watchId.current=navigator.geolocation.watchPosition(({coords})=>{const previous=lastPosition.current;lastPosition.current=coords;if(!previous||coords.accuracy>100)return;const delta=distanceBetween(previous,coords);if(delta<2||delta>500)return;setTrackedMeters(current=>{const next=current+delta;localStorage.setItem(`khedmah-distance-${requestId}`,String(next));return next;});},()=>setError('تعذر قياس مسافة الرحلة. أبقِ إذن الموقع مفعّلًا.'),{enableHighAccuracy:true,maximumAge:3000,timeout:15000});},[stopTracking]);

  useEffect(()=>{const active=requests.find(item=>item.status==='in_progress');if(active)beginTracking(active.id);else stopTracking();return stopTracking;},[beginTracking,requests,stopTracking]);

  async function enableAlerts(){setAlertsEnabled(true);playAlert();if('Notification'in window&&Notification.permission==='default')await Notification.requestPermission();}

  async function transition(request: MobilityRequest, status: MobilityRequest['status']) {
    const reason = status === 'rejected' ? window.prompt('اكتب سبب الرفض للعميل:')?.trim() : undefined;
    if (status === 'rejected' && !reason) return;
    setWorking(request.id); setError('');
    try { const result = await api.mobility.transition(request.id, status, reason, status==='completed'?Math.round(trackedMeters):undefined); setRequests((items) => items.map((item) => item.id === request.id ? result.request : item));if(status==='in_progress')beginTracking(request.id);if(status==='completed'){stopTracking();localStorage.removeItem(`khedmah-distance-${request.id}`);} }
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
        <div className={styles.heading}><span>{labels[request.status]}</span><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString('ar-SY')}</time></div>
        <h2>{request.serviceType === 'taxi' ? 'رحلة تكسي' : 'طلب توصيل'}</h2><p><strong>من:</strong> {request.pickupAddress}</p><p><strong>إلى:</strong> {request.destinationAddress}</p>{request.riderContactPhone&&<a href={`tel:${request.riderContactPhone}`} dir="ltr">{request.riderContactPhone}</a>}{request.status==='in_progress'&&<p className={styles.meter}>المسافة المقاسة: {(trackedMeters/1000).toFixed(2)} كم</p>}{request.fareStatus==='finalized'&&request.finalFare!==undefined&&<p className={styles.fare}>سعر خدمة النهائي: {request.finalFare.toLocaleString('ar-SY')} ل.س.</p>}
        <div className={styles.actions}>{request.status === 'requested' && <><ActionButton disabled={working === request.id} onClick={() => void transition(request, 'accepted')}>قبول</ActionButton><ActionButton variant="secondary" disabled={working === request.id} onClick={() => void transition(request, 'rejected')}>رفض</ActionButton></>}{request.status === 'accepted' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'en_route')}>انطلقت للعميل</ActionButton>}{request.status === 'en_route' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'arrived')}>وصلت إلى العميل</ActionButton>}{request.status === 'arrived' && <ActionButton disabled={working === request.id||!farePolicy?.enabled} onClick={() => void transition(request, 'in_progress')}>{farePolicy?.enabled?'ابدأ الرحلة والعداد':'التعرفة غير مفعّلة'}</ActionButton>}{request.status === 'in_progress' && <ActionButton disabled={working === request.id} onClick={() => void transition(request, 'completed')}>إنهاء وإصدار السعر</ActionButton>}</div>
      </Surface>)}</section> : <EmptyState icon={<PlatformIcon name="car" size={34}/>} title="لا توجد طلبات بعد" description="ستظهر هنا الطلبات الحقيقية المرسلة إلى هذا النشاط."/>}
    </>}
  </PageShell>;
}
