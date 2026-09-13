'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ActionButton, ActionLink, PageHeader, PageShell, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import { taxiApi, type TaxiAddress, type TaxiApiError, type TaxiOffer, type TaxiQuote, type TaxiTrip } from '../../lib/taxi-client';
import { TaxiMapSelector } from './taxi-map-selector';
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
const phase = (trip: TaxiTrip) => ({ submitted: 'بانتظار سائق', accepted: 'السائق في الطريق', in_progress: 'الرحلة جارية', completed: 'مكتملة', cancelled: 'ملغاة', rejected: 'مرفوضة' }[trip.phase]);
const validCoordinates = (value: TaxiAddress) => Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;

function AddressFields({ prefix, value, onChange }: { prefix: string; value: TaxiAddress; onChange(value: TaxiAddress): void }) {
  const set = (field: keyof TaxiAddress, raw: string) => {
    if (field === 'latitude' || field === 'longitude') {
      onChange({ ...value, [field]: raw.trim() === '' ? Number.NaN : Number(raw) });
      return;
    }
    onChange({ ...value, [field]: raw });
  };
  const latitude = Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 ? value.latitude : '';
  const longitude = Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 ? value.longitude : '';
  return <section className={styles.addressBlock} aria-label={`تفاصيل ${prefix}`}>
    <h3>{prefix}</h3>
    <div className={styles.fields}>
      <label>المنطقة<input value={value.area} onChange={event => set('area', event.target.value)} maxLength={80} placeholder="مثال: المزة" /></label>
      <label>وصف العنوان<input value={value.detail} onChange={event => set('detail', event.target.value)} maxLength={300} placeholder="شارع، بناء أو نقطة دالة" /></label>
    </div>
    <details className={styles.coordinateDetails}>
      <summary>إدخال الإحداثيات يدويًا</summary>
      <div className={styles.compactFields}>
        <label>خط العرض<input type="number" step="any" value={latitude} onChange={event => set('latitude', event.target.value)} /></label>
        <label>خط الطول<input type="number" step="any" value={longitude} onChange={event => set('longitude', event.target.value)} /></label>
      </div>
    </details>
  </section>;
}

function TripCard({ trip, onRefresh }: { trip: TaxiTrip; onRefresh(): Promise<void> }) {
  return <Surface className={styles.trip} aria-live="polite">
    <span className={styles.phase}>{phase(trip)}</span>
    <div className={styles.route}>
      <strong>{trip.quote.request.pickup.area} ← {trip.quote.request.dropoff.area}</strong>
      <p>{trip.quote.request.pickup.detail}</p><p>{trip.quote.request.dropoff.detail}</p>
    </div>
    <div className={styles.summary}><dl>
      <div><dt>نسخة الرحلة</dt><dd>{trip.version}</dd></div>
      <div><dt>المسافة المرجعية</dt><dd>{km(trip.quote.distanceMeters)}</dd></div>
      <div><dt>الأجرة المسجلة</dt><dd className={styles.kpi}>{amount(trip.cash.expectedMinor, trip.quote.currency)}</dd></div>
      <div><dt>التحصيل</dt><dd>{trip.cash.status}</dd></div>
    </dl></div>
    <div className={styles.actions}><ActionButton type="button" variant="secondary" onClick={() => void onRefresh()}><PlatformIcon name="refresh" /> تحديث الحالة</ActionButton></div>
  </Surface>;
}

