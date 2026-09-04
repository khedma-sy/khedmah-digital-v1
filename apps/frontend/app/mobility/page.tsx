'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, type MobilityFarePolicy, type MobilityRequest, type PublicBusinessProfile } from '../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './mobility.module.css';

type Coordinates = { latitude: number; longitude: number };
type GooglePoint = { lat(): number; lng(): number };
type Place = { formatted_address?: string; geometry?: { location?: GooglePoint } };
type Autocomplete = { addListener(name: 'place_changed', callback: () => void): void; getPlace(): Place };
type MapHandle = { panTo(point: { lat: number; lng: number }): void; setZoom(zoom: number): void; fitBounds(bounds: BoundsHandle, padding?: number): void; addListener(name: 'click', callback: (event: { latLng?: GooglePoint }) => void): void };
type BoundsHandle = { extend(point: { lat: number; lng: number }): void };
type MobilityMapsApi = {
  Map: new (node: HTMLElement, options: object) => MapHandle;
  Marker: new (options: object) => { setMap(map: MapHandle | null): void };
  Polyline: new (options: object) => { setMap(map: MapHandle | null): void };
  LatLngBounds: new () => BoundsHandle;
  places?: { Autocomplete: new (input: HTMLInputElement, options: object) => Autocomplete };
  Geocoder?: new () => { geocode(request: object, callback: (results: Place[] | null, status: string) => void): void };
};
type MobilityRuntime = { google?: { maps?: MobilityMapsApi }; initKhedmahMobility?: () => void; gm_authFailure?: () => void };

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const SCRIPT_ID = 'khedmah-google-maps';
const DEFAULT_CENTER = { latitude: 33.5138, longitude: 36.2765 };
const categoryFor = (type: 'taxi' | 'delivery') => type === 'taxi' ? 'taxi' : 'delivery_courier';
const toMapPoint = ({ latitude, longitude }: Coordinates) => ({ lat: latitude, lng: longitude });
const openStatuses: MobilityRequest['status'][] = ['requested','accepted','en_route','arrived','in_progress'];
const requestStatus = (request: MobilityRequest) => request.serviceType === 'delivery'
  ? ({ requested:'بانتظار قبول المندوب',accepted:'قَبِل المندوب الطلب',en_route:'المندوب في طريقه للاستلام',arrived:'وصل المندوب إلى نقطة الاستلام',in_progress:'تم الاستلام والمندوب في طريقه للتسليم',completed:'تم تسليم الطلب',rejected:'اعتذر المندوب عن الطلب',cancelled:'تم إلغاء الطلب' } satisfies Record<MobilityRequest['status'], string>)[request.status]
  : ({ requested:'بانتظار قبول السائق',accepted:'تم قبول الرحلة',en_route:'السائق في الطريق إليك',arrived:'وصل السائق إلى نقطة الانطلاق',in_progress:'بدأت الرحلة والتسعير',completed:'اكتملت الرحلة',rejected:'اعتذر السائق عن الطلب',cancelled:'تم إلغاء الطلب' } satisfies Record<MobilityRequest['status'], string>)[request.status];
type RiderNotice = { title: string; body: string };
const deliveryNotifications: Partial<Record<MobilityRequest['status'], RiderNotice>> = { accepted:{title:'قَبِل المندوب طلبك',body:'تم ربطك بالمندوب وأصبح رقم التواصل ظاهرًا.'},en_route:{title:'المندوب في طريقه للاستلام',body:'جهّز الطرد، ولا تشارك رمز الاستلام قبل وصول المندوب.'},arrived:{title:'وصل المندوب للاستلام',body:'تحقق من المندوب ثم شارك رمز الاستلام.'},in_progress:{title:'تم استلام الطرد',body:'المندوب في طريقه إلى المستلم. لا يُشارك رمز التسليم قبل وصوله.'},completed:{title:'تم تسليم الطرد',body:'اكتملت عملية التوصيل بإثبات التسليم.'} };
const taxiNotifications: Partial<Record<MobilityRequest['status'], RiderNotice>> = { accepted:{title:'قُبل طلب رحلة خدمة',body:'تم ربطك بالسائق، وأصبح رقم التواصل ظاهرًا للطرفين.'},en_route:{title:'سائق خدمة في الطريق',body:'انطلق السائق إلى نقطة الالتقاء المحددة.'},arrived:{title:'وصل سائق خدمة',body:'السائق عند نقطة الانطلاق. لن يبدأ التسعير حتى تبدأ الرحلة.'},in_progress:{title:'بدأت رحلة خدمة',body:'بدأت الرحلة والتسعير الآن بعد وصول السائق.'} };
const riderNotification = (request: MobilityRequest) => (request.serviceType === 'delivery' ? deliveryNotifications : taxiNotifications)[request.status];

