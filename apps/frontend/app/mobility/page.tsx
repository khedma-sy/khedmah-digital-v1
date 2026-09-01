'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './mobility.module.css';

type Coordinates = { latitude: number; longitude: number };
type GooglePoint = { lat(): number; lng(): number };
type Place = { formatted_address?: string; geometry?: { location?: GooglePoint } };
type Autocomplete = { addListener(name: 'place_changed', callback: () => void): void; getPlace(): Place };
type MapHandle = { panTo(point: { lat: number; lng: number }): void; setZoom(zoom: number): void; fitBounds(bounds: BoundsHandle, padding?: number): void; addListener(name: 'click', callback: (event: { latLng?: GooglePoint }) => void): void };
type MarkerHandle = { setMap(map: MapHandle | null): void };
type LineHandle = { setMap(map: MapHandle | null): void };
type BoundsHandle = { extend(point: { lat: number; lng: number }): void };
type MobilityMapsApi = {
  Map: new (node: HTMLElement, options: object) => MapHandle;
  Marker: new (options: object) => MarkerHandle;
  Polyline: new (options: object) => LineHandle;
  LatLngBounds: new () => BoundsHandle;
  places?: { Autocomplete: new (input: HTMLInputElement, options: object) => Autocomplete };
  Geocoder?: new () => { geocode(request: object, callback: (results: Place[] | null, status: string) => void): void };
};
type MobilityWindow = Window & { google?: { maps?: MobilityMapsApi }; initKhedmahMobility?: () => void; gm_authFailure?: () => void };

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const SCRIPT_ID = 'khedmah-google-maps';
const DEFAULT_CENTER = { latitude: 33.5138, longitude: 36.2765 };
const categoryFor = (type: 'taxi' | 'delivery') => type === 'taxi' ? 'taxi' : 'delivery_courier';
const toMapPoint = ({ latitude, longitude }: Coordinates) => ({ lat: latitude, lng: longitude });

