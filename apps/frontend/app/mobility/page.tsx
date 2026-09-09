'use client';

import Link from 'next/link';
import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, type PublicBusinessProfile } from '../../lib/api-client';
import { ActionButton, ActionLink, EmptyState, PageHeader, PageShell, SkeletonGrid, StatusMessage, Surface } from '../components/ui-primitives';
import { PlatformIcon } from '../components/platform-icon';
import styles from './mobility.module.css';

type Coordinates = { latitude: number; longitude: number };
type Place = { formatted_address?: string; geometry?: { location?: { lat(): number; lng(): number } } };
type Listener = { remove(): void };
type Autocomplete = { addListener(name: 'place_changed', callback: () => void): Listener; getPlace(): Place; unbindAll(): void };
type MobilityMapsApi = {
  places?: { Autocomplete: new (input: HTMLInputElement, options: object) => Autocomplete };
  Geocoder?: new () => { geocode(request: object, callback: (results: Array<{ formatted_address?: string }> | null, status: string) => void): void };
};
type MobilityWindow = Window & { google?: { maps?: MobilityMapsApi }; initKhedmahMobility?: () => void };

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
const SCRIPT_ID = 'khedmah-google-maps';
const categoryFor = (type: 'taxi' | 'delivery') => type === 'taxi' ? 'taxi' : 'delivery_courier';

