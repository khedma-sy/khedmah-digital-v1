'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ActionButton, ActionLink, PageHeader, PageShell, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import { taxiApi, type TaxiAddress, type TaxiApiError, type TaxiQuote, type TaxiTrip } from '../../lib/taxi-client';
import styles from './taxi.module.css';

const RIDER_TRIP_KEY = 'khedmah-taxi-rider-trip';
const DRIVER_TRIP_KEY = 'khedmah-taxi-driver-trip';
const PLACE_KEY = 'khedmah-taxi-place-attempt';

function errorMessage(cause: unknown) {
  const error = cause as TaxiApiError;
  if (error?.statusCode === 401) return 'يلزم تسجيل الدخول للمتابعة.';
  if (error?.statusCode === 403) return 'الحساب غير مخول لهذه العملية.';
  if (error?.statusCode === 409) return 'تغيّرت الرحلة أو انتهت صلاحية بياناتها. حدّث الحالة قبل إعادة المحاولة.';
  if (error?.statusCode === 503) return 'خدمة التكسي التشغيلية غير متاحة في هذه البيئة حاليًا.';
  return error?.message || 'تعذر إكمال العملية. تحقق من الاتصال ثم استعد الحالة قبل إعادة الطلب.';
}
const amount = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;
const km = (meters?: number) => typeof meters === 'number' ? `${(meters / 1000).toFixed(1)} كم` : '—';
const phase = (trip: TaxiTrip) => ({submitted:'بانتظار سائق',accepted:'السائق في الطريق',in_progress:'الرحلة جارية',completed:'مكتملة',cancelled:'ملغاة',rejected:'مرفوضة'}[trip.phase]);

function AddressFields({ prefix, value, onChange }: { prefix: string; value: TaxiAddress; onChange(value: TaxiAddress): void }) {
  const set = (key: keyof TaxiAddress, raw: string) => onChange({ ...value, [key]: key === 'latitude' || key === 'longitude' ? Number(raw) : raw });
  return <div className={styles.fields}>
    <label>{prefix} — المنطقة<input value={value.area} onChange={e => set('area', e.target.value)} maxLength={80}/></label>
    <label>{prefix} — العنوان<input value={value.detail} onChange={e => set('detail', e.target.value)} maxLength={300}/></label>
    <label>خط العرض<input type="number" step="any" value={value.latitude} onChange={e => set('latitude', e.target.value)}/></label>
    <label>خط الطول<input type="number" step="any" value={value.longitude} onChange={e => set('longitude', e.target.value)}/></label>
  </div>;
}

function TripCard({ trip, onRefresh }: { trip: TaxiTrip; onRefresh(): Promise<void> }) {
  return <Surface className={styles.trip} aria-live="polite">
    <span className={styles.phase}>{phase(trip)}</span>
    <div className={styles.route}><strong>{trip.quote.request.pickup.area} ← {trip.quote.request.dropoff.area}</strong><p>{trip.quote.request.pickup.detail}</p><p>{trip.quote.request.dropoff.detail}</p></div>
    <div className={styles.summary}><dl>
      <div><dt>نسخة الرحلة</dt><dd>{trip.version}</dd></div>
      <div><dt>المسافة المرجعية</dt><dd>{km(trip.quote.distanceMeters)}</dd></div>
      <div><dt>الأجرة المسجلة</dt><dd className={styles.kpi}>{amount(trip.cash.expectedMinor, trip.quote.currency)}</dd></div>
      <div><dt>التحصيل</dt><dd>{trip.cash.status}</dd></div>
    </dl></div>
    <div className={styles.actions}><ActionButton type="button" variant="secondary" onClick={() => void onRefresh()}><PlatformIcon name="refresh"/> تحديث الحالة</ActionButton></div>
  </Surface>;
}