export default function MobilityPage() {
  const pickupInput = useRef<HTMLInputElement>(null);
  const destinationInput = useRef<HTMLInputElement>(null);
  const mapNode = useRef<HTMLDivElement>(null);
  const map = useRef<MapHandle | null>(null);
  const overlays = useRef<Array<MarkerHandle | LineHandle>>([]);
  const activePointRef = useRef<'pickup' | 'destination'>('pickup');
  const [type, setType] = useState<'taxi' | 'delivery'>('taxi');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<Coordinates>();
  const [destinationCoordinates, setDestinationCoordinates] = useState<Coordinates>();
  const [activePoint, setActivePoint] = useState<'pickup' | 'destination'>('pickup');
  const [providers, setProviders] = useState<PublicBusinessProfile[]>([]);
  const [mapsStatus, setMapsStatus] = useState<'loading' | 'ready' | 'error'>(MAPS_KEY ? 'loading' : 'error');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState(MAPS_KEY ? 'حدد نقطة الانطلاق والوجهة، أو اكتب العنوان وسنحاول تحديده.' : 'الخريطة غير مهيأة حاليًا؛ استخدم موقعك الحالي للبحث القريب.');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('type') === 'delivery') setType('delivery');
  }, []);

  useEffect(() => { activePointRef.current = activePoint; }, [activePoint]);

  const reverseGeocode = useCallback((coordinates: Coordinates, target: 'pickup' | 'destination') => {
    const maps = (window as MobilityWindow).google?.maps;
    const fallback = `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
    const apply = (value: string) => target === 'pickup' ? setPickup(value) : setDestination(value);
    if (!maps?.Geocoder) return apply(fallback);
    new maps.Geocoder().geocode({ location: toMapPoint(coordinates) }, (results, status) => {
      apply(status === 'OK' ? results?.[0]?.formatted_address ?? fallback : fallback);
    });
  }, []);

  const renderMap = useCallback(() => {
    if (!map.current || !(window as MobilityWindow).google?.maps) return;
    const maps = (window as MobilityWindow).google!.maps!;
    overlays.current.forEach((overlay) => overlay.setMap(null));
    overlays.current = [];
    const bounds = new maps.LatLngBounds();
    const points: Coordinates[] = [];
    if (pickupCoordinates) {
      const point = toMapPoint(pickupCoordinates);
      bounds.extend(point); points.push(pickupCoordinates);
      overlays.current.push(new maps.Marker({ map: map.current, position: point, label: 'أ', title: 'نقطة الانطلاق' }));
    }
    if (destinationCoordinates) {
      const point = toMapPoint(destinationCoordinates);
      bounds.extend(point); points.push(destinationCoordinates);
      overlays.current.push(new maps.Marker({ map: map.current, position: point, label: 'ب', title: 'الوجهة' }));
    }
    providers.forEach((provider) => {
      if (provider.lat === undefined || provider.lng === undefined) return;
      const point = { lat: provider.lat, lng: provider.lng };
      bounds.extend(point); points.push({ latitude: provider.lat, longitude: provider.lng });
      overlays.current.push(new maps.Marker({ map: map.current, position: point, title: provider.name, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' } }));
    });
    if (pickupCoordinates && destinationCoordinates) {
      overlays.current.push(new maps.Polyline({ map: map.current, path: [toMapPoint(pickupCoordinates), toMapPoint(destinationCoordinates)], geodesic: true, strokeColor: '#075591', strokeOpacity: .8, strokeWeight: 4 }));
    }
    if (points.length > 1) map.current.fitBounds(bounds, 72);
    else if (points.length === 1) { map.current.panTo(toMapPoint(points[0])); map.current.setZoom(15); }
  }, [destinationCoordinates, pickupCoordinates, providers]);

  useEffect(renderMap, [renderMap]);

  useEffect(() => {
    if (!MAPS_KEY) return;
    const runtime = window as MobilityWindow;
    let cancelled = false;
    const previousAuthFailure = runtime.gm_authFailure;

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
    const maps = (window as MobilityWindow).google?.maps;
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
      if (!destination.trim()) { setMessage('أدخل الوجهة لإكمال الرحلة.'); return; }
      setPickupCoordinates(resolvedPickup);
      if (resolvedDestination) setDestinationCoordinates(resolvedDestination);
      const result = await api.search.query({ categoryCode: categoryFor(type), type: 'business', map: true, latitude: resolvedPickup.latitude, longitude: resolvedPickup.longitude });
      const nearby = result.businesses.slice(0, 12);
      setProviders(nearby); setSearched(true);
      setMessage(nearby.length ? `وجدنا ${nearby.length} مزودًا معتمدًا مرتّبًا حسب القرب والتوفر.` : `لا توجد حاليًا ملفات ${type === 'taxi' ? 'تاكسي' : 'مندوب توصيل'} معتمدة منشورة قرب هذه النقطة.`);
    } catch (cause) {
      setProviders([]); setSearched(true); setMessage(cause instanceof Error ? cause.message : 'تعذر البحث عن مقدمي الخدمة.');
    } finally { setLoading(false); }
  }

  function openRoute() {
    if (!pickup || !destination) return setMessage('أدخل نقطة الانطلاق والوجهة أولًا.');
    const route = new URL('https://www.google.com/maps/dir/');
    route.searchParams.set('api', '1'); route.searchParams.set('origin', pickup); route.searchParams.set('destination', destination); route.searchParams.set('travelmode', 'driving');
    window.open(route.toString(), '_blank', 'noopener,noreferrer');
  }

  return <PageShell className={styles.page} label="التاكسي والتوصيل">
    <PageHeader eyebrow="تنقّل وتوصيل" title={type === 'taxi' ? 'إلى أين تريد الذهاب؟' : 'ماذا تريد أن نوصّل؟'} description="حدد الانطلاق والوجهة، ثم اختر مزودًا معتمدًا قريبًا وتواصل معه مباشرة." backHref="/"/>
    <div className={styles.journey}>
      <Surface as="form" className={styles.planner} onSubmit={findProviders}>
        <div className={styles.typeSwitch} aria-label="نوع الخدمة">
          <ActionButton type="button" variant={type === 'taxi' ? 'primary' : 'secondary'} aria-pressed={type === 'taxi'} onClick={() => { setType('taxi'); setProviders([]); setSearched(false); }}><PlatformIcon name="car"/> مشوار تاكسي</ActionButton>
          <ActionButton type="button" variant={type === 'delivery' ? 'primary' : 'secondary'} aria-pressed={type === 'delivery'} onClick={() => { setType('delivery'); setProviders([]); setSearched(false); }}><PlatformIcon name="cart"/> مندوب توصيل</ActionButton>
        </div>
        <ol className={styles.steps} aria-label="خطوات الطلب"><li className={pickupCoordinates ? styles.done : styles.current}>الانطلاق</li><li className={destination ? styles.done : ''}>الوجهة</li><li className={searched ? styles.done : ''}>اختيار المزود</li></ol>
        <div className={styles.fields}>
          <label className={activePoint === 'pickup' ? styles.activeField : ''}><span><b>أ</b> نقطة الانطلاق</span><input ref={pickupInput} value={pickup} onFocus={() => setActivePoint('pickup')} onChange={(event) => { setPickup(event.target.value); setPickupCoordinates(undefined); }} placeholder="موقعك أو اسم المكان" autoComplete="off"/></label>
          <label className={activePoint === 'destination' ? styles.activeField : ''}><span><b>ب</b> الوجهة</span><input ref={destinationInput} value={destination} onFocus={() => setActivePoint('destination')} onChange={(event) => { setDestination(event.target.value); setDestinationCoordinates(undefined); }} placeholder="إلى أين؟" autoComplete="off"/></label>
        </div>
        <div className={styles.actions}>
          <ActionButton type="button" variant="secondary" onClick={useCurrentLocation}><PlatformIcon name="pin"/> موقعي الحالي</ActionButton>
          <ActionButton type="submit" disabled={loading}><PlatformIcon name="search"/> {loading ? 'جاري البحث…' : `اعرض ${type === 'taxi' ? 'سيارات التاكسي' : 'المندوبين'}`}</ActionButton>
          <ActionButton type="button" variant="secondary" onClick={openRoute}><PlatformIcon name="pin"/> المسار في Google</ActionButton>
        </div>
        <StatusMessage tone={mapsStatus === 'error' ? 'warning' : 'info'}>{message}</StatusMessage>
      </Surface>
      <section className={styles.mapStage} aria-label="خريطة الرحلة" data-map-status={mapsStatus}>
        <div ref={mapNode} className={styles.mapCanvas}/>
        {mapsStatus !== 'ready' && <div className={styles.mapFallback}><PlatformIcon name="pin" size={32}/><strong>{mapsStatus === 'loading' ? 'جاري تجهيز الخريطة…' : 'الخريطة غير متاحة حاليًا'}</strong><span>يمكنك متابعة البحث باستخدام موقعك الحالي.</span></div>}
        <div className={styles.mapHint}>انقر على الخريطة لتحديد {activePoint === 'pickup' ? 'نقطة الانطلاق' : 'الوجهة'}</div>
      </section>
    </div>
    {loading ? <SkeletonGrid count={4} label="جاري البحث عن مزودي الخدمة"/> : providers.length ? <section className={styles.results} aria-label="مزودو النقل والتوصيل">
      {providers.map((provider, index) => <Surface as="article" className={styles.provider} key={provider.id}>
        <div className={styles.providerTop}><span className={styles.rank}>{index + 1}</span><div><span className={styles.badge}>{provider.availability === 'available' ? 'متاح الآن' : provider.availability === 'busy' ? 'مشغول' : 'حسب الاتفاق'}</span><h2>{provider.name} {provider.trustStatus === 'approved' && <small aria-label="موثق">✓</small>}</h2><p>{provider.addressAr ?? provider.cityCode}{provider.distanceKm !== undefined ? ` · ${provider.distanceKm.toFixed(1)} كم` : ''}{provider.rating !== undefined ? ` · ⭐ ${provider.rating.toFixed(1)}` : ''}</p></div></div>
        <div className={styles.providerActions}><ActionLink href={`/business-profiles/${encodeURIComponent(provider.id)}?source=mobility`}>الملف والتواصل</ActionLink>{provider.phone && <a href={`tel:${provider.phone}`}>اتصال مباشر</a>}</div>
      </Surface>)}
    </section> : searched && <EmptyState icon={<PlatformIcon name={type === 'taxi' ? 'car' : 'cart'} size={34}/>} title="الخدمة تعمل، لكن لا يوجد مزود معتمد منشور هنا" description="لن نعرض سائقًا وهميًا. وسّع البحث على الخريطة أو ساعد مزودي النقل والتوصيل في منطقتك على التسجيل." actions={<><ActionLink href={`/map?q=${encodeURIComponent(type === 'taxi' ? 'تاكسي' : 'مندوب توصيل')}`}>توسيع البحث على الخريطة</ActionLink><ActionLink href="/business-profiles/new" variant="secondary">تسجيل مزود خدمة</ActionLink></>}/>} 
    <p className={styles.disclaimer}>هذه النسخة للعثور على مزود معتمد والتواصل المباشر؛ لا تعني حجزًا أو تسعيرًا أو تتبعًا لحظيًا حتى يقبل المزود. <Link href="/search">عرض كل الخدمات</Link></p>
  </PageShell>;
}