function RiderJourney() {
  const [pickup, setPickup] = useState<TaxiAddress>({ area: '', detail: '', latitude: Number.NaN, longitude: Number.NaN });
  const [dropoff, setDropoff] = useState<TaxiAddress>({ area: '', detail: '', latitude: Number.NaN, longitude: Number.NaN });
  const [quote, setQuote] = useState<TaxiQuote>();
  const [trip, setTrip] = useState<TaxiTrip>();
  const [busy, setBusy] = useState(false);
  const [hasPendingPlace, setHasPendingPlace] = useState(false);
  const [message, setMessage] = useState('حدد نقطتي الانطلاق والوجهة على الخريطة ثم أكمل وصف العنوان للحصول على تسعير خادمي معتمد.');
  const mounted = useRef(true);

  useEffect(() => {
    setHasPendingPlace(!!sessionStorage.getItem(PLACE_KEY));
    return () => { mounted.current = false; };
  }, []);

  async function restore(id?: string) {
    let tripId = id || sessionStorage.getItem(RIDER_TRIP_KEY) || undefined;
    try {
      if (!tripId) {
        const active = await taxiApi.rider.active(); tripId = active.tripId ?? undefined;
        if (tripId) sessionStorage.setItem(RIDER_TRIP_KEY, tripId);
      }
      if (!tripId) return;
      const current = await taxiApi.rider.read(tripId);
      if (mounted.current) { setTrip(current); setMessage('تمت استعادة الرحلة المحفوظة من حسابك.'); }
    } catch (cause) {
      const error = cause as TaxiApiError;
      if (!id && tripId && error.statusCode === 404) {
        sessionStorage.removeItem(RIDER_TRIP_KEY);
        try {
          const active = await taxiApi.rider.active();
          if (active.tripId) {
            sessionStorage.setItem(RIDER_TRIP_KEY, active.tripId);
            const current = await taxiApi.rider.read(active.tripId);
            if (mounted.current) { setTrip(current); setMessage('تمت استعادة الرحلة النشطة من الخادم.'); }
            return;
          }
        } catch (fallback) { if (mounted.current) setMessage(errorMessage(fallback)); return; }
      }
      if (mounted.current) setMessage(errorMessage(cause));
    }
  }
  useEffect(() => { void restore(); }, []);

  function locate() {
    if (!navigator.geolocation) return setMessage('تحديد الموقع غير مدعوم في هذا المتصفح.');
    setMessage('جاري تحديد موقع الانطلاق…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (!mounted.current) return;
      setPickup(value => ({ ...value, latitude: coords.latitude, longitude: coords.longitude }));
      setMessage('تم وضع نقطة الانطلاق على موقعك الحالي. أكمل وصف العنوان وحدد الوجهة على الخريطة.');
    }, () => mounted.current && setMessage('تعذر الوصول إلى موقعك. اختر النقطة على الخريطة أو استخدم الإدخال اليدوي.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  async function price(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setQuote(undefined);
    if (!validCoordinates(pickup) || !validCoordinates(dropoff)) {
      setMessage('حدد نقطة الانطلاق والوجهة على الخريطة أو أدخل الإحداثيات يدويًا قبل حساب السعر.');
      return;
    }
    if (!pickup.area.trim() || !pickup.detail.trim() || !dropoff.area.trim() || !dropoff.detail.trim()) {
      setMessage('أكمل المنطقة ووصف العنوان لنقطتي الانطلاق والوجهة قبل حساب السعر.');
      return;
    }
    setBusy(true); setMessage('جاري اعتماد المسار والتعرفة…');
    try {
      const result = await taxiApi.rider.quote(pickup, dropoff);
      if (mounted.current) { setQuote(result); setMessage('العرض صالح مؤقتًا. السعر النهائي يعتمد على العداد الموثوق عند إنهاء الرحلة.'); }
    } catch (cause) { if (mounted.current) setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function place() {
    if (!quote || busy) return;
    setBusy(true);
    const previous = sessionStorage.getItem(PLACE_KEY);
    let attempt: { quoteId: string; requestId: string };
    try { attempt = previous ? JSON.parse(previous) : { quoteId: quote.id, requestId: crypto.randomUUID() }; }
    catch { attempt = { quoteId: quote.id, requestId: crypto.randomUUID() }; }
    if (attempt.quoteId !== quote.id) attempt = { quoteId: quote.id, requestId: crypto.randomUUID() };
    sessionStorage.setItem(PLACE_KEY, JSON.stringify(attempt)); setHasPendingPlace(true);
    try {
      const created = await taxiApi.rider.place(attempt.quoteId, attempt.requestId);
      if (!mounted.current) return;
      sessionStorage.setItem(RIDER_TRIP_KEY, created.id); sessionStorage.removeItem(PLACE_KEY); setHasPendingPlace(false);
      setTrip(created); setQuote(undefined); setMessage('تم إنشاء طلب التكسي. يمكنك استعادته من حسابك حتى عند فتح جهاز آخر.');
    } catch (cause) {
      if (mounted.current) setMessage(`${errorMessage(cause)} استعد الرحلة النشطة أو أعد المحاولة بالمفتاح نفسه؛ لا تنشئ طلبًا بديلًا.`);
    } finally { if (mounted.current) setBusy(false); }
  }

  async function retryPlacement() {
    const raw = sessionStorage.getItem(PLACE_KEY); if (!raw || busy) return;
    try {
      const attempt = JSON.parse(raw); setBusy(true);
      const created = await taxiApi.rider.place(attempt.quoteId, attempt.requestId);
      if (mounted.current) {
        sessionStorage.setItem(RIDER_TRIP_KEY, created.id); sessionStorage.removeItem(PLACE_KEY); setHasPendingPlace(false);
        setTrip(created); setMessage('تم استرجاع نتيجة المحاولة السابقة.');
      }
    } catch (cause) {
      if ((cause as TaxiApiError).statusCode === 409) await restore();
      if (mounted.current && !(cause as TaxiApiError).statusCode) setMessage(errorMessage(cause));
      else if (mounted.current) setMessage(errorMessage(cause));
    } finally { if (mounted.current) setBusy(false); }
  }

  async function consent() {
    if (!trip || busy) return; setBusy(true);
    try {
      await taxiApi.rider.consent(trip.id, trip.version);
      setMessage('تم تسجيل موافقتك من حسابك. يستطيع السائق بدء الرحلة فقط بعد هذه الموافقة.'); await restore(trip.id);
    } catch (cause) { setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function cancel() {
    if (!trip || busy) return; setBusy(true);
    try { const updated = await taxiApi.rider.command(trip.id, 'cancel', trip.version); setTrip(updated); setMessage('تم تحديث حالة الإلغاء.'); }
    catch (cause) { setMessage(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <div className={styles.grid}>
    <Surface as="form" className={styles.panel} onSubmit={price} aria-busy={busy}>
      <h2>طلب تكسي</h2>
      <TaxiMapSelector pickup={pickup} dropoff={dropoff} onPickupChange={setPickup} onDropoffChange={setDropoff} />
      <AddressFields prefix="الانطلاق" value={pickup} onChange={setPickup} />
      <AddressFields prefix="الوجهة" value={dropoff} onChange={setDropoff} />
      <div className={styles.actions}>
        <ActionButton type="button" variant="secondary" onClick={locate}><PlatformIcon name="pin" /> موقعي الحالي</ActionButton>
        <ActionButton type="submit" disabled={busy}>احسب السعر</ActionButton>
      </div>
      <StatusMessage tone="info">{message}</StatusMessage>
      {message.includes('تسجيل الدخول') && <ActionLink href="/auth/login">تسجيل الدخول</ActionLink>}
      {hasPendingPlace && <ActionButton type="button" variant="secondary" onClick={() => void retryPlacement()} disabled={busy}>استعادة/إعادة المحاولة</ActionButton>}
      <ActionButton type="button" variant="secondary" onClick={() => void restore()} disabled={busy}>استعادة الرحلة النشطة من الحساب</ActionButton>
    </Surface>
    <div className={styles.panel}>
      {quote && <Surface className={styles.summary}>
        <h2>عرض السعر</h2><dl><div><dt>المسافة</dt><dd>{km(quote.distanceMeters)}</dd></div><div><dt>التقدير الأولي</dt><dd>{amount(quote.totalMinor, quote.currency)}</dd></div></dl>
        <p className={styles.note}>هذا تقدير خادمي للمسار. الأجرة النهائية تُحسب من العداد الموثوق والتعرفة المحفوظة للرحلة.</p>
        <ActionButton type="button" onClick={() => void place()} disabled={busy}>اطلب التكسي</ActionButton>
      </Surface>}
      {trip && <><TripCard trip={trip} onRefresh={() => restore(trip.id)} /><div className={styles.actions}>
        {trip.delivery.state === 'at_pickup' && !trip.rideStartedAt && <ActionButton type="button" onClick={() => void consent()} disabled={busy}>أوافق على بدء الرحلة</ActionButton>}
        {!['in_progress', 'completed', 'cancelled', 'rejected'].includes(trip.phase) && <ActionButton type="button" variant="secondary" onClick={() => void cancel()} disabled={busy}>إلغاء الطلب</ActionButton>}
      </div></>}
    </div>
  </div>;
}

function DriverJourney() {
  const [offers, setOffers] = useState<TaxiOffer[]>([]);
  const [trip, setTrip] = useState<TaxiTrip>();
  const [message, setMessage] = useState('تحقق من اعتماد السائق والمركبة ثم حمّل العروض.');
  const [busy, setBusy] = useState(false);

  async function loadOffers() {
    if (busy) return; setBusy(true);
    try {
      await taxiApi.driver.access(); const result = await taxiApi.driver.offers(); setOffers(result.offers);
      setMessage(result.offers.length ? 'اختر عرضًا واحدًا. يعرض النظام المنطقة فقط قبل القبول لحماية بيانات الراكب.' : 'لا توجد عروض متاحة في نطاقك الحالي.');
    } catch (cause) { setMessage(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function read(id?: string) {
    let tripId = id || sessionStorage.getItem(DRIVER_TRIP_KEY) || undefined;
    try {
      if (!tripId) {
        const active = await taxiApi.driver.active(); tripId = active.tripId ?? undefined;
        if (tripId) sessionStorage.setItem(DRIVER_TRIP_KEY, tripId);
      }
      if (!tripId) return;
      const current = await taxiApi.driver.read(tripId); setTrip(current);
      setMessage('تمت استعادة المهمة النشطة من حساب السائق.');
    } catch (cause) {
      if (!id && tripId && (cause as TaxiApiError).statusCode === 404) {
        sessionStorage.removeItem(DRIVER_TRIP_KEY);
        try {
          const active = await taxiApi.driver.active();
          if (active.tripId) { sessionStorage.setItem(DRIVER_TRIP_KEY, active.tripId); setTrip(await taxiApi.driver.read(active.tripId)); setMessage('تمت استعادة المهمة النشطة من الخادم.'); return; }
        } catch (fallback) { setMessage(errorMessage(fallback)); return; }
      }
      setMessage(errorMessage(cause));
    }
  }
  useEffect(() => { void read(); }, []);

  async function accept(offer: TaxiOffer) {
    if (busy) return; setBusy(true);
    try {
      const current = await taxiApi.driver.accept(offer.id, offer.version);
      sessionStorage.setItem(DRIVER_TRIP_KEY, current.id); setTrip(current); setOffers([]);
      setMessage('تم قبول الرحلة. أصبحت تفاصيل الرحلة متاحة للسائق المسند وفق صلاحيات الخادم.');
    } catch (cause) {
      if ((cause as TaxiApiError).statusCode === 409) await read();
      setMessage(errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function checkConsent() {
    if (!trip || busy) return; setBusy(true);
    try {
      const auth = await taxiApi.driver.authorization(trip.id);
      if (!auth.proofId) { setMessage('لم يسجل الراكب موافقته بعد. لا تبدأ الرحلة.'); return; }
      const current = await taxiApi.driver.start(trip.id, auth.version, auth.proofId); setTrip(current);
      setMessage('بدأت الرحلة بعد موافقة الراكب الموثقة.');
    } catch (cause) { setMessage(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function release() {
    if (!trip || busy) return; setBusy(true);
    try {
      await taxiApi.driver.release(trip.id, trip.version, 'driver_unavailable');
      setTrip(undefined); sessionStorage.removeItem(DRIVER_TRIP_KEY); setMessage('تم تحرير المهمة ويمكن تحميل عرض آخر.');
    } catch (cause) { setMessage(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <div className={styles.grid}>
    <Surface className={styles.panel}>
      <h2>مساحة السائق</h2>
      <p className={styles.note}>لا يمنح الملف المهني صلاحية قيادة. يلزم اعتماد مستقل للسائق والمركبة.</p>
      <div className={styles.actions}>
        <ActionButton type="button" onClick={() => void loadOffers()} disabled={busy}>تحديث العروض</ActionButton>
        <ActionButton type="button" variant="secondary" onClick={() => void read()} disabled={busy}>استعادة مهمتي النشطة</ActionButton>
        <ActionLink href="/taxi">واجهة الراكب</ActionLink>
      </div>
      <StatusMessage tone="info">{message}</StatusMessage>{message.includes('تسجيل الدخول') && <ActionLink href="/auth/login">تسجيل الدخول</ActionLink>}
    </Surface>
    <div className={styles.offerList}>
      {!trip && offers.map(offer => <Surface className={styles.offer} key={offer.id}>
        <div className={styles.offerHeader}><div><strong>{offer.pickupArea} ← {offer.dropoffArea ?? 'الوجهة'}</strong><p className={styles.note}>التفاصيل الدقيقة لا تظهر قبل قبول الرحلة.</p></div><span className={styles.phase}>عرض متاح</span></div>
        <ActionButton type="button" onClick={() => void accept(offer)} disabled={busy}>قبول الرحلة</ActionButton>
      </Surface>)}
      {trip && <><TripCard trip={trip} onRefresh={() => read(trip.id)} /><Surface className={styles.panel}>
        <h3>الخطوة التشغيلية</h3>
        <p className={styles.note}>الوصول وإنهاء الرحلة يحتاجان إثباتات من كاتب موثوق/عداد؛ لا توجد أزرار لتزوير هذه البيانات من المتصفح.</p>
        <div className={styles.actions}>
          {trip.delivery.state === 'at_pickup' && !trip.rideStartedAt && <ActionButton type="button" onClick={() => void checkConsent()} disabled={busy}>تحقق من موافقة الراكب وابدأ</ActionButton>}
          {trip.phase === 'accepted' && !trip.rideStartedAt && <ActionButton type="button" variant="secondary" onClick={() => void release()} disabled={busy}>تحرير المهمة</ActionButton>}
        </div>
      </Surface></>}
    </div>
  </div>;
}

function TaxiContent() {
  const params = useSearchParams(); const driver = params.get('mode') === 'driver';
  return <PageShell className={styles.page} label="خدمة تكسي">
    <PageHeader eyebrow="خدمة — التنقل" title="تكسي" description="حدد الانطلاق والوجهة على الخريطة داخل صفحة التكسي. الرحلة تبقى مرتبطة بالحساب والتعرفة واعتماد السائق، ولا يبدأ العداد دون موافقة الراكب الموثقة." backHref="/" />
    <div className={styles.switcher}><ActionLink href="/taxi" variant={driver ? 'secondary' : 'primary'}>راكب</ActionLink><ActionLink href="/taxi?mode=driver" variant={driver ? 'primary' : 'secondary'}>سائق</ActionLink><ActionLink href="/mobility?type=delivery" variant="secondary">مندوب توصيل</ActionLink></div>
    {driver ? <DriverJourney /> : <RiderJourney />}
  </PageShell>;
}

export default function TaxiPage() {
  return <Suspense fallback={<PageShell className={styles.page} label="خدمة تكسي"><StatusMessage>جاري فتح رحلة التكسي…</StatusMessage></PageShell>}><TaxiContent /></Suspense>;
}