function RiderJourney() {
  const [pickup, setPickup] = useState<TaxiAddress>({ area:'',detail:'',latitude:33.5138,longitude:36.2765 });
  const [dropoff, setDropoff] = useState<TaxiAddress>({ area:'',detail:'',latitude:33.5000,longitude:36.3000 });
  const [quote, setQuote] = useState<TaxiQuote>();
  const [trip, setTrip] = useState<TaxiTrip>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('حدد نقطتي الانطلاق والوجهة للحصول على تسعير خادمي معتمد.');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function restore(id?: string) {
    const tripId = id || sessionStorage.getItem(RIDER_TRIP_KEY) || undefined;
    if (!tripId) return;
    try { const current = await taxiApi.rider.read(tripId); if (mounted.current) { setTrip(current); setMessage('تمت استعادة الرحلة المحفوظة.'); } }
    catch (cause) { if (mounted.current) setMessage(errorMessage(cause)); }
  }
  useEffect(() => { void restore(); }, []);

  function locate() {
    if (!navigator.geolocation) return setMessage('تحديد الموقع غير مدعوم في هذا المتصفح.');
    setMessage('جاري تحديد موقع الانطلاق…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!mounted.current) return;
      setPickup(value => ({ ...value, latitude: coords.latitude, longitude: coords.longitude }));
      setMessage('تم تحديث إحداثيات نقطة الانطلاق. اكتب وصف العنوان ثم اطلب السعر.');
    }, () => mounted.current && setMessage('تعذر الوصول إلى موقعك. يمكنك إدخال الإحداثيات يدويًا.'), { enableHighAccuracy:true, timeout:10000, maximumAge:60000 });
  }

  async function price(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('جاري اعتماد المسار والتعرفة…'); setQuote(undefined);
    try { const result = await taxiApi.rider.quote(pickup, dropoff); if (mounted.current) { setQuote(result); setMessage('العرض صالح مؤقتًا. السعر النهائي يعتمد على العداد الموثوق عند إنهاء الرحلة.'); } }
    catch (cause) { if (mounted.current) setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function place() {
    if (!quote || busy) return; setBusy(true);
    const previous = sessionStorage.getItem(PLACE_KEY);
    let attempt: { quoteId:string; requestId:string };
    try { attempt = previous ? JSON.parse(previous) : { quoteId:quote.id, requestId:crypto.randomUUID() }; }
    catch { attempt = { quoteId:quote.id, requestId:crypto.randomUUID() }; }
    if (attempt.quoteId !== quote.id) attempt = { quoteId:quote.id, requestId:crypto.randomUUID() };
    sessionStorage.setItem(PLACE_KEY, JSON.stringify(attempt));
    try {
      const created = await taxiApi.rider.place(attempt.quoteId, attempt.requestId);
      if (!mounted.current) return;
      sessionStorage.setItem(RIDER_TRIP_KEY, created.id); sessionStorage.removeItem(PLACE_KEY);
      setTrip(created); setQuote(undefined); setMessage('تم إنشاء طلب التكسي. ابقِ الصفحة مفتوحة أو عد لاحقًا لاستعادة نفس الرحلة.');
    } catch (cause) { if (mounted.current) setMessage(`${errorMessage(cause)} يمكنك الضغط على «استعادة/إعادة المحاولة» بنفس المحاولة دون إنشاء طلب جديد.`); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function retryPlacement() {
    const raw = sessionStorage.getItem(PLACE_KEY); if (!raw || busy) return;
    try { const attempt = JSON.parse(raw); setBusy(true); const created = await taxiApi.rider.place(attempt.quoteId, attempt.requestId);
      if (mounted.current) { sessionStorage.setItem(RIDER_TRIP_KEY, created.id); sessionStorage.removeItem(PLACE_KEY); setTrip(created); setMessage('تم استرجاع نتيجة المحاولة السابقة.'); }
    } catch (cause) { if (mounted.current) setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function consent() {
    if (!trip || busy) return; setBusy(true);
    try { await taxiApi.rider.consent(trip.id, trip.version); setMessage('تم تسجيل موافقتك من حسابك. يستطيع السائق بدء الرحلة فقط بعد هذه الموافقة.'); await restore(trip.id); }
    catch (cause) { setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function cancel() {
    if (!trip || busy) return; setBusy(true);
    try { const updated = await taxiApi.rider.command(trip.id,'cancel',trip.version); setTrip(updated); setMessage('تم تحديث حالة الإلغاء.'); }
    catch (cause) { setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <div className={styles.grid}>
    <Surface as="form" className={styles.panel} onSubmit={price} aria-busy={busy}>
      <h2>طلب تكسي</h2>
      <AddressFields prefix="الانطلاق" value={pickup} onChange={setPickup}/>
      <AddressFields prefix="الوجهة" value={dropoff} onChange={setDropoff}/>
      <div className={styles.actions}><ActionButton type="button" variant="secondary" onClick={locate}><PlatformIcon name="pin"/> موقعي الحالي</ActionButton><ActionButton type="submit" disabled={busy}>احسب السعر</ActionButton></div>
      <StatusMessage tone="info">{message}</StatusMessage>
      {(message.includes('تسجيل الدخول')) && <ActionLink href="/auth/login">تسجيل الدخول</ActionLink>}
      {sessionStorage.getItem(PLACE_KEY) && <ActionButton type="button" variant="secondary" onClick={() => void retryPlacement()} disabled={busy}>استعادة/إعادة المحاولة</ActionButton>}
    </Surface>
    <div className={styles.panel}>
      {quote && <Surface className={styles.summary}><h2>عرض السعر</h2><dl><div><dt>المسافة</dt><dd>{km(quote.distanceMeters)}</dd></div><div><dt>التقدير الأولي</dt><dd>{amount(quote.totalMinor,quote.currency)}</dd></div></dl><p className={styles.note}>هذا تقدير خادمي للمسار. الأجرة النهائية تُحسب من العداد الموثوق والتعرفة المحفوظة للرحلة.</p><ActionButton type="button" onClick={() => void place()} disabled={busy}>اطلب التكسي</ActionButton></Surface>}
      {trip && <><TripCard trip={trip} onRefresh={() => restore(trip.id)}/><div className={styles.actions}>{trip.delivery.state === 'at_pickup' && !trip.rideStartedAt && <ActionButton type="button" onClick={() => void consent()} disabled={busy}>أوافق على بدء الرحلة</ActionButton>}{!['in_progress','completed','cancelled','rejected'].includes(trip.phase) && <ActionButton type="button" variant="secondary" onClick={() => void cancel()} disabled={busy}>إلغاء الطلب</ActionButton>}</div></>}
    </div>
  </div>;
}

function DriverJourney() {
  const [offers, setOffers] = useState<TaxiTrip[]>([]); const [trip,setTrip]=useState<TaxiTrip>(); const [message,setMessage]=useState('تحقق من اعتماد السائق والمركبة ثم حمّل العروض.'); const [busy,setBusy]=useState(false);
  async function loadOffers(){if(busy)return;setBusy(true);try{await taxiApi.driver.access();const result=await taxiApi.driver.offers();setOffers(result.offers);setMessage(result.offers.length?'اختر عرضًا واحدًا. النظام يمنع حجز مهمتين نشطتين للسائق نفسه.':'لا توجد عروض متاحة في نطاقك الحالي.');}catch(cause){setMessage(errorMessage(cause));}finally{setBusy(false)}}
  async function read(id?:string){const tripId=id||sessionStorage.getItem(DRIVER_TRIP_KEY)||undefined;if(!tripId)return;try{setTrip(await taxiApi.driver.read(tripId));}catch(cause){setMessage(errorMessage(cause));}}
  useEffect(()=>{void read();},[]);
  async function accept(offer:TaxiTrip){if(busy)return;setBusy(true);try{const current=await taxiApi.driver.accept(offer.id,offer.version);sessionStorage.setItem(DRIVER_TRIP_KEY,current.id);setTrip(current);setOffers([]);setMessage('تم قبول الرحلة وربطها باعتماد السائق والمركبة الحاليين.');}catch(cause){setMessage(errorMessage(cause));}finally{setBusy(false)}}
  async function checkConsent(){if(!trip||busy)return;setBusy(true);try{const auth=await taxiApi.driver.authorization(trip.id);if(!auth.proofId){setMessage('لم يسجل الراكب موافقته بعد. لا تبدأ الرحلة.');return;}const current=await taxiApi.driver.start(trip.id,auth.version,auth.proofId);setTrip(current);setMessage('بدأت الرحلة بعد موافقة الراكب الموثقة.');}catch(cause){setMessage(errorMessage(cause));}finally{setBusy(false)}}
  async function release(){if(!trip||busy)return;setBusy(true);try{const current=await taxiApi.driver.release(trip.id,trip.version,'driver_unavailable');setTrip(current);sessionStorage.removeItem(DRIVER_TRIP_KEY);setMessage('تم تحرير المهمة.');}catch(cause){setMessage(errorMessage(cause));}finally{setBusy(false)}}
  return <div className={styles.grid}><Surface className={styles.panel}><h2>مساحة السائق</h2><p className={styles.note}>لا يمنح الملف المهني صلاحية قيادة. يلزم اعتماد مستقل للسائق والمركبة.</p><div className={styles.actions}><ActionButton type="button" onClick={()=>void loadOffers()} disabled={busy}>تحديث العروض</ActionButton><ActionLink href="/taxi">واجهة الراكب</ActionLink></div><StatusMessage tone="info">{message}</StatusMessage>{message.includes('تسجيل الدخول')&&<ActionLink href="/auth/login">تسجيل الدخول</ActionLink>}</Surface><div className={styles.offerList}>{!trip&&offers.map(offer=><Surface className={styles.offer} key={offer.id}><div className={styles.offerHeader}><div><strong>{offer.quote.request.pickup.area} ← {offer.quote.request.dropoff.area}</strong><p>{km(offer.quote.distanceMeters)}</p></div><span className={styles.phase}>{phase(offer)}</span></div><ActionButton type="button" onClick={()=>void accept(offer)} disabled={busy}>قبول الرحلة</ActionButton></Surface>)}{trip&&<><TripCard trip={trip} onRefresh={()=>read(trip.id)}/><Surface className={styles.panel}><h3>الخطوة التشغيلية</h3><p className={styles.note}>الوصول وإنهاء الرحلة يحتاجان إثباتات من كاتب موثوق/عداد؛ لا توجد أزرار لتزوير هذه البيانات من المتصفح.</p><div className={styles.actions}>{trip.delivery.state==='at_pickup'&&!trip.rideStartedAt&&<ActionButton type="button" onClick={()=>void checkConsent()} disabled={busy}>تحقق من موافقة الراكب وابدأ</ActionButton>}{trip.phase==='accepted'&&!trip.rideStartedAt&&<ActionButton type="button" variant="secondary" onClick={()=>void release()} disabled={busy}>تحرير المهمة</ActionButton>}</div></Surface></>}</div></div>;
}

export default function TaxiPage(){const params=useSearchParams();const driver=params.get('mode')==='driver';return <PageShell className={styles.page} label="خدمة ديجتل تكسي"><PageHeader eyebrow="خدمة ديجتل — التنقل" title="تكسي" description="رحلة تشغيلية مرتبطة بالحساب والتعرفة والمسار واعتماد السائق. لا يبدأ العداد دون موافقة الراكب الموثقة." backHref="/"/><div className={styles.switcher}><ActionLink href="/taxi" variant={driver?'secondary':'primary'}>راكب</ActionLink><ActionLink href="/taxi?mode=driver" variant={driver?'primary':'secondary'}>سائق</ActionLink><ActionLink href="/mobility?type=delivery" variant="secondary">مندوب توصيل</ActionLink></div>{driver?<DriverJourney/>:<RiderJourney/>}</PageShell>}