export default function MobilityPage() {
  const pickupInput = useRef<HTMLInputElement>(null);
  const destinationInput = useRef<HTMLInputElement>(null);
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const removeOverlays = useRef<Array<() => void>>([]);
  const activePointRef = useRef<'pickup' | 'destination'>('pickup');
  const [type, setType] = useState<'taxi' | 'delivery'>('taxi');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageSize, setPackageSize] = useState<'small' | 'medium' | 'large'>('small');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<Coordinates>();
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates>();
  const [activePoint, setActivePoint] = useState<'pickup' | 'destination'>('pickup');
  const [providers, setProviders] = useState<PublicBusinessProfile[]>([]);
  const [mapsStatus, setMapsStatus] = useState<'loading' | 'ready' | 'error'>(MAPS_KEY ? 'loading' : 'error');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState(MAPS_KEY ? 'حدد نقطة الانطلاق والوجهة، أو اكتب العنوان وسنحاول تحديده.' : 'الخريطة غير مهيأة حاليًا؛ استخدم موقعك الحالي للبحث القريب.');
  const [activeRequest, setActiveRequest] = useState<MobilityRequest>();
  const [requestingProviderId, setRequestingProviderId] = useState('');
  const [farePolicy, setFarePolicy] = useState<MobilityFarePolicy>();
  const previousStatus = useRef<MobilityRequest['status']|undefined>(undefined);
  const deliveryDetailsReady = type === 'taxi' || Boolean(packageDescription.trim() && recipientName.trim() && recipientPhone.trim().length >= 6);
  const canPlanRoute = Boolean(pickup.trim() && destination.trim() && contactPhone.trim().length >= 6 && deliveryDetailsReady);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('type') === 'delivery') setType('delivery');
    const refresh = () => void api.mobility.listMine().then(({ requests }) => {
      const latest = requests.find((item) => openStatuses.includes(item.status));
      const changed = previousStatus.current && previousStatus.current !== latest?.status;
      const notification = latest ? riderNotification(latest) : undefined;
      if (changed && notification && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, { body: notification.body, tag: `mobility-${latest?.id}-${latest?.status}` });
      }
      previousStatus.current = latest?.status; setActiveRequest(latest);
    }).catch(() => undefined);
    refresh(); const interval = window.setInterval(refresh, 8000); return () => window.clearInterval(interval);
  }, []);

  useEffect(() => { void api.mobility.farePolicy(type).then(({policy}) => setFarePolicy(policy)).catch(() => setFarePolicy(undefined)); }, [type]);

  useEffect(() => { activePointRef.current = activePoint; }, [activePoint]);

  const reverseGeocode = useCallback((coordinates: Coordinates, target: 'pickup' | 'destination') => {
    const maps = (window as unknown as MobilityRuntime).google?.maps;
    const fallback = `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
    const apply = (value: string) => target === 'pickup' ? setPickup(value) : setDestination(value);
    if (!maps?.Geocoder) return apply(fallback);
    new maps.Geocoder().geocode({ location: toMapPoint(coordinates) }, (results, status) => {
      apply(status === 'OK' ? results?.[0]?.formatted_address ?? fallback : fallback);
    });
  }, []);

  const renderMap = useCallback(() => {
    if (!map.current || !(window as unknown as MobilityRuntime).google?.maps) return;
    const maps = (window as unknown as MobilityRuntime).google!.maps!;
    removeOverlays.current.forEach((remove) => remove());
    removeOverlays.current = [];
    const bounds = new maps.LatLngBounds();
    const points: Coordinates[] = [];
    if (pickupCoordinates) {
      const point = toMapPoint(pickupCoordinates);
      bounds.extend(point); points.push(pickupCoordinates);
      const marker = new maps.Marker({ map: map.current, position: point, label: 'أ', title: 'نقطة الانطلاق' });
      removeOverlays.current.push(() => marker.setMap(null));
    }
    if (destinationCoordinates) {
      const point = toMapPoint(destinationCoordinates);
      bounds.extend(point); points.push(destinationCoordinates);
      const marker = new maps.Marker({ map: map.current, position: point, label: 'ب', title: 'الوجهة' });
      removeOverlays.current.push(() => marker.setMap(null));
    }
    providers.forEach((provider) => {
      if (provider.lat === undefined || provider.lng === undefined) return;
      const point = { lat: provider.lat, lng: provider.lng };
      bounds.extend(point); points.push({ latitude: provider.lat, longitude: provider.lng });
      const marker = new maps.Marker({ map: map.current, position: point, title: provider.name, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' } });
      removeOverlays.current.push(() => marker.setMap(null));
    });
    if (pickupCoordinates && destinationCoordinates) {
      const line = new maps.Polyline({ map: map.current, path: [toMapPoint(pickupCoordinates), toMapPoint(destinationCoordinates)], geodesic: true, strokeColor: '#81BE49', strokeOpacity: .9, strokeWeight: 5 });
      removeOverlays.current.push(() => line.setMap(null));
    }
    if (points.length > 1) map.current.fitBounds(bounds, 72);
    else if (points.length === 1) { map.current.panTo(toMapPoint(points[0])); map.current.setZoom(15); }
  }, [destinationCoordinates, pickupCoordinates, providers]);

  useEffect(renderMap, [renderMap]);

  useEffect(() => {
    if (!MAPS_KEY) return;
    const runtime = window as unknown as MobilityRuntime;
    let cancelled = false;
    const previousAuthFailure = runtime.gm_authFailure;
    const isolatedPreview = /^khedmah-pr-\d+-frontend-/.test(window.location.hostname);
    if (isolatedPreview) {
      setMapsStatus('error');
      setMessage('الخريطة التفاعلية غير متاحة في نطاق المعاينة. استخدم موقعك الحالي لإيجاد السائقين القريبين.');
      return;
    }

    const initialize = () => {
      if (cancelled || !runtime.google?.maps || !pickupInput.current || !destinationInput.current) return;
      const maps = runtime.google.maps;
      if (!map.current && mapNode.current) {
        map.current = new maps.Map(mapNode.current, { center: toMapPoint(DEFAULT_CENTER), zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false });
        map.current.addListener('click', ({ latLng }) => {
          if (!latLng) return;
          const coordinates = { latitude: latLng.lat(), longitude: latLng.lng() };
          const target = activePointRef.current;
          if (target === 'pickup') setPickupCoordinates(coordinates); else setDestinationCoordinates(coordinates);
          reverseGeocode(coordinates, target);
          setMessage(target === 'pickup' ? 'تم تحديد نقطة الانطلاق من الخريطة.' : 'تم تحديد الوجهة من الخريطة.');
        });
      }
      if (maps.places) {
        const bind = (input: HTMLInputElement, target: 'pickup' | 'destination') => {
          const autocomplete = new maps.places!.Autocomplete(input, { fields: ['formatted_address', 'geometry'], componentRestrictions: { country: 'sy' } });
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            const location = place.geometry?.location;
            if (!location) return setMessage('اختر العنوان من الاقتراحات، أو اتركه مكتوبًا ليتم تحديده عند البحث.');
            const coordinates = { latitude: location.lat(), longitude: location.lng() };
            if (target === 'pickup') { setPickup(place.formatted_address ?? input.value); setPickupCoordinates(coordinates); }
            else { setDestination(place.formatted_address ?? input.value); setDestinationCoordinates(coordinates); }
          });
        };
        bind(pickupInput.current, 'pickup');
        bind(destinationInput.current, 'destination');
      }
      setMapsStatus('ready');
      setMessage('الخريطة جاهزة. اختر العنوان من الاقتراحات أو انقر لتثبيت النقطة.');
    };

    runtime.initKhedmahMobility = initialize;
    runtime.gm_authFailure = () => { setMapsStatus('error'); setMessage('تعذر اعتماد مفتاح Google Maps لهذا النطاق. البحث القريب ما زال متاحًا عبر موقعك الحالي.'); };
    if (runtime.google?.maps) initialize();
    else {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      if (existing) existing.addEventListener('load', initialize, { once: true });
      else {
        const script = document.createElement('script');
        script.id = SCRIPT_ID; script.async = true; script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY&libraries=places&loading=async&callback=initKhedmahMobility`;
        script.onerror = () => { setMapsStatus('error'); setMessage('تعذر تحميل الخريطة. تحقق من الاتصال أو استخدم موقعك الحالي.'); };
        document.head.appendChild(script);
      }
    }
    const timeout = window.setTimeout(() => { if (!map.current) { setMapsStatus('error'); setMessage('استغرق تحميل الخريطة وقتًا طويلًا. البحث عبر الموقع الحالي ما زال متاحًا.'); } }, 20000);
    return () => { cancelled = true; window.clearTimeout(timeout); delete runtime.initKhedmahMobility; runtime.gm_authFailure = previousAuthFailure; };
  }, [reverseGeocode]);

  function useCurrentLocation() {
    setMessage('جاري تحديد موقع الانطلاق…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const coordinates = { latitude: coords.latitude, longitude: coords.longitude };
      setPickupCoordinates(coordinates); setActivePoint('destination'); reverseGeocode(coordinates, 'pickup');
      setMessage('تم تحديد موقعك. اختر الوجهة الآن.');
    }, () => setMessage('تعذر الوصول إلى موقعك. فعّل إذن الموقع ثم حاول مجددًا.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function geocodeAddress(address: string): Promise<Coordinates | undefined> {
    const maps = (window as unknown as MobilityRuntime).google?.maps;
    if (!address.trim() || !maps?.Geocoder) return Promise.resolve(undefined);
    const Geocoder = maps.Geocoder;
    return new Promise((resolve) => new Geocoder().geocode({ address, componentRestrictions: { country: 'SY' } }, (results, status) => {
      const location = status === 'OK' ? results?.[0]?.geometry?.location : undefined;
      resolve(location ? { latitude: location.lat(), longitude: location.lng() } : undefined);
    }));
  }

  async function findProviders(event: FormEvent) {
    event.preventDefault(); setLoading(true); setSearched(false);
    try {
      const resolvedPickup = pickupCoordinates ?? await geocodeAddress(pickup);
      const resolvedDestination = destinationCoordinates ?? await geocodeAddress(destination);
      if (!resolvedPickup) { setMessage('لم نتمكن من تحديد نقطة الانطلاق. استخدم موقعك أو اخترها من الخريطة.'); return; }
      if (!resolvedDestination) { setMessage('لم نتمكن من تثبيت الوجهة. اخترها من الاقتراحات أو الخريطة ثم حاول مجددًا.'); return; }
      setPickupCoordinates(resolvedPickup);
      setDestinationCoordinates(resolvedDestination);
      const result = await api.search.query({ categoryCode: categoryFor(type), type: 'business', map: true, latitude: resolvedPickup.latitude, longitude: resolvedPickup.longitude });
      const nearby = result.businesses.slice(0, 12);
      setProviders(nearby); setSearched(true);
      setMessage(nearby.length ? `وجدنا ${nearby.length} مزودًا معتمدًا مرتّبًا حسب القرب والتوفر.` : `لا توجد حاليًا ملفات ${type === 'taxi' ? 'تاكسي' : 'مندوب توصيل'} معتمدة منشورة قرب هذه النقطة.`);
    } catch (cause) {
      setProviders([]); setSearched(true); setMessage(cause instanceof Error ? cause.message : 'تعذر البحث عن مقدمي الخدمة.');
    } finally { setLoading(false); }
  }

  async function requestProvider(provider: PublicBusinessProfile) {
    if (!farePolicy?.enabled) return setMessage('التعرفة بانتظار اعتماد خدمة؛ لن نرسل طلبًا بلا سعر تحسبه المنصة.');
    if (!pickupCoordinates || !pickup.trim() || !destination.trim() || contactPhone.trim().length < 6) return setMessage('حدد الانطلاق والوجهة وأدخل رقم تواصل صالحًا قبل إرسال الطلب.');
    if (type === 'delivery' && !deliveryDetailsReady) return setMessage('أكمل وصف الطرد واسم المستلم ورقم هاتفه قبل إرسال الطلب.');
    setRequestingProviderId(provider.id); setMessage('جاري إرسال الطلب إلى المزود…');
    try {
      const deliveryDetails = type === 'delivery' ? { packageDescription: packageDescription.trim(), packageSize, recipientName: recipientName.trim(), recipientPhone: recipientPhone.trim(), deliveryInstructions: deliveryInstructions.trim() || undefined,
        riderNote: [`الطرد: ${packageDescription.trim()}`, `الحجم: ${{small:'صغير',medium:'متوسط',large:'كبير'}[packageSize]}`, `المستلم: ${recipientName.trim()}`, `هاتف المستلم: ${recipientPhone.trim()}`, deliveryInstructions.trim() ? `تعليمات: ${deliveryInstructions.trim()}` : ''].filter(Boolean).join(' | ') } : {};
      const result = await api.mobility.create({ providerBusinessId: provider.id, serviceType: type, pickupAddress: pickup, destinationAddress: destination, riderContactPhone: contactPhone, ...deliveryDetails,
        pickupLatitude: pickupCoordinates.latitude, pickupLongitude: pickupCoordinates.longitude,
        destinationLatitude: destinationCoordinates?.latitude, destinationLongitude: destinationCoordinates?.longitude }, crypto.randomUUID());
      setActiveRequest(result.request); setMessage(type === 'delivery' ? 'تم إرسال طلب التوصيل. ستتابع الاستلام والتسليم بإثبات واضح.' : 'تم إرسال الطلب. سيظهر رقم السائق بعد القبول، ولن يبدأ التسعير قبل وصوله.');
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch (cause) {
      const status = cause instanceof Error ? (cause as Error & { statusCode?: number }).statusCode : undefined;
      if (status === 401) return window.location.assign('/auth/login?next=%2Fmobility');
      setMessage(cause instanceof Error ? cause.message : 'تعذر إرسال طلب الرحلة.');
    } finally { setRequestingProviderId(''); }
  }

  async function cancelRequest() {
    if (!activeRequest) return;
    try { const result = await api.mobility.transition(activeRequest.id, 'cancelled'); setActiveRequest(result.request); setMessage('تم إلغاء الطلب.'); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'تعذر إلغاء الطلب.'); }
  }

  return <PageShell className={`${styles.page} ${type === 'delivery' ? styles.deliveryMode : styles.taxiMode}`} label="النقل والتوصيل">
    <PageHeader eyebrow={type === 'taxi' ? 'خدمة تنقّل · تكسي' : 'خدمة تنقّل · توصيل'} title={type === 'taxi' ? 'ابدأ الرحلة' : 'أرسل طلب توصيل'} description={type === 'taxi' ? 'حدد نقطة الانطلاق والوجهة، ثم اختر سائقًا معتمدًا قريبًا.' : 'من الاستلام إلى التسليم، تابع طردك مع مندوب معتمد وإثبات واضح.'} backHref="/"/>
    {activeRequest && <Surface className={styles.activeRequest} aria-live="polite"><div><span>{activeRequest.serviceType === 'delivery' ? 'طلب التوصيل الحالي' : 'رحلتك الحالية'}</span><strong>{requestStatus(activeRequest)}</strong><p>{activeRequest.providerName} · من {activeRequest.pickupAddress} إلى {activeRequest.destinationAddress}</p>{activeRequest.serviceType === 'delivery' && activeRequest.packageDescription && <p>الطرد: {activeRequest.packageDescription} · المستلم: {activeRequest.recipientName}</p>}{activeRequest.providerPhone && <a href={`tel:${activeRequest.providerPhone}`} dir="ltr">اتصل بالمزود · {activeRequest.providerPhone}</a>}{activeRequest.serviceType === 'delivery' && (activeRequest.pickupProofPin || activeRequest.deliveryProofPin) && <div className={styles.proofPins}><span>رموز الإثبات — لا تشارك الرمز إلا عند تنفيذ الخطوة</span>{activeRequest.pickupProofPin && <b>رمز الاستلام: <em dir="ltr">{activeRequest.pickupProofPin}</em></b>}{activeRequest.deliveryProofPin && <b>رمز التسليم: <em dir="ltr">{activeRequest.deliveryProofPin}</em></b>}</div>}{activeRequest.fareStatus === 'finalized' && activeRequest.finalFare !== undefined && <p><b>السعر النهائي من خدمة: {activeRequest.finalFare.toLocaleString('ar-SY-u-nu-latn')} ل.س.</b></p>}</div>{['requested','accepted'].includes(activeRequest.status) && <ActionButton type="button" variant="secondary" onClick={() => void cancelRequest()}>إلغاء الطلب</ActionButton>}</Surface>}
    <div className={styles.journey}>
      <Surface as="form" className={styles.planner} onSubmit={findProviders}>
        <div className={styles.serviceIdentity}>
          <span className={styles.serviceIcon}><PlatformIcon name={type === 'taxi' ? 'car' : 'delivery'} size={24}/></span>
          <div><small>{type === 'taxi' ? 'النقل والتوصيل · خدمة تكسي' : 'النقل والتوصيل · مندوب توصيل'}</small><strong>{type === 'taxi' ? 'خدمة تكسي' : 'مندوب توصيل'}</strong></div>
        </div>
        <div className={styles.typeSwitch} aria-label="نوع الخدمة">
          <ActionButton type="button" variant={type === 'taxi' ? 'primary' : 'secondary'} aria-pressed={type === 'taxi'} onClick={() => { setType('taxi'); setProviders([]); setSearched(false); }}><PlatformIcon name="car"/> خدمة تكسي</ActionButton>
          <ActionButton type="button" variant={type === 'delivery' ? 'primary' : 'secondary'} aria-pressed={type === 'delivery'} onClick={() => { setType('delivery'); setProviders([]); setSearched(false); }}><PlatformIcon name="delivery"/> مندوب توصيل</ActionButton>
        </div>
        <ol className={`${styles.steps} ${type === 'delivery' ? styles.deliverySteps : ''}`} aria-label="خطوات الطلب">{type === 'delivery' ? <><li className={pickupCoordinates ? styles.done : styles.current}>الاستلام</li><li className={destination ? styles.done : ''}>التسليم</li><li className={deliveryDetailsReady ? styles.done : ''}>تفاصيل الطرد</li><li className={searched ? styles.done : ''}>اختيار المندوب</li></> : <><li className={pickupCoordinates ? styles.done : styles.current}>الانطلاق</li><li className={destination ? styles.done : ''}>الوجهة</li><li className={searched ? styles.done : ''}>اختيار السائق</li></>}</ol>
        <div className={styles.fields}>
          <label className={activePoint === 'pickup' ? styles.activeField : ''}><span><b>أ</b> {type === 'delivery' ? 'مكان استلام الطرد' : 'نقطة الانطلاق'}</span><input ref={pickupInput} value={pickup} onFocus={() => setActivePoint('pickup')} onChange={(event) => { setPickup(event.target.value); setPickupCoordinates(undefined); }} placeholder="موقعك أو اسم المكان" autoComplete="off"/></label>
          <label className={activePoint === 'destination' ? styles.activeField : ''}><span><b>ب</b> {type === 'delivery' ? 'عنوان التسليم' : 'الوجهة'}</span><input ref={destinationInput} value={destination} onFocus={() => setActivePoint('destination')} onChange={(event) => { setDestination(event.target.value); setDestinationCoordinates(undefined); }} placeholder={type === 'delivery' ? 'إلى أين نُسلّم؟' : 'إلى أين؟'} autoComplete="off"/></label>
          <label><span><b>ه</b> رقم التواصل</span><input type="tel" dir="ltr" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="09xxxxxxxx" autoComplete="tel"/></label>
        </div>
        {type === 'delivery' && <fieldset className={styles.deliveryDetails}><legend>تفاصيل الشحنة والمستلم</legend><label><span>محتوى الطرد</span><input value={packageDescription} onChange={(event) => setPackageDescription(event.target.value)} maxLength={120} placeholder="مثال: أوراق، مفاتيح، صندوق ملابس" required/></label><label><span>حجم الطرد</span><select value={packageSize} onChange={(event) => setPackageSize(event.target.value as typeof packageSize)}><option value="small">صغير — يحمله شخص واحد</option><option value="medium">متوسط</option><option value="large">كبير</option></select></label><label><span>اسم المستلم</span><input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} maxLength={80} placeholder="الاسم الكامل" autoComplete="name" required/></label><label><span>هاتف المستلم</span><input type="tel" dir="ltr" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} placeholder="09xxxxxxxx" autoComplete="tel" required/></label><label className={styles.fullField}><span>تعليمات التسليم (اختياري)</span><input value={deliveryInstructions} onChange={(event) => setDeliveryInstructions(event.target.value)} maxLength={120} placeholder="الطابق، علامة مميزة، وقت مناسب"/></label><p className={styles.proofHint}><PlatformIcon name="check" size={16}/> يُثبت المندوب الاستلام ثم التسليم برمز PIN منفصل من العميل.</p></fieldset>}
        <div className={styles.actions}>
          <ActionButton type="button" variant="secondary" onClick={useCurrentLocation}><PlatformIcon name="pin"/> استخدم موقعي</ActionButton>
          <ActionButton type="submit" disabled={loading||!canPlanRoute}><PlatformIcon name="search"/> {loading ? 'جاري البحث…' : type === 'taxi' ? 'ابحث عن سائق' : 'ابحث عن مندوب'}</ActionButton>
        </div>
        <StatusMessage tone={mapsStatus === 'error' ? 'warning' : 'info'}>{message}</StatusMessage>
        <div className={styles.fareTrust}><PlatformIcon name="check" size={17}/><div><strong>{farePolicy?.enabled ? type === 'delivery' ? 'رسوم التوصيل تحسبها خدمة' : 'السعر تحسبه خدمة بعد الرحلة' : 'التعرفة قيد الاعتماد'}</strong><small>{farePolicy?.enabled ? type === 'delivery' ? 'وفق المسافة، مع إثبات الاستلام والتسليم.' : 'وفق المسافة والانتظار، وليس بتقدير السائق.' : 'لن يبدأ العداد ولن يظهر سعر غير معتمد.'}</small></div></div>
        <ActionLink href="/business-profiles/new" variant="quiet" className={styles.providerEntry}>هل تريد العمل كسائق أو مندوب؟</ActionLink>
      </Surface>
      <section className={styles.mapStage} aria-label="خريطة الرحلة" data-map-status={mapsStatus}>
        <div ref={mapNode} className={styles.mapCanvas}/>
        {mapsStatus !== 'ready' && <div className={styles.mapFallback} role={mapsStatus === 'error' ? 'status' : undefined}>
          <div className={styles.fallbackHeading}><span><PlatformIcon name={type === 'taxi' ? 'car' : 'delivery'} size={26}/></span><div><small>{mapsStatus === 'loading' ? 'جارٍ الاتصال بالخريطة' : 'المسار النصي متاح'}</small><strong>{type === 'taxi' ? 'خطّط رحلتك الآن' : 'حدّد مسار الطرد'}</strong></div></div>
          <div className={styles.routePreview}>
            <div className={styles.routePoint}><b>أ</b><span><small>{type === 'taxi' ? 'نقطة الانطلاق' : 'مكان الاستلام'}</small><strong>{pickup.trim() || 'لم تُحدّد بعد'}</strong></span></div>
            <div className={styles.routeLine}/>
            <div className={styles.routePoint}><b>ب</b><span><small>{type === 'taxi' ? 'الوجهة' : 'مكان التسليم'}</small><strong>{destination.trim() || 'لم تُحدّد بعد'}</strong></span></div>
          </div>
          <p>{mapsStatus === 'loading' ? 'يمكنك إدخال العناوين بينما نجهّز الخريطة.' : 'تابع طلبك دون الخريطة؛ البحث بالموقع والعناوين يعمل بصورة طبيعية.'}</p>
        </div>}
        {mapsStatus === 'ready' && <div className={styles.mapHint}>انقر على الخريطة لتحديد {activePoint === 'pickup' ? 'نقطة الانطلاق' : 'الوجهة'}</div>}
      </section>
    </div>
    {loading ? <SkeletonGrid count={4} label="جاري البحث عن مزودي الخدمة"/> : providers.length ? <section className={styles.results} aria-label="مزودو النقل والتوصيل">
      {providers.map((provider, index) => <Surface as="article" className={styles.provider} key={provider.id}>
        <div className={styles.providerTop}><span className={styles.rank}>{index + 1}</span><div><span className={styles.badge}>{provider.availability === 'available' ? 'متاح الآن' : provider.availability === 'busy' ? 'مشغول' : 'حسب الاتفاق'}</span><h2>{provider.name} {provider.trustStatus === 'approved' && <small aria-label="موثق">✓</small>}</h2><p>{provider.addressAr ?? provider.cityCode}{provider.distanceKm !== undefined ? ` · ${provider.distanceKm.toFixed(1)} كم` : ''}{provider.rating !== undefined ? ` · ⭐ ${provider.rating.toFixed(1)}` : ''}</p></div></div>
        <div className={styles.providerActions}><ActionButton type="button" disabled={!farePolicy?.enabled || !!activeRequest && openStatuses.includes(activeRequest.status) || requestingProviderId === provider.id} onClick={() => void requestProvider(provider)}>{requestingProviderId === provider.id ? 'جارٍ الإرسال…' : farePolicy?.enabled ? type === 'taxi' ? 'اختر هذا السائق' : 'اختر هذا المندوب' : 'التعرفة قيد الاعتماد'}</ActionButton><ActionLink href={`/business-profiles/${encodeURIComponent(provider.id)}?source=mobility`} variant="quiet">عرض الملف</ActionLink></div>
      </Surface>)}
    </section> : searched && <EmptyState icon={<PlatformIcon name={type === 'taxi' ? 'car' : 'cart'} size={34}/>} title="الخدمة تعمل، لكن لا يوجد مزود معتمد منشور هنا" description="لن نعرض سائقًا وهميًا. وسّع البحث على الخريطة أو ساعد مزودي النقل والتوصيل في منطقتك على التسجيل." actions={<><ActionLink href={`/map?q=${encodeURIComponent(type === 'taxi' ? 'تاكسي' : 'مندوب توصيل')}`}>توسيع البحث على الخريطة</ActionLink><ActionLink href="/business-profiles/new" variant="secondary">تسجيل مزود خدمة</ActionLink></>}/>} 
    <p className={styles.disclaimer}>يبدأ العداد فقط بعد وصول المزود وإشعارك. الدفع الإلكتروني والتتبع في الخلفية غير مفعّلين بعد. <Link href="/search">عرض كل الخدمات</Link></p>
  </PageShell>;
}