function MobilityContent() {
  const router = useRouter();
  const params = useSearchParams();
  const type = params.get('type') === 'delivery' ? 'delivery' : 'taxi';
  const pickupInput = useRef<HTMLInputElement>(null);
  const destinationInput = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<'taxi' | 'delivery' | null>(null);
  const changingType = pendingType !== null && pendingType !== type;
  const currentType = useRef(type);
  currentType.current = type;
  const lifetime = useRef(0);
  const searchSequence = useRef(0);
  const locationSequence = useRef(0);
  const searchInFlight = useRef(false);
  const [locating, setLocating] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<Coordinates>();
  const [providers, setProviders] = useState<PublicBusinessProfile[]>([]);
  const [placesReady, setPlacesReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [message, setMessage] = useState(MAPS_KEY ? 'اكتب العنوان واختره من اقتراحات Google.' : 'اقتراحات Google غير مهيأة حاليًا؛ استخدم موقعك الحالي للبحث القريب.');

  const validCoordinates = (point: Coordinates) => Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;

  // Request authority is revoked immediately, not only when a future render runs.
  function invalidateSearch() {
    searchSequence.current += 1;
    searchInFlight.current = false;
    setLoading(false); setProviders([]); setSearched(false); setSearchError('');
  }
  function editPickup(value: string) {
    locationSequence.current += 1;
    setLocating(false); setPickup(value); setPickupCoordinates(undefined);
    invalidateSearch();
  }

  useEffect(() => {
    lifetime.current += 1;
    return () => {
      lifetime.current += 1;
      searchSequence.current += 1;
      locationSequence.current += 1;
      searchInFlight.current = false;
    };
  }, []);

  useEffect(() => {
    invalidateSearch(); setPendingType(null);
  }, [type]);

  function selectType(next: 'taxi' | 'delivery') {
    if (next === type && !changingType) return;
    invalidateSearch(); setPendingType(next);
    const query = new URLSearchParams(params.toString());
    query.set('type', next);
    router.push(`/mobility?${query}`, { scroll: false });
  }

  useEffect(() => {
    if (!MAPS_KEY) return;
    const runtime = window as MobilityWindow;
    let cancelled = false;
    let initialized = false;
    let pickupAutocomplete: Autocomplete | undefined;
    let destinationAutocomplete: Autocomplete | undefined;
    const listeners: Listener[] = [];
    const previousInitializer = runtime.initKhedmahMobility;
    let script: HTMLScriptElement | null = null;
    setPlacesReady(false);
    const fail = () => {
      if (cancelled) return;
      setPlacesReady(false);
      setMessage('تعذر تحميل اقتراحات Google. يمكنك استخدام موقعك أو اختيار المدينة من صفحة البحث.');
    };
    const initialize = () => {
      if (cancelled || initialized || !runtime.google?.maps?.places || !pickupInput.current || !destinationInput.current) return;
      try {
        initialized = true;
        pickupAutocomplete = new runtime.google.maps.places.Autocomplete(pickupInput.current, { fields: ['formatted_address', 'geometry'], componentRestrictions: { country: 'sy' } });
        destinationAutocomplete = new runtime.google.maps.places.Autocomplete(destinationInput.current, { fields: ['formatted_address', 'geometry'], componentRestrictions: { country: 'sy' } });
        listeners.push(pickupAutocomplete.addListener('place_changed', () => {
          if (cancelled) return;
          locationSequence.current += 1; setLocating(false); invalidateSearch();
          const place = pickupAutocomplete?.getPlace();
          const location = place?.geometry?.location;
          const point = location ? { latitude: location.lat(), longitude: location.lng() } : undefined;
          setPickupCoordinates(point && validCoordinates(point) ? point : undefined);
          if (!point || !validCoordinates(point)) { setMessage('اختر موقع انطلاق صالحاً من قائمة اقتراحات Google.'); return; }
          setPickup(place?.formatted_address ?? pickupInput.current?.value ?? '');
          setMessage('تم تحديد موقع الانطلاق.');
        }));
        listeners.push(destinationAutocomplete.addListener('place_changed', () => {
          if (cancelled) return;
          const place = destinationAutocomplete?.getPlace();
          setDestination(place?.formatted_address ?? destinationInput.current?.value ?? '');
        }));
        setPlacesReady(true);
      } catch { fail(); }
    };

    runtime.initKhedmahMobility = initialize;
    script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (runtime.google?.maps?.places) initialize();
    else {
      if (!script) {
        script = document.createElement('script');
        script.id = SCRIPT_ID; script.async = true; script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&language=ar&region=SY&libraries=places&loading=async&callback=initKhedmahMobility`;
        script.addEventListener('load', initialize);
        script.addEventListener('error', fail);
        document.head.appendChild(script);
      } else {
        script.addEventListener('load', initialize);
        script.addEventListener('error', fail);
      }
    }
    const timeout = window.setTimeout(() => { if (!initialized) fail(); }, 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      listeners.forEach(listener => listener.remove());
      pickupAutocomplete?.unbindAll(); destinationAutocomplete?.unbindAll();
      script?.removeEventListener('load', initialize);
      script?.removeEventListener('error', fail);
      // Another mounted route may have become the owner of this shared callback.
      if (runtime.initKhedmahMobility === initialize) {
        if (previousInitializer) runtime.initKhedmahMobility = previousInitializer;
        else delete runtime.initKhedmahMobility;
      }
    };
  }, []);

  function useCurrentLocation() {
    if (!navigator.geolocation) { setMessage('تحديد الموقع غير مدعوم في هذا المتصفح. اختر المدينة من صفحة البحث.'); return; }
    const generation = lifetime.current;
    const attempt = ++locationSequence.current;
    const active = () => generation === lifetime.current && attempt === locationSequence.current;
    invalidateSearch(); setPickupCoordinates(undefined); setLocating(true);
    setMessage('جاري تحديد موقع الانطلاق…');
    const fail = () => {
      if (!active()) return;
      setLocating(false);
      setMessage('تعذر الوصول إلى موقعك. يمكنك اختيار المدينة من صفحة البحث دون منح إذن الموقع.');
    };
    try {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        if (!active()) return;
        const coordinates = { latitude: coords.latitude, longitude: coords.longitude };
        if (!validCoordinates(coordinates)) { fail(); return; }
        const fallback = `${coordinates.latitude.toFixed(6)},${coordinates.longitude.toFixed(6)}`;
        setPickupCoordinates(coordinates); setPickup(fallback); setLocating(false);
        setMessage('تم تحديد موقعك الحالي.');
        const maps = (window as MobilityWindow).google?.maps;
        if (!maps?.Geocoder) return;
        try {
          new maps.Geocoder().geocode({ location: { lat: coordinates.latitude, lng: coordinates.longitude } }, (results, status) => {
            if (!active()) return;
            const address = status === 'OK' ? results?.[0]?.formatted_address : undefined;
            setPickup(address ?? fallback);
          });
        } catch { /* A reverse-geocoding failure must not discard valid coordinates. */ }
      }, fail, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    } catch { fail(); }
  }

  async function findProviders(event?: FormEvent) {
    event?.preventDefault();
    if (searchInFlight.current || locating || changingType) return;
    if (!pickupCoordinates || !validCoordinates(pickupCoordinates)) {
      setMessage('استخدم موقعك الحالي أو اختر موقع الانطلاق من الاقتراحات، أو ابحث حسب المدينة.');
      return;
    }
    const generation = lifetime.current;
    const request = ++searchSequence.current;
    const requestedType = type;
    const active = () => generation === lifetime.current && request === searchSequence.current && requestedType === currentType.current;
    searchInFlight.current = true;
    setLoading(true); setSearched(false); setSearchError(''); setProviders([]);
    try {
      const result = await api.search.query({
        categoryCode: categoryFor(type), type: 'business', map: true,
        latitude: pickupCoordinates.latitude, longitude: pickupCoordinates.longitude
      });
      if (!active()) return;
      setProviders(result.businesses.slice(0, 12)); setSearched(true);
      setMessage(result.businesses.length ? 'هذه الأنشطة المطابقة لبحثك؛ تواصل مع المزود لتأكيد التوفر.' : 'لا توجد نتائج مطابقة لهذا النوع ضمن البحث الحالي.');
    } catch (cause) {
      if (active()) setSearchError(cause instanceof Error ? cause.message : 'تعذر البحث عن مقدمي الخدمة.');
    } finally {
      if (active()) { searchInFlight.current = false; setLoading(false); }
    }
  }

  function openRoute() {
    if (!pickup.trim() || !destination.trim()) {
      setMessage('أدخل موقع الانطلاق والوجهة لفتح المسار.');
      return;
    }
    const route = new URL('https://www.google.com/maps/dir/');
    route.searchParams.set('api', '1');
    route.searchParams.set('origin', pickup.trim());
    route.searchParams.set('destination', destination.trim());
    route.searchParams.set('travelmode', 'driving');
    window.open(route.toString(), '_blank', 'noopener,noreferrer');
  }

  return <PageShell className={styles.page} label="خدمة على الطريق">
    <PageHeader eyebrow="بحث حسب الموقع" title="خدمة على الطريق" description="حدد نقطة الانطلاق لتجد الأنشطة المعتمدة الأقرب، ثم تواصل معها مباشرة. لا توجد رحلة مؤكدة قبل قبول المزود." backHref="/"/>
    <Surface as="form" className={styles.planner} onSubmit={findProviders} role="search" aria-label="البحث عن تكسي أو مندوب" aria-busy={loading || changingType}>
      <div className={styles.typeSwitch} aria-label="نوع الخدمة">
        <ActionButton type="button" variant={type === 'taxi' ? 'primary' : 'secondary'} aria-pressed={type === 'taxi'} onClick={() => selectType('taxi')}><PlatformIcon name="car"/> تاكسي</ActionButton>
        <ActionButton type="button" variant={type === 'delivery' ? 'primary' : 'secondary'} aria-pressed={type === 'delivery'} onClick={() => selectType('delivery')}><PlatformIcon name="cart"/> مندوب توصيل</ActionButton>
      </div>
      <div className={styles.fields}>
        <label>موقع الانطلاق<input ref={pickupInput} value={pickup} onChange={(event) => editPickup(event.target.value)} placeholder="اختر عنوانًا من Google" autoComplete="off"/></label>
        <label>الوجهة<input ref={destinationInput} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="إلى أين؟" autoComplete="off"/></label>
      </div>
      <div className={styles.actions}>
        <ActionButton type="button" variant="secondary" onClick={useCurrentLocation} disabled={locating}><PlatformIcon name="pin"/> استخدم موقعي</ActionButton>
        <ActionButton type="submit" disabled={loading || locating || changingType}><PlatformIcon name="search"/> {loading ? 'جاري البحث…' : `ابحث عن ${type === 'taxi' ? 'تاكسي' : 'مندوب'}`}</ActionButton>
        <ActionButton type="button" variant="secondary" onClick={openRoute}><PlatformIcon name="pin"/> افتح المسار في Google</ActionButton>
      </div>
      <ActionLink variant="secondary" href={`/search?type=business&categoryCode=${categoryFor(type)}`}>البحث حسب المدينة دون تحديد الموقع</ActionLink>
      {searchError && <StatusMessage tone="danger">{searchError} <ActionButton type="button" variant="secondary" onClick={() => void findProviders()}>إعادة البحث</ActionButton></StatusMessage>}
      <StatusMessage tone={placesReady || pickupCoordinates ? 'info' : 'warning'}>{message}</StatusMessage>
    </Surface>

    {loading ? <SkeletonGrid count={4} label="جاري البحث عن مزودي الخدمة"/> : providers.length ? <section className={styles.results} aria-label="مزودو النقل والتوصيل">
      {providers.map((provider) => <Surface as="article" className={styles.provider} key={provider.id}>
        <div><span className={styles.badge}>{type === 'taxi' ? 'تاكسي' : 'توصيل'}</span><h2>{provider.name}</h2><p>{provider.addressAr ?? provider.cityCode}{typeof provider.distanceKm === 'number' && Number.isFinite(provider.distanceKm) && provider.distanceKm >= 0 ? ` · ${provider.distanceKm.toFixed(1)} كم` : ''}</p></div>
        <div className={styles.providerActions}><ActionLink href={`/business-profiles/${encodeURIComponent(provider.id)}?source=mobility`}>عرض النشاط والتواصل</ActionLink>{provider.phone && <a href={`tel:${provider.phone}`}>اتصال</a>}</div>
      </Surface>)}
    </section> : searched && <EmptyState icon={<PlatformIcon name={type === 'taxi' ? 'car' : 'cart'} size={34}/>} title="لا يوجد مزود معتمد قريب حاليًا" description="يمكنك توسيع البحث عبر الخريطة أو العودة لاحقًا بعد انضمام مزودين جدد." actions={<><ActionLink href={`/map?categoryCode=${categoryFor(type)}`}>البحث على الخريطة</ActionLink><ActionLink href="/business-profiles/new" variant="secondary">سجّل نشاط نقل أو توصيل</ActionLink></>}/>} 
    <p className={styles.disclaimer}>خدمة تعرض مزودي الخدمة وتسهّل الاتصال فقط؛ الاتفاق والسعر والقبول يتم مباشرة مع المزود. <Link href="/search">عرض كل الخدمات</Link></p>
  </PageShell>;
}

export default function MobilityPage() {
  return <Suspense fallback={<PageShell label="خدمة على الطريق" className={styles.page}><SkeletonGrid count={4} label="جاري تحميل الطريق" /></PageShell>}><MobilityContent /></Suspense>;
}
